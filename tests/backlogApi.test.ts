import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestClient, AdoRequestOptions } from '../src/ado/httpClient'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(() => server.close())
const { buildBacklogBugsWiql } = await server.ssrLoadModule('/src/ado/wiql.ts')
const { FALLBACK_CLOSED_BUG_STATES, fetchBacklogBugs, mapBacklogBug, resolveClosedBugStates } =
  await server.ssrLoadModule('/src/ado/backlogApi.ts')
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')

const team = {
  id: 'team',
  orgName: 'example-org',
  projectName: 'Example Project',
  areaPath: 'Example Project\\Team A',
}

const BATCH_FIELDS = [
  'System.Title',
  'System.CreatedDate',
  'System.State',
  'System.AssignedTo',
  'System.IterationPath',
  'Microsoft.VSTS.Common.Severity',
  'Microsoft.VSTS.Common.Priority',
  'Microsoft.VSTS.Scheduling.Effort',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.Size',
]

test('the backlog WIQL selects only open Bugs under the area path, across every iteration', () => {
  assert.equal(
    buildBacklogBugsWiql('Example Project', 'Example Project\\Team A', ['Closed', 'Removed']),
    [
      'SELECT [System.Id]',
      'FROM WorkItems',
      "WHERE [System.TeamProject] = 'Example Project'",
      "  AND [System.AreaPath] UNDER 'Example Project\\Team A'",
      "  AND [System.WorkItemType] = 'Bug'",
      "  AND [System.State] NOT IN ('Closed', 'Removed')",
      'ORDER BY [System.Id]',
    ].join('\n'),
  )
})

test('the backlog WIQL escapes quotes and omits the state clause when nothing is closed', () => {
  const escaped = buildBacklogBugsWiql("O'Brien", "O'Brien\\Team's Area", ["Won't Fix"])
  assert.match(escaped, /\[System\.TeamProject\] = 'O''Brien'/)
  assert.match(escaped, /UNDER 'O''Brien\\Team''s Area'/)
  assert.match(escaped, /NOT IN \('Won''t Fix'\)/)

  const withoutStates = buildBacklogBugsWiql('Project', 'Project\\Team')
  assert.doesNotMatch(withoutStates, /System\.State/)
  assert.doesNotMatch(withoutStates, /IterationPath/)
})

test('closed Bug states come from the Completed and Removed state categories', () => {
  assert.deepEqual(
    resolveClosedBugStates([
      { name: 'New', category: 'Proposed' },
      { name: 'Active', category: 'InProgress' },
      { name: 'Resolved', category: 'Resolved' },
      { name: 'Fixed', category: ' completed ' },
      { name: 'Cut', category: 'REMOVED' },
    ]),
    ['Fixed', 'Cut'],
  )
})

test('closed Bug states fall back to well-known names when the Bug type reports none', () => {
  const expected = ['Closed', 'Done', 'Removed', 'Completed']
  assert.deepEqual([...FALLBACK_CLOSED_BUG_STATES], expected)
  assert.deepEqual(resolveClosedBugStates(undefined), expected)
  assert.deepEqual(resolveClosedBugStates([]), expected)
  assert.deepEqual(resolveClosedBugStates([{ name: 'Active', category: 'InProgress' }]), expected)

  resolveClosedBugStates(undefined).push('Changed')
  assert.deepEqual([...FALLBACK_CLOSED_BUG_STATES], expected, 'callers cannot modify the shared fallback list')
})

test('a work item maps to the fields shown on the backlog', () => {
  const bug = mapBacklogBug({
    id: 42,
    fields: {
      'System.Title': '  Crash on save  ',
      'System.State': 'Active',
      'System.CreatedDate': '2026-03-01T10:00:00Z',
      'System.AssignedTo': { displayName: 'Ada Lovelace', uniqueName: 'ada@example.com', imageUrl: 'https://example.com/ada.png' },
      'System.IterationPath': 'Example Project\\2026\\Sprint 5',
      'Microsoft.VSTS.Common.Severity': '2 - High',
      'Microsoft.VSTS.Common.Priority': 1,
      'Microsoft.VSTS.Scheduling.Effort': 8,
    },
  }, team)

  assert.deepEqual(bug, {
    id: 42,
    title: 'Crash on save',
    state: 'Active',
    createdAt: '2026-03-01T10:00:00Z',
    assignedTo: { displayName: 'Ada Lovelace', uniqueName: 'ada@example.com', imageUrl: 'https://example.com/ada.png' },
    iterationPath: 'Example Project\\2026\\Sprint 5',
    severity: '2 - High',
    priority: 1,
    effort: 8,
    workItemUrl: 'https://dev.azure.com/example-org/Example%20Project/_workitems/edit/42',
  })
})

test('a work item with no optional fields maps to a bug with only the title, id, and link', () => {
  const bug = mapBacklogBug({ id: 7, fields: {} }, { orgName: 'my org', projectName: 'Proj' })

  assert.deepEqual(bug, {
    id: 7,
    title: 'Bug 7',
    state: undefined,
    createdAt: undefined,
    assignedTo: undefined,
    iterationPath: undefined,
    severity: undefined,
    priority: undefined,
    effort: undefined,
    workItemUrl: 'https://dev.azure.com/my%20org/Proj/_workitems/edit/7',
  })
  assert.equal(mapBacklogBug({ id: 8 }, team)?.title, 'Bug 8')
  assert.equal(mapBacklogBug({ id: 9, fields: { 'System.Title': '   ' } }, team)?.title, 'Bug 9')
})

test('numeric fields accept numeric strings and the first populated effort field wins', () => {
  const stringValues = mapBacklogBug({
    id: 1,
    fields: { 'Microsoft.VSTS.Common.Priority': '2', 'Microsoft.VSTS.Scheduling.Effort': '5' },
  }, team)
  assert.equal(stringValues?.priority, 2)
  assert.equal(stringValues?.effort, 5)

  const storyPoints = mapBacklogBug({
    id: 2,
    fields: { 'Microsoft.VSTS.Scheduling.StoryPoints': 3, 'Microsoft.VSTS.Scheduling.Size': 13 },
  }, team)
  assert.equal(storyPoints?.effort, 3)

  const effortFirst = mapBacklogBug({
    id: 3,
    fields: {
      'Microsoft.VSTS.Scheduling.Effort': 2,
      'Microsoft.VSTS.Scheduling.StoryPoints': 3,
      'Microsoft.VSTS.Scheduling.Size': 13,
    },
  }, team)
  assert.equal(effortFirst?.effort, 2)

  const size = mapBacklogBug({ id: 4, fields: { 'Microsoft.VSTS.Scheduling.Size': 13 } }, team)
  assert.equal(size?.effort, 13)
})

test('work items without a numeric id are ignored', () => {
  assert.equal(mapBacklogBug({ fields: { 'System.Title': 'No id' } }, team), null)
  assert.equal(mapBacklogBug({ id: '5' as unknown as number, fields: {} }, team), null)
})

type RecordedClient = AdoRequestClient & { requests: AdoRequestOptions[] }

function createClient(handler: (options: AdoRequestOptions) => unknown): RecordedClient {
  const requests: AdoRequestOptions[] = []
  return {
    requests,
    async request<T>(options: AdoRequestOptions): Promise<T> {
      requests.push(options)
      return handler(options) as T
    },
    async requestPage<T>(): Promise<{ data: T; continuationToken: null }> {
      throw new Error('requestPage should not be called')
    },
  }
}

function createBatchHandler(ids: number[]) {
  return (options: AdoRequestOptions) => {
    if (options.path.endsWith('/_apis/wit/wiql')) {
      return { workItems: ids.map((id) => ({ id })) }
    }

    const body = options.body as { ids: number[] }
    return { value: body.ids.map((id) => ({ id, fields: { 'System.Title': `Bug ${id}` } })) }
  }
}

test('open bug ids are found with WIQL and then loaded in batches with the backlog fields', async () => {
  const ids = Array.from({ length: 450 }, (_, index) => index + 1)
  const client = createClient(createBatchHandler(ids))

  const bugs = await fetchBacklogBugs(client, team, ['Closed', 'Removed'])

  const [wiql, ...batches] = client.requests
  assert.equal(wiql.method, 'POST')
  assert.equal(wiql.orgName, 'example-org')
  assert.equal(wiql.path, '/Example%20Project/_apis/wit/wiql')
  assert.deepEqual(wiql.body, { query: buildBacklogBugsWiql(team.projectName, team.areaPath, ['Closed', 'Removed']) })

  assert.deepEqual(batches.map((request) => (request.body as { ids: number[] }).ids.length), [200, 200, 50])
  for (const request of batches) {
    assert.equal(request.method, 'POST')
    assert.equal(request.orgName, 'example-org')
    assert.equal(request.path, '/_apis/wit/workitemsbatch')
    const body = request.body as Record<string, unknown>
    assert.deepEqual(body.fields, BATCH_FIELDS)
    assert.equal('$expand' in body, false, 'Azure DevOps rejects $expand combined with fields')
  }

  assert.deepEqual(bugs.map((bug: { id: number }) => bug.id), ids, 'bugs keep the WIQL order across batches')
  assert.equal(bugs[0].title, 'Bug 1')
})

test('no batch request is made when no bugs match', async () => {
  for (const response of [{ workItems: [] }, {}]) {
    const client = createClient(() => response)

    assert.deepEqual(await fetchBacklogBugs(client, team, []), [])
    assert.equal(client.requests.length, 1)
  }
})

test('batch entries without an id are skipped', async () => {
  const client = createClient((options) => (
    options.path.endsWith('/_apis/wit/wiql')
      ? { workItems: [{ id: 1 }, { id: 2 }] }
      : { value: [{ id: 1, fields: { 'System.Title': 'Kept' } }, { fields: { 'System.Title': 'Dropped' } }] }
  ))

  const bugs = await fetchBacklogBugs(client, team, [])

  assert.deepEqual(bugs.map((bug: { title: string }) => bug.title), ['Kept'])
})

test('the caller signal is passed to every request', async () => {
  const client = createClient(createBatchHandler([1, 2]))
  const controller = new AbortController()

  await fetchBacklogBugs(client, team, [], controller.signal)

  assert.equal(client.requests.length, 2)
  assert.ok(client.requests.every((request) => request.signal === controller.signal))
})

type RecordedFetch = { url: URL; method: string; body?: { query?: string; ids?: number[] }; signal?: AbortSignal | null }

function mockBacklogApi(
  t: TestContext,
  options: { bugStates?: Array<{ name: string; category: string }> | null; failWiql?: () => boolean } = {},
) {
  const requests: RecordedFetch[] = []
  const bugStates = options.bugStates === undefined
    ? [
      { name: 'New', category: 'Proposed' },
      { name: 'Active', category: 'InProgress' },
      { name: 'Resolved', category: 'Resolved' },
      { name: 'Closed', category: 'Completed' },
      { name: 'Cut', category: 'Removed' },
    ]
    : options.bugStates

  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    requests.push({ url, method: init?.method ?? 'GET', body, signal: init?.signal })

    if (url.pathname.endsWith('/_apis/wit/workitemtypes')) {
      return Response.json({
        value: [
          ...(bugStates ? [{ name: 'Bug', states: bugStates }] : []),
          { name: 'Task', states: [{ name: 'Done', category: 'Completed' }] },
        ],
      })
    }
    if (url.pathname.endsWith('/_apis/wit/wiql')) {
      if (options.failWiql?.()) {
        return Response.json({ message: 'Temporarily unavailable' }, { status: 503 })
      }
      return Response.json({ workItems: [{ id: 2 }, { id: 1 }] })
    }
    if (url.pathname.endsWith('/_apis/wit/workitemsbatch')) {
      return Response.json({ value: body!.ids!.map((id) => ({ id, fields: { 'System.Title': `Bug ${id}` } })) })
    }
    throw new Error(`Unexpected request: ${url}`)
  })

  return {
    requests,
    wiqlRequests: () => requests.filter((request) => request.url.pathname.endsWith('/_apis/wit/wiql')),
  }
}

test('the engine excludes the closed states defined by the Bug type', async (t) => {
  const { requests, wiqlRequests } = mockBacklogApi(t)
  const engine = new AdoQueryEngine('')

  const bugs = await engine.getBacklogBugs(team)

  assert.deepEqual(bugs.map((bug: { id: number }) => bug.id), [2, 1])
  assert.equal(bugs[0].workItemUrl, 'https://dev.azure.com/example-org/Example%20Project/_workitems/edit/2')
  const [wiql] = wiqlRequests()
  assert.equal(wiql.url.pathname, '/example-org/Example%20Project/_apis/wit/wiql')
  assert.match(wiql.body!.query!, /\[System\.State\] NOT IN \('Closed', 'Cut'\)/)
  assert.doesNotMatch(wiql.body!.query!, /Done/, 'states of other work item types are not used')
  assert.equal(requests.filter((request) => request.url.pathname.endsWith('/_apis/wit/workitemtypes')).length, 1)
})

test('the engine falls back to well-known closed states without Bug type metadata', async (t) => {
  for (const bugStates of [null, [{ name: 'Active', category: 'InProgress' }]]) {
    const { wiqlRequests } = mockBacklogApi(t, { bugStates })
    const engine = new AdoQueryEngine('')

    await engine.getBacklogBugs(team)

    assert.match(wiqlRequests()[0].body!.query!, /NOT IN \('Closed', 'Done', 'Removed', 'Completed'\)/)
  }
})

test('backlog bugs are cached per team until the cache is cleared', async (t) => {
  const { wiqlRequests } = mockBacklogApi(t)
  const engine = new AdoQueryEngine('')

  await engine.getBacklogBugs(team)
  await engine.getBacklogBugs(team)
  assert.equal(wiqlRequests().length, 1, 'repeat loads use the cache')

  await engine.getBacklogBugs({ ...team, id: 'other-team', areaPath: 'Example Project\\Team B' })
  assert.equal(wiqlRequests().length, 2, 'each team has its own entry')
  assert.match(wiqlRequests()[1].body!.query!, /UNDER 'Example Project\\Team B'/)

  engine.clearBacklogDataCache('other-team')
  await engine.getBacklogBugs(team)
  assert.equal(wiqlRequests().length, 2, 'clearing another team leaves this entry in place')

  engine.clearBacklogDataCache(team.id)
  await engine.getBacklogBugs(team)
  assert.equal(wiqlRequests().length, 3)

  engine.clearBacklogDataCache()
  await engine.getBacklogBugs(team)
  await engine.getBacklogBugs({ ...team, id: 'other-team', areaPath: 'Example Project\\Team B' })
  assert.equal(wiqlRequests().length, 5)
})

test('the cache identity includes the area path and project of the team', async (t) => {
  const { wiqlRequests } = mockBacklogApi(t)
  const engine = new AdoQueryEngine('')

  await engine.getBacklogBugs(team)
  await engine.getBacklogBugs({ ...team, areaPath: 'Example Project\\Team B' })
  await engine.getBacklogBugs({ ...team, projectName: 'Other Project' })

  assert.equal(wiqlRequests().length, 3)
})

test('forcing a refresh queries the bugs again', async (t) => {
  const { wiqlRequests } = mockBacklogApi(t)
  const engine = new AdoQueryEngine('')

  await engine.getBacklogBugs(team)
  await engine.getBacklogBugs(team, undefined, { forceRefresh: true })

  assert.equal(wiqlRequests().length, 2)
})

test('a failed load is not cached', async (t) => {
  let failing = true
  const { wiqlRequests } = mockBacklogApi(t, { failWiql: () => failing })
  const engine = new AdoQueryEngine('')

  await assert.rejects(engine.getBacklogBugs(team), /503/)
  failing = false
  const bugs = await engine.getBacklogBugs(team)

  assert.deepEqual(bugs.map((bug: { id: number }) => bug.id), [2, 1])
  assert.equal(wiqlRequests().length, 2)
})

test('the caller abort signal does not cancel the shared backlog request', async (t) => {
  const { requests } = mockBacklogApi(t)
  const engine = new AdoQueryEngine('')
  const caller = new AbortController()
  caller.abort()

  const bugs = await engine.getBacklogBugs(team, caller.signal)

  assert.equal(bugs.length, 2)
  assert.ok(requests.length > 0)
  assert.ok(requests.every((request) => request.signal?.aborted === false))
})
