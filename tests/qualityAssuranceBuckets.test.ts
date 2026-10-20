import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { WorkItemSummary } from '../src/ado/queryEngine.ts'
import type { WorkItemUpdate } from '../src/features/standup/utils/qualityAssuranceBuckets.ts'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
})
after(() => server.close())
const { bucketQualityAssuranceItems, classifyQualityAssuranceItem, resolveQualityAssuranceProjectConfig } =
  await server.ssrLoadModule('/src/features/standup/utils/qualityAssuranceBuckets.ts')

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
