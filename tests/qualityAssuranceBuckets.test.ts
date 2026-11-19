import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { act, createElement } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { WorkItemSummary } from '../src/ado/queryEngine.ts'
import type { WorkItemPatch } from '../src/ado/workItemPatch.ts'
import type { QualityAssuranceRawData } from '../src/ado/workItemsApi.ts'
import type { WorkItemUpdate } from '../src/features/standup/utils/qualityAssuranceBuckets.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
})
after(async () => { await server.close(); dom.window.close() })
const { bucketQualityAssuranceItems, classifyQualityAssuranceItem, resolveQualityAssuranceProjectConfig } =
  await server.ssrLoadModule('/src/features/standup/utils/qualityAssuranceBuckets.ts')
const { useQualityAssuranceBuckets } = await server.ssrLoadModule('/src/features/standup/hooks/useQualityAssuranceBuckets.ts')

test('Failed Testing defaults to Back in development', (t) => {
  t.mock.method(Date, 'now', () => now)
  const config = resolveQualityAssuranceProjectConfig({ id: 'team', projectName: 'project' })
  const item: WorkItemSummary = {
    id: 2,
    title: 'Failed QA work',
    state: 'Failed Testing',
    status: 'Active',
    createdAt: daysAgo(10),
    recentActivityAt: daysAgo(0.5),
  }
  const updates: WorkItemUpdate[] = [
    {
      revisedDate: daysAgo(1),
      fields: { 'System.State': { oldValue: 'Active', newValue: 'Available for Testing' } },
    },
    {
      revisedDate: daysAgo(0.5),
      fields: { 'System.State': { oldValue: 'Available for Testing', newValue: 'Failed Testing' } },
    },
  ]

  assert.equal(classifyQualityAssuranceItem(item, updates, config), 'needs-development')
  assert.deepEqual(
    bucketQualityAssuranceItems([item], { [item.id]: updates }, config)
      .find((bucket) => bucket.id === 'needs-development')?.items.map((entry) => entry.id),
    [item.id],
  )
})

const now = Date.parse('2026-10-19T12:00:00Z')
const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString()
const reassignment: WorkItemUpdate[] = [{
  revisedDate: daysAgo(0.2),
  fields: {
    'System.AssignedTo': { oldValue: 'Previous tester', newValue: 'Current tester' },
    'System.ChangedDate': { newValue: daysAgo(0.2) },
  },
}]

for (const lookbackDays of [21, 1]) {
  for (const state of ['New', 'Approved']) {
    for (const strictNewStates of [false, true]) {
      test(`${state} creation lookback is ${lookbackDays} days (strict new states: ${strictNewStates})`, (t) => {
        t.mock.method(Date, 'now', () => now)
        const config = {
          ...resolveQualityAssuranceProjectConfig({ id: 'team', projectName: 'project' }),
          lookbackDays,
          strictNewStates,
          stateGroups: {
            testing: ['Available for Testing'],
            development: ['Active', 'Approved'],
            done: ['Done'],
            new: ['New', 'Approved'],
          },
        }
        const item: WorkItemSummary = {
          id: 1,
          title: 'Recently reassigned work',
          state,
          status: 'New',
          recentActivityAt: daysAgo(0.2),
        }

        for (const [createdAt, expected] of [
          [daysAgo(40), null],
          [daysAgo(2), lookbackDays === 21 ? 'new' : null],
          [daysAgo(0.5), 'new'],
          [daysAgo(lookbackDays), 'new'],
          [new Date(now - lookbackDays * 24 * 60 * 60 * 1000 - 1).toISOString(), null],
          [undefined, null],
          ['invalid', null],
          [daysAgo(-1), null],
        ] as const) {
          const candidate = { ...item, createdAt }
          assert.equal(classifyQualityAssuranceItem(candidate, reassignment, config), expected, `createdAt: ${createdAt}`)
          const newBucket = bucketQualityAssuranceItems([candidate], { 1: reassignment }, config)
            .find((bucket) => bucket.id === 'new')
          assert.deepEqual(newBucket?.items.map((entry) => entry.id), expected === 'new' ? [1] : [])
        }

        const taggedItem = { ...item, createdAt: daysAgo(40), tags: ['Explicit new'] }
        const tagConfig = { ...config, tagGroups: { ...config.tagGroups, new: ['Explicit new'] } }
        assert.equal(classifyQualityAssuranceItem(taggedItem, reassignment, tagConfig), 'new')
        assert.deepEqual(
          bucketQualityAssuranceItems([taggedItem], { 1: reassignment }, tagConfig)
            .find((bucket) => bucket.id === 'new')?.items.map((entry) => entry.id),
          [1],
        )

        if (state === 'Approved') {
          const qaTransition: WorkItemUpdate = {
            revisedDate: daysAgo(0.5),
            fields: { 'System.State': { oldValue: 'Active', newValue: 'Available for Testing' } },
          }
          assert.equal(
            classifyQualityAssuranceItem({ ...item, createdAt: daysAgo(0.5) }, [qaTransition, ...reassignment], config),
            'needs-development',
          )
        }
      })
    }
  }
}

test('a saved QA item keeps only its newest history, not an older read or one made before a reload', async (t) => {
  const team = { id: 'team', orgName: 'org', projectName: 'Project', areaPath: 'Project' }
  const url = 'https://dev.azure.com/org/Project/_workitems/edit/1'
  const item: WorkItemSummary = { id: 1, title: 'Item', state: 'Active', status: 'Active', workItemUrl: url, createdAt: daysAgo(10) }
  const history = (label: string): WorkItemUpdate[] => [{ revisedDate: daysAgo(0), fields: { 'System.Title': { newValue: label } } }]
  let served: QualityAssuranceRawData = { candidates: [item], updatesByItemId: { 1: history('loaded') }, failedUpdateItemIds: [] }
  const reads: Array<(label: string) => void> = []
  let publish: (patch: WorkItemPatch) => void = () => {}
  const engine = {
    getQualityAssuranceRawData: async () => served,
    getQualityAssuranceItemHistory: () => new Promise<Omit<QualityAssuranceRawData, 'candidates'>>((resolve) => {
      reads.push((label) => resolve({ updatesByItemId: { 1: history(label) }, failedUpdateItemIds: [] }))
    }),
    subscribeWorkItemPatches: (listener: (patch: WorkItemPatch) => void) => {
      publish = listener
      return () => {}
    },
  }
  let reloadNonce = 0
  let shown = ''
  function Hook() {
    const { qaUpdatesByItemId } = useQualityAssuranceBuckets({ adoQueryEngine: engine, selectedTeam: team, reloadNonce, enabled: true })
    shown = String(qaUpdatesByItemId[1]?.[0].fields['System.Title']?.newValue)
    return null
  }
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  const render = () => act(async () => root.render(createElement(Hook)))
  const save = (title: string) => act(async () => publish({ id: 1, workItemUrl: url.toUpperCase(), fields: { title, state: 'Active', tags: [] } }))
  const answer = (read: number, label: string) => act(async () => reads[read](label))
  await render()
  assert.equal(shown, 'loaded')

  await save('First')
  await save('Second')
  await answer(1, 'second save')
  await answer(0, 'first save')
  assert.equal(shown, 'second save', 'the first save’s history answered last, but is older')

  await save('Third')
  served = { ...served, updatesByItemId: { 1: history('reloaded') } }
  reloadNonce = 1
  await render()
  assert.equal(shown, 'reloaded')
  await answer(2, 'before reload')
  assert.equal(shown, 'reloaded', 'history read before the reload is older than the reload')
})