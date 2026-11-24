import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { WorkItemSummary, TeamIterationOption } from '../src/ado/types.ts'
import type { AdoRequestOptions, AdoRequestClient } from '../src/ado/httpClient.ts'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { getQuickAssignGroups, isQuickAssignable } = await server.ssrLoadModule('/src/features/standup/utils/quickAssign.ts')
const { assignWorkItem, AssignmentChangedError, isAssignmentAccessError } = await server.ssrLoadModule('/src/ado/workItemAssignmentApi.ts')
const { AdoHttpClient, AdoWriteError } = await server.ssrLoadModule('/src/ado/httpClient.ts')
const { DEFAULT_TAG_RULES } = await server.ssrLoadModule('/src/ado/workItemStatus.ts')
const team = { orgName: 'org', projectName: 'Project', areaPath: 'Project\\Team' }
const developer = { displayName: 'Developer', uniqueName: 'dev@example.invalid' }
const item = (id: number, fields: Partial<WorkItemSummary> = {}): WorkItemSummary => ({
  id, title: `Item ${id}`, state: 'Approved', workItemType: 'Product Backlog Item', status: 'New',
  iterationPath: 'Project\\S1', sprintName: 'S1', ...fields,
})
const iteration = (path: string, startDate?: string): TeamIterationOption => ({ path, name: path.split('\\').at(-1)!, timeFrame: 'current', startDate })
const ids = (items: WorkItemSummary[], iterations: TeamIterationOption[] = []) =>
  getQuickAssignGroups(items, iterations).map((group: { items: WorkItemSummary[] }) => group.items.map((entry) => entry.id))

test('only genuinely unassigned PBIs and Bugs in New are eligible; tag rules cannot conceal a blocked match', () => {
  assert.equal(isQuickAssignable(item(1)), true)
  assert.equal(isQuickAssignable(item(1, { effort: undefined })), true)
  for (const fields of [
    { workItemType: 'Task' }, { kind: 'pull-request' as const }, { assignedTo: { displayName: 'Outside team' } },
    { state: 'Active' }, { state: '' }, { tags: ['blocked'] }, { tags: ['PR'] },
    { effort: 0 }, { workItemType: 'Bug', effort: 0 },
  ]) assert.equal(isQuickAssignable(item(2, fields)), false, JSON.stringify(fields))
  const rules = [{ id: 'new', tag: 'queue', action: 'New' }, ...DEFAULT_TAG_RULES]
  assert.equal(isQuickAssignable(item(3, { tags: ['queue', 'blocked'] }), rules), false)
  assert.equal(isQuickAssignable(item(4, { tags: ['hide'] }), [{ id: 'hide', tag: 'hide', action: 'unlisted' }]), false)
})

test('groups by full sprint path chronologically, puts PBIs first, and preserves effort/date/value priorities', () => {
  const items = [
    item(20, { iterationPath: 'Project\\S2' }),
    item(3, { effort: 8, createdAt: '2026-03-02' }),
    item(2, { effort: 8, createdAt: '2026-03-01' }),
    item(1, { effort: 13 }),
    item(4, { effort: NaN }),
    item(5, { workItemType: 'Bug', effort: 4, severity: '1 - Critical', priority: 1 }),
    item(6, { workItemType: 'Bug', effort: 4, severity: '4 - Low', priority: 4 }),
    item(30, { iterationPath: 'Other\\S1' }),
    item(40, { iterationPath: undefined, sprintName: undefined }),
  ]
  const grouped = getQuickAssignGroups(items, [iteration('Project\\S2', '2026-04-01'), iteration('Project\\S1', '2026-03-01')])
  assert.deepEqual(grouped.map((group: { key: string }) => group.key), ['project\\s1', 'project\\s2', '', 'other\\s1'])
  assert.deepEqual(grouped[0].items.map((entry: WorkItemSummary) => entry.id), [1, 2, 3, 4, 5, 6])
  assert.equal(grouped.at(-1).label, 'S1')
})

test('PBI missing dates sort last and bug ties use Backlog severity, age, then ID', () => {
  assert.deepEqual(ids([item(3, { effort: 8 }), item(2, { effort: 8, createdAt: '2026-01-01' }), item(1, { effort: 8, createdAt: '2026-01-01' })]), [[1, 2, 3]])
  const bugs = [
    item(6, { workItemType: 'Bug', createdAt: '2026-01-02' }),
    item(5, { workItemType: 'Bug', createdAt: '2026-01-01' }),
    item(4, { workItemType: 'Bug', createdAt: '2026-01-01' }),
  ]
  assert.deepEqual(ids(bugs), [[4, 5, 6]])
})

test('current and earliest future sprint headers are labeled by full path, not name or group order', () => {
  const iterations: TeamIterationOption[] = [
    { ...iteration('Project\\S3', '2026-05-01'), timeFrame: 'future' },
    iteration('Project\\S1', '2026-03-01'),
    { ...iteration('Project\\S2', '2026-04-01'), timeFrame: 'future' },
    { ...iteration('Project\\S0', '2026-02-01'), timeFrame: 'past' },
  ]
  const items = ['PROJECT\\s1', 'Project\\S2', 'Project\\S3', 'Project\\S0', 'Other\\S1']
    .map((iterationPath, index) => item(index + 1, { iterationPath }))
  const details = (candidates: WorkItemSummary[], options: TeamIterationOption[]) =>
    getQuickAssignGroups(candidates, options).map((group: { key: string; detail?: string }) => [group.key, group.detail])
  assert.deepEqual(details(items, iterations), [
    ['project\\s0', undefined],
    ['project\\s1', 'Current sprint'],
    ['project\\s2', 'Next sprint'],
    ['project\\s3', undefined],
    ['other\\s1', undefined],
  ])
  assert.deepEqual(details([items[2]], iterations), [['project\\s3', undefined]],
    'a later populated group is not next when the actual next sprint has no candidates')
  assert.deepEqual(details([items[0]], []), [['project\\s1', undefined]])
})

function apiItem(fields: Record<string, unknown> = {}) {
  return { id: 1, rev: 7, fields: {
    'System.Title': 'Candidate', 'System.WorkItemType': 'Product Backlog Item', 'System.State': 'Approved',
    'System.AreaPath': 'Project\\Team\\Child', 'System.IterationPath': 'Project\\S1',
    'Microsoft.VSTS.Scheduling.Effort': 8, ...fields,
  } }
}

function clientWith(request: (options: AdoRequestOptions) => unknown | Promise<unknown>): AdoRequestClient {
  return {
    request: async <T>(options: AdoRequestOptions) => await request(options) as T,
    requestPage: async () => { throw new Error('Unexpected paginated request') },
  }
}

test('assignment preflights a fresh revision and patches only Assigned To using a distinct identity', async () => {
  const calls: AdoRequestOptions[] = []
  const client = clientWith((options) => {
    calls.push(options)
    return options.method === 'PATCH' ? apiItem({ 'System.AssignedTo': developer }) : apiItem()
  })
  const updated = await assignWorkItem(client, team, item(1), developer, DEFAULT_TAG_RULES)
  assert.equal(updated.assignedTo.uniqueName, developer.uniqueName)
  assert.equal(updated.state, 'Approved')
  assert.equal(updated.iterationPath, 'Project\\S1')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].method ?? 'GET', 'GET')
  assert.equal(calls[1].method, 'PATCH')
  assert.equal(calls[1].contentType, 'application/json-patch+json')
  assert.deepEqual(calls[1].body, [
    { op: 'test', path: '/rev', value: 7 },
    { op: 'add', path: '/fields/System.AssignedTo', value: developer.uniqueName },
  ])
})

test('stale assignee, scope, state, tags, or invalid revision prevents every PATCH', async () => {
  for (const fields of [
    { 'System.AssignedTo': { id: 'unknown-identity-shape' } },
    { 'System.AssignedTo': { displayName: 'Someone else' } },
    { 'System.State': 'Active' }, { 'System.Tags': 'blocked' },
    { 'System.IterationPath': 'Project\\Elsewhere' }, { 'System.AreaPath': 'Project\\TeamOther' },
    { 'System.WorkItemType': 'Task' },
  ]) {
    let writes = 0
    const client = clientWith((options) => {
      if (options.method === 'PATCH') writes++
      return apiItem(fields)
    })
    await assert.rejects(assignWorkItem(client, team, item(1), developer, DEFAULT_TAG_RULES), AssignmentChangedError)
    assert.equal(writes, 0)
  }
  await assert.rejects(assignWorkItem(clientWith(() => ({ ...apiItem(), rev: undefined })), team, item(1), developer, DEFAULT_TAG_RULES), AssignmentChangedError)
  await assert.rejects(assignWorkItem(clientWith(() => { throw new Error('Should not fetch') }), team, item(1), { displayName: 'Ambiguous' }, DEFAULT_TAG_RULES), /account identifier/)
})

test('failed writes are never retried; a re-read separates unsaved, saved, and unconfirmable outcomes', async () => {
  const lostResponse = new TypeError('Failed to fetch')
  const cases: { failure: Error; reread: unknown; expected: RegExp; access: boolean }[] = [
    { failure: new AdoWriteError(401), reread: apiItem(), expected: /HTTP 401.*Work Items \(Read & write\).*Nothing was assigned/, access: true },
    { failure: new AdoWriteError(403), reread: apiItem(), expected: /HTTP 403.*Work Items \(Read & write\).*Nothing was assigned/, access: true },
    { failure: new AdoWriteError(400), reread: apiItem(), expected: /HTTP 400.*refreshed/, access: false },
    // A missing write scope arrives as a CORS-blocked 401, so fetch rejects and the re-read shows the same revision.
    { failure: lostResponse, reread: apiItem(), expected: /did not save.*Work Items \(Read & write\).*Nothing was assigned/, access: true },
    { failure: lostResponse, reread: { ...apiItem({ 'System.AssignedTo': { displayName: 'Other', uniqueName: 'other@example.invalid' } }), rev: 8 }, expected: /could not be confirmed/, access: false },
    { failure: lostResponse, reread: new TypeError('Offline'), expected: /could not be confirmed/, access: false },
  ]
  for (const { failure, reread, expected, access } of cases) {
    let writes = 0
    let reads = 0
    const client = clientWith((options) => {
      if (options.method === 'PATCH') { writes++; throw failure }
      if (reads++ === 0) return apiItem()
      if (reread instanceof Error) throw reread
      return reread
    })
    await assert.rejects(assignWorkItem(client, team, item(1), developer, DEFAULT_TAG_RULES), (error: Error) => {
      assert.match(error.message, expected)
      assert.equal(isAssignmentAccessError(error), access, error.message)
      return true
    })
    assert.equal(writes, 1)
  }
})

test('a lost PATCH response is reported as success when the re-read shows the assignment was saved', async () => {
  let writes = 0
  let reads = 0
  const client = clientWith((options) => {
    if (options.method === 'PATCH') { writes++; throw new TypeError('Failed to fetch') }
    return reads++ === 0 ? apiItem() : { ...apiItem({ 'System.AssignedTo': developer }), rev: 8 }
  })
  const updated = await assignWorkItem(client, team, item(1), developer, DEFAULT_TAG_RULES)
  assert.equal(updated.assignedTo.uniqueName, developer.uniqueName)
  assert.equal(writes, 1)
})

test('PATCH failures become write errors without consuming response bodies; 401 and 403 name the write scope', async (t) => {
  for (const status of [401, 403, 409]) {
    const response = new Response('private upstream diagnostics', { status })
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
      assert.equal(init.method, 'PATCH')
      assert.equal((init.headers as Record<string, string>)['Content-Type'], 'application/json-patch+json')
      return response
    })
    await assert.rejects(new AdoHttpClient('nonfunctional-test-token').request({
      orgName: 'org', path: '/_apis/wit/workitems/1', method: 'PATCH', contentType: 'application/json-patch+json', body: [],
    }), (error: unknown) => {
      assert.ok(error instanceof AdoWriteError)
      assert.equal(error.status, status)
      assert.equal(error.accessDenied, status !== 409)
      assert.equal(/Work Items \(Read & write\)/.test(error.message), status !== 409)
      return true
    })
    assert.equal(response.bodyUsed, false)
    t.mock.restoreAll()
  }
})

test('the engine writes a saved assignment into its cached lists for that org only, without any reload', async (t) => {
  const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')
  const requests: string[] = []
  let denyWrite = true
  t.mock.method(globalThis, 'fetch', async (input: string | URL, init: RequestInit = {}) => {
    const { pathname } = new URL(String(input))
    const method = init.method ?? 'GET'
    requests.push(`${method} ${pathname}`)
    if (method === 'PATCH' && denyWrite) return new Response(null, { status: 403 })
    if (pathname.endsWith('/wiql')) return Response.json({ workItems: [{ id: 1 }] })
    if (pathname.endsWith('/workitemsbatch')) return Response.json({ value: [apiItem()] })
    if (pathname.endsWith('/workitems/1')) return Response.json(method === 'PATCH' ? apiItem({ 'System.AssignedTo': developer }) : apiItem())
    return Response.json({ value: [] })
  })
  const engine = new AdoQueryEngine('nonfunctional-test-token')
  const profile = { ...team, id: 'team', teamName: 'Team', iterationPath: 'Project', repoName: '' }
  // Work item IDs repeat across organizations, so the other org's item 1 must keep its assignee.
  const otherOrg = { ...profile, id: 'other', orgName: 'other-org' }
  const assignees = async () => (await Promise.all([
    engine.getWorkItemsForCurrentAndNextIteration(profile),
    engine.getBacklogBugs(profile),
    engine.getWorkItemsForCurrentAndNextIteration(otherOrg),
  ])).map(([cached]: WorkItemSummary[]) => cached.assignedTo?.uniqueName ?? null)
  const [candidate] = await engine.getWorkItemsForCurrentAndNextIteration(profile)
  assert.deepEqual(await assignees(), [null, null, null])
  const writeRequests = ['GET /org/Project/_apis/wit/workitems/1', 'PATCH /org/Project/_apis/wit/workitems/1']

  requests.length = 0
  await assert.rejects(engine.assignWorkItem(profile, candidate, developer, DEFAULT_TAG_RULES), AdoWriteError)
  assert.deepEqual(await assignees(), [null, null, null])
  assert.deepEqual(requests, writeRequests)

  denyWrite = false
  requests.length = 0
  const assigned = await engine.assignWorkItem(profile, candidate, developer, DEFAULT_TAG_RULES)
  assert.equal(assigned.assignedTo.uniqueName, developer.uniqueName)
  assert.deepEqual(await assignees(), [developer.uniqueName, developer.uniqueName, null])
  assert.deepEqual(requests, writeRequests)
})
