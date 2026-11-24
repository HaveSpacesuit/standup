import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestClient, AdoRequestOptions } from '../src/ado/httpClient.ts'
import type { ProjectWorkItemTypeInfo } from '../src/ado/workItemTypesApi.ts'
import type { WorkItemSummary } from '../src/ado/types.ts'
import { parseAttentionTags, matchingAttentionTags, isOpenAttentionItem } from '../src/features/standup/utils/attentionTags.ts'
import { parseStoredQaOptionsWithRecovery } from '../src/features/standup/utils/qaOptions.ts'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { buildAttentionItemsWiql } = await server.ssrLoadModule('/src/ado/wiql.ts')
const { fetchAttentionItems } = await server.ssrLoadModule('/src/ado/workItemsApi.ts')
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')
const metadata: ProjectWorkItemTypeInfo = {
  states: [], workItemTypes: ['Bug', 'Task'],
  statesByType: {
    bug: [
      { name: 'New', category: 'Proposed' }, { name: 'Active', category: 'InProgress' },
      { name: 'Resolved', category: 'Resolved' }, { name: 'Closed', category: 'Completed' }, { name: 'Cut', category: 'Removed' },
    ],
    task: [{ name: 'Closed', category: 'InProgress' }, { name: 'Finished', category: 'Completed' }],
  },
}
const team = { id: 'a', orgName: 'attention-fixture', projectName: 'Project', areaPath: 'Project\\Team' }
type Raw = { id: number; rev: number; fields: Record<string, unknown> }
const raw = (id: number, fields: Record<string, unknown> = {}): Raw => ({
  id, rev: 1, fields: {
    'System.Title': `Item ${id}`, 'System.WorkItemType': 'Bug', 'System.State': 'New',
    'System.Tags': 'Release', 'System.AreaPath': team.areaPath,
    'System.CreatedDate': '2020-01-01T00:00:00Z', 'System.IterationPath': 'Project\\Old sprint', ...fields,
  },
})

function fixture(rows: Raw[], overrides: { wiql?: unknown; batch?: unknown } = {}) {
  const requests: AdoRequestOptions[] = []
  const client: AdoRequestClient = {
    request: async <T>(request: AdoRequestOptions): Promise<T> => {
      requests.push(request)
      let result: unknown
      if (request.path.endsWith('/wiql')) result = overrides.wiql ?? { workItems: [...rows.map(({ id }) => ({ id })), ...rows.slice(0, 1).map(({ id }) => ({ id }))] }
      else if (request.path.endsWith('/workitemicons')) result = { value: [] }
      else if (request.path.endsWith('/workitemsbatch')) result = overrides.batch ?? { value: rows.filter((row) => (request.body as { ids: number[] }).ids.includes(row.id)) }
      else if (request.path.endsWith('/workitemtypes')) result = { value: metadata.workItemTypes.map((name) => ({ name, states: metadata.statesByType[name.toLowerCase()] })) }
      else {
        const id = Number(request.path.match(/\/workitems\/(\d+)/i)?.[1])
        if (!id) throw new Error(`Unexpected request: ${request.path}`)
        result = rows.find((row) => row.id === id)
      }
      return result as T
    },
  }
  return { client, requests }
}

test('attention defaults, exact any-tag matching and intentionally empty settings are distinct', () => {
  assert.deepEqual(parseAttentionTags(undefined), ['E2E', 'Release'])
  assert.deepEqual(parseAttentionTags([]), [])
  assert.deepEqual(parseAttentionTags([' Release ', 'release', 'E2E']), ['Release', 'E2E'])
  assert.deepEqual(matchingAttentionTags({ tags: ['e2e', 'RELEASE', 'PreRelease'] }, ['E2E', 'Release']), ['E2E', 'Release'])
  assert.deepEqual(matchingAttentionTags({ tags: ['PreRelease'] }, ['Release']), [])
  assert.deepEqual(parseStoredQaOptionsWithRecovery('{}').options.attentionTags, ['E2E', 'Release'])
  assert.deepEqual(parseStoredQaOptionsWithRecovery('{"attentionTags":[]}').options.attentionTags, [])
  for (const value of [null, 'Release', [''], ['a;b'], ['a,b'], ['a\nb'], [23]]) {
    assert.throws(() => parseAttentionTags(value), /valid.*tag names/)
    assert.equal(parseStoredQaOptionsWithRecovery(JSON.stringify({ attentionTags: value })).unreadable, true)
  }
})

test('query escapes values, includes all iterations/types, and excludes terminal states per type', () => {
  const query = buildAttentionItemsWiql("Project's", "Project's\\Team", ['Release', "Team's focus"], metadata)
  assert.match(query, /\[System.TeamProject\] = 'Project''s'/)
  assert.match(query, /\[System.AreaPath\] UNDER 'Project''s\\Team'/)
  assert.match(query, /\[System.Tags\] CONTAINS 'Release' OR \[System.Tags\] CONTAINS 'Team''s focus'/)
  assert.match(query, /\[System.WorkItemType\] = 'bug' AND \[System.State\] NOT IN \('Closed', 'Cut'\)/)
  assert.match(query, /\[System.WorkItemType\] = 'task' AND \[System.State\] NOT IN \('Finished'\)/)
  assert.doesNotMatch(query, /IterationPath|CreatedDate|ChangedDate|StartOfDay|\$top/)
  assert.throws(() => buildAttentionItemsWiql('P', 'P', ['Release'], { ...metadata, statesByType: {} }), /unavailable/)
  assert.throws(() => buildAttentionItemsWiql('P', 'P', ['Release'], { ...metadata, statesByType: { bug: [{ name: 'New', category: '' }] } }), /categories are unavailable/)
  const item: WorkItemSummary = { id: 1, title: '', status: 'New', workItemType: 'Bug', state: 'Resolved' }
  assert.equal(isOpenAttentionItem(item, metadata.statesByType), true)
  assert.equal(isOpenAttentionItem({ ...item, state: 'Closed' }, metadata.statesByType), false)
  assert.equal(isOpenAttentionItem({ ...item, workItemType: 'Task', state: 'Closed' }, metadata.statesByType), true)
})

test('API keeps old and unscheduled matches once, post-filters whole tags, terminal states and area races without history/PR fan-out', async () => {
  const { client, requests } = fixture([
    raw(1, { 'System.Tags': 'Release; e2e' }),
    raw(2, { 'System.Tags': 'PreRelease' }),
    raw(3, { 'System.State': 'Closed' }),
    raw(4, { 'System.State': 'Cut' }),
    raw(5, { 'System.IterationPath': 'Project', 'System.AreaPath': 'Project\\Team\\Child' }),
    raw(6, { 'System.AreaPath': 'Project\\TeamOther' }),
    raw(7, { 'System.WorkItemType': 'Task', 'System.State': 'Closed' }),
    raw(8, { 'System.State': 'Resolved' }),
  ])
  const items = await fetchAttentionItems(client, team, ['E2E', 'Release'], metadata)
  assert.deepEqual(items.map((item: WorkItemSummary) => item.id), [1, 5, 7, 8])
  assert.equal(items[0].sprintName, 'Old sprint')
  assert.equal(requests.some((request) => /updates|pullrequest|relations/i.test(request.path)), false)
  const disabled = fixture([])
  assert.deepEqual(await fetchAttentionItems(disabled.client, team, [], metadata), [])
  assert.equal(disabled.requests.length, 0)
})

test('incomplete query, missing batch items, and unknown states fail instead of presenting successful partial counts', async () => {
  const cases = [
    fixture([raw(1)], { wiql: {} }),
    fixture([raw(1)], { batch: { value: [] } }),
    fixture([raw(1)], { batch: { value: [raw(2)] } }),
    fixture([raw(1, { 'System.State': 'Unknown' })]),
  ]
  for (const { client } of cases) await assert.rejects(fetchAttentionItems(client, team, ['Release'], metadata), /invalid|incomplete|could not be verified/)
})

test('engine keys the full scope and tag set, preserves checked time, and refreshes pending reads after a saved change', { timeout: 10000 }, async (t) => {
  const rows = [raw(1)]
  const { client, requests } = fixture(rows)
  let held: (() => void) | undefined
  let pause = false
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    const request = { method: init?.method ?? 'GET', orgName: team.orgName, path, body: init?.body ? JSON.parse(String(init.body)) : undefined } as AdoRequestOptions
    const response = await client.request(request)
    if (pause && path.endsWith('/workitemsbatch')) {
      pause = false
      const copied = JSON.stringify(response)
      await new Promise<void>((resolve) => { held = resolve })
      return new Response(copied, { headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } })
  })
  const engine = new AdoQueryEngine('nonfunctional-test-token')
  const initial = await engine.getAttentionItems(team, ['Release', 'E2E'])
  const cached = await engine.getAttentionItems(team, ['e2e', 'release'])
  assert.equal(cached, initial)
  assert.equal(cached.syncedAt, initial.syncedAt)
  assert.equal(requests.filter((request) => request.path.endsWith('/wiql')).length, 1)
  await engine.getAttentionItems({ ...team, areaPath: 'Project\\Team\\Child' }, ['Release'])
  await engine.getAttentionItems({ ...team, orgName: 'other-org' }, ['Release'])
  assert.equal(requests.filter((request) => request.path.endsWith('/wiql')).length, 3)
  engine.clearQualityAssuranceDataCache(team.id)
  pause = true
  const pending = engine.getAttentionItems(team, ['Release'])
  while (!held) await new Promise((resolve) => setTimeout(resolve, 1))
  rows[0] = raw(1, { 'System.State': 'Closed' })
  await engine.reloadWorkItem(team, 1)
  held()
  assert.deepEqual((await pending).items, [], 'a pre-save read cannot resurrect a closed item')
  rows[0] = raw(1, { 'System.Tags': 'E2E' })
  await engine.reloadWorkItem(team, 1)
  assert.deepEqual((await engine.getAttentionItems(team, ['E2E'])).items.map((item: WorkItemSummary) => item.id), [1])
  rows[0] = raw(1, { 'System.Tags': '' })
  await engine.reloadWorkItem(team, 1)
  assert.deepEqual((await engine.getAttentionItems(team, ['E2E'])).items, [])
})
