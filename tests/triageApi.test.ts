import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestClient, AdoRequestOptions } from '../src/ado/httpClient.ts'
import type { ProjectWorkItemTypeInfo } from '../src/ado/workItemTypesApi.ts'
import type { TriageOptions } from '../src/features/standup/utils/triageOptions.ts'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { buildAdoQueryUrl, buildTriageQueryWiql, buildTriageWiql } = await server.ssrLoadModule('/src/ado/wiql.ts')
const { fetchTriageItems, getTriageReasons, isUnderIteration } = await server.ssrLoadModule('/src/ado/triageApi.ts')
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')
const metadata: ProjectWorkItemTypeInfo = {
  states: [], workItemTypes: ['Bug', 'Task'],
  statesByType: {
    bug: [
      { name: 'Reported', category: 'Proposed' }, { name: 'Approved', category: 'Proposed' }, { name: 'Active', category: 'InProgress' },
      { name: 'Resolved', category: 'Resolved' }, { name: 'Done', category: 'Completed' }, { name: 'Cut', category: 'Removed' },
    ],
    task: [{ name: 'Done', category: 'InProgress' }, { name: 'Finished', category: 'Completed' }],
  },
}
const options: TriageOptions = { tags: ['Triage', "Team's queue"], includeNewBugs: true, excludedIterationPaths: ['Project\\To Refine'], ageFlagDays: 2 }
const team = { id: 'a', orgName: 'triage-fixture-org', projectName: 'Project', areaPath: 'Project\\Team' }

test('WIQL scopes both branches, escapes values, uses per-type categories and orders oldest first', () => {
  const query = buildTriageWiql("Project's", "Project's\\Team", options, metadata)
  assert.match(query, /WHERE \[System.TeamProject\] = 'Project''s'\n  AND \[System.AreaPath\] UNDER 'Project''s\\Team'/)
  assert.match(query, /AND \(\[System.Tags\] CONTAINS 'Triage' OR \[System.Tags\] CONTAINS 'Team''s queue' OR \(\[System.WorkItemType\] = 'Bug' AND \[System.State\] = 'Reported' AND \[System.IterationPath\] NOT UNDER 'Project\\To Refine'\)\)/)
  assert.match(query, /\(\[System.WorkItemType\] = 'bug' AND \[System.State\] NOT IN \('Done', 'Cut'\)\) OR \(\[System.WorkItemType\] = 'task' AND \[System.State\] NOT IN \('Finished'\)\)/)
  assert.doesNotMatch(query, /Approved/, 'later Proposed states such as Approved are not new bugs')
  assert.match(query, /ORDER BY \[System.CreatedDate\] ASC, \[System.Id\] ASC$/)
  assert.doesNotMatch(buildTriageWiql('Project', 'Project\\Team', { ...options, includeNewBugs: false }, metadata), /IterationPath|Reported/)
  assert.throws(() => buildTriageWiql('P', 'P', { ...options, tags: [], includeNewBugs: false }, metadata), /at least one/)
  assert.throws(() => buildTriageWiql('P', 'P', options, { ...metadata, statesByType: { bug: [] } }), /no Proposed/)
  assert.throws(() => buildTriageWiql('P', 'P', options, { ...metadata, statesByType: { ...metadata.statesByType, task: [{ name: 'New', category: '' }] } }), /categories are unavailable/)
})

test('matching uses whole case-insensitive tags, initial-state bugs, subtree exclusions and each type own terminal states', () => {
  const item = { tags: ['triage'], workItemType: 'Bug', state: 'Reported', iterationPath: 'Project\\Sprint 1' }
  assert.deepEqual(getTriageReasons(item, options, metadata), ['Tag: Triage', 'New bug'])
  assert.deepEqual(getTriageReasons({ ...item, tags: ['PreTriage'] }, { ...options, includeNewBugs: false }, metadata), [])
  assert.deepEqual(getTriageReasons({ ...item, tags: [], iterationPath: 'Project\\To Refine\\Child' }, options, metadata), [])
  assert.deepEqual(getTriageReasons({ ...item, iterationPath: 'Project\\To Refine' }, options, metadata), ['Tag: Triage'])
  assert.deepEqual(getTriageReasons({ ...item, tags: [], iterationPath: 'Project\\To Refine Later' }, options, metadata), ['New bug'])
  assert.deepEqual(getTriageReasons({ ...item, state: 'Done' }, options, metadata), [])
  assert.deepEqual(getTriageReasons({ ...item, state: 'Cut' }, options, metadata), [])
  assert.deepEqual(getTriageReasons({ ...item, state: 'Approved' }, options, metadata), ['Tag: Triage'], 'a tag still asks for triage')
  assert.deepEqual(getTriageReasons({ ...item, tags: [], state: 'Approved' }, options, metadata), [], 'approved bugs are not new')
  assert.deepEqual(getTriageReasons({ ...item, tags: [], state: 'Active' }, options, metadata), [])
  assert.deepEqual(getTriageReasons({ ...item, state: 'Resolved' }, options, metadata), ['Tag: Triage'])
  assert.deepEqual(getTriageReasons({ ...item, workItemType: 'Task', state: 'Done' }, options, metadata), ['Tag: Triage'])
  assert.throws(() => getTriageReasons({ ...item, state: 'Unknown' }, options, metadata), /metadata is unavailable/)
  assert.equal(isUnderIteration('PROJECT\\TO REFINE\\child', 'Project\\To Refine\\'), true)
  assert.equal(isUnderIteration('Project\\To Refine2', 'Project\\To Refine'), false)
})

type Raw = { id: number; fields: Record<string, unknown> }
function raw(id: number, fields: Record<string, unknown> = {}, parent?: number): Raw {
  return {
    id,
    fields: {
      'System.Title': `Item ${id}`, 'System.WorkItemType': 'Bug', 'System.State': 'Reported',
      'System.CreatedDate': '2026-01-01T00:00:00Z', 'System.Tags': 'Triage; frontend',
      ...(parent ? { 'System.Parent': parent } : {}), ...fields,
    },
  }
}

function clientFor(rows: Raw[], parentMode: 'ok' | 'missing' | 'failure' = 'ok') {
  const requests: AdoRequestOptions[] = []
  const client: AdoRequestClient = {
    request: async <T>(request: AdoRequestOptions): Promise<T> => {
      requests.push(request)
      const body = request.body as { query?: string; ids?: number[]; fields?: string[]; $expand?: string }
      if (body?.fields && body.$expand) throw new Error('The expand parameter can not be used with the fields parameter. (HTTP 400)')
      let response: unknown
      if (request.path.endsWith('/wiql')) response = { workItems: [...rows.map(({ id }) => ({ id })), ...rows.slice(0, 1).map(({ id }) => ({ id }))] }
      else if (request.path.endsWith('/workitemicons')) response = { value: [{ id: 'icon_insect', url: 'https://example.com/bug.svg' }] }
      else if (body.fields?.includes('System.State')) response = { value: rows.filter((item) => body.ids?.includes(item.id)) }
      else {
        if (parentMode === 'failure') throw new Error('Parent query failed (HTTP 403).')
        response = { value: parentMode === 'missing' ? [] : body.ids?.map((id) => ({ id, fields: { 'System.Title': `Parent ${id}` } })) }
      }
      return response as T
    },
  }
  return { client, requests }
}

test('Open in ADO WIQL keeps the same rules on one line, listing finished states once unless a type reuses a name', () => {
  const distinct: ProjectWorkItemTypeInfo = {
    ...metadata,
    statesByType: { ...metadata.statesByType, task: [{ name: 'To Do', category: 'Proposed' }, { name: 'Done', category: 'Completed' }] },
  }
  const query = buildTriageQueryWiql("Project's", "Project's\\Team", options, distinct)
  assert.doesNotMatch(query, /\n/)
  assert.match(query, /^SELECT \[System.Id\], \[System.WorkItemType\], \[System.Title\], \[System.State\], \[System.AssignedTo\], \[System.Tags\], \[System.CreatedDate\] FROM WorkItems /)
  assert.match(query, /WHERE \[System.TeamProject\] = 'Project''s' AND \[System.AreaPath\] UNDER 'Project''s\\Team' AND \(\[System.Tags\] CONTAINS 'Triage' OR /)
  assert.match(query, /AND \[System.IterationPath\] NOT UNDER 'Project\\To Refine'\)\) AND \[System.State\] NOT IN \('Done', 'Cut'\) ORDER BY/)
  assert.match(query, /ORDER BY \[System.CreatedDate\] ASC, \[System.Id\] ASC$/)

  const reused = buildTriageQueryWiql('Project', 'Project\\Team', options, metadata)
  assert.match(reused, /AND \(\(\[System.WorkItemType\] = 'bug' AND \[System.State\] NOT IN \('Done', 'Cut'\)\) OR \(\[System.WorkItemType\] = 'task' AND \[System.State\] NOT IN \('Finished'\)\)\) ORDER BY/,
    "the task type's Done is unfinished, so each type lists its own finished states")
  assert.throws(() => buildTriageQueryWiql('P', 'P', { ...options, tags: [], includeNewBugs: false }, metadata), /at least one/)

  const url = new URL(buildAdoQueryUrl('my org', "Project's", reused))
  assert.equal(url.origin + url.pathname, "https://dev.azure.com/my%20org/Project's/_queries/query/")
  assert.equal(url.searchParams.get('wiql'), reused)
})

test('API maps creator, zero effort, parent summaries and reasons; deduplicates and sorts by created date then ID', async () => {  const fixture = clientFor([
    raw(4, { 'System.CreatedDate': undefined }),
    raw(3, { 'System.CreatedDate': '2026-01-02T00:00:00Z' }, 99),
    raw(2, { 'System.CreatedBy': { displayName: 'Reporter' }, 'Microsoft.VSTS.Scheduling.Effort': 0 }, 99),
    raw(1, { 'Microsoft.VSTS.Scheduling.StoryPoints': '5' }),
    raw(5, { 'System.Tags': 'PreTriage' }),
  ])
  const result = await fetchTriageItems(fixture.client, team, { ...options, includeNewBugs: false }, metadata)
  assert.deepEqual(result.items.map((item: { id: number }) => item.id), [1, 2, 3, 4])
  assert.equal(result.items[0].effort, 5)
  assert.equal(result.items[1].effort, 0)
  assert.equal(result.items[1].createdBy.displayName, 'Reporter')
  assert.equal(result.items[1].parent.title, 'Parent 99')
  assert.equal(result.items[1].parent.unavailable, false)
  assert.match(result.items[1].parent.workItemUrl, /\/99$/)
  assert.deepEqual(result.warnings, [])
  assert.equal(result.queryUrl, buildAdoQueryUrl(team.orgName, team.projectName, buildTriageQueryWiql(team.projectName, team.areaPath, { ...options, includeNewBugs: false }, metadata)))
  const itemRequests = fixture.requests.filter((request) => (request.body as { fields?: string[] })?.fields?.includes('System.State'))
  assert.ok(itemRequests.length > 0)
  for (const request of itemRequests) {
    const body = request.body as { fields: string[]; $expand?: string }
    assert.ok(body.fields.includes('System.Parent'), 'item batches request the immediate parent field')
    assert.equal(body.$expand, undefined, 'workitemsbatch rejects $expand alongside fields')
  }
  const parentRequests = fixture.requests.filter((request) => (request.body as { fields?: string[] })?.fields?.length === 1)
  assert.equal(parentRequests.length, 1)
  assert.deepEqual((parentRequests[0].body as { ids: number[] }).ids, [99])
})

test('API batches work items and parent IDs at 200, and does not load off-rule parent details', async () => {
  const fixture = clientFor(Array.from({ length: 450 }, (_, index) => raw(index + 1, {}, index + 1000)))
  const result = await fetchTriageItems(fixture.client, team, options, metadata)
  assert.equal(result.items.length, 450)
  const batches = fixture.requests.filter((request) => request.path.endsWith('/workitemsbatch'))
  assert.deepEqual(batches.map((request) => (request.body as { ids: number[] }).ids.length), [200, 200, 50, 200, 200, 50])
})

for (const mode of ['missing', 'failure'] as const) {
  test(`parent ${mode} keeps the item and known link with an explicit warning`, async () => {
    const { client } = clientFor([raw(1, {}, 99)], mode)
    const result = await fetchTriageItems(client, team, options, metadata)
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].parent.id, 99)
    assert.equal(result.items[0].parent.unavailable, true)
    assert.ok(result.warnings.some((warning: string) => /unavailable/.test(warning)))
  })
}

test('no rules performs no requests, while item query failures reject explicitly', async () => {
  const { client, requests } = clientFor([])
  assert.deepEqual(await fetchTriageItems(client, team, { ...options, tags: [], includeNewBugs: false }, metadata), { items: [], warnings: [] })
  assert.equal(requests.length, 0)
  await assert.rejects(() => fetchTriageItems({ request: async () => { throw new Error('HTTP 503') } }, team, options, metadata), /503/)
})

test('query engine isolates normalized cache keys by team, scope and options, invalidates and retries failures', async (t) => {
  let queries = 0
  let fail = false
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/workitemtypes')) {
      return Response.json({ value: Object.entries(metadata.statesByType).map(([name, states]) => ({ name, states })) })
    }
    if (url.pathname.endsWith('/wiql')) {
      queries++
      return fail ? new Response('', { status: 503 }) : Response.json({ workItems: [] })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  })
  const engine = new AdoQueryEngine('fixture-token')
  await Promise.all([engine.getTriageItems(team, options), engine.getTriageItems(team, { ...options, tags: [...options.tags].reverse() })])
  assert.equal(queries, 1, 'concurrent equivalent settings share a request')
  await engine.getTriageItems({ ...team, id: 'b' }, options)
  await engine.getTriageItems({ ...team, areaPath: 'Project\\Other' }, options)
  await engine.getTriageItems(team, { ...options, tags: ['Other'] })
  assert.equal(queries, 4)
  engine.clearTriageDataCache('a')
  await engine.getTriageItems({ ...team, id: 'b' }, options)
  assert.equal(queries, 4, 'another team cache is retained')
  fail = true
  await assert.rejects(() => engine.getTriageItems(team, options), /503/)
  fail = false
  await engine.getTriageItems(team, options)
  assert.equal(queries, 6, 'a rejected cache entry is evicted')
})

test('query engine ignores excluded iteration paths while the new-bug rule is off', async (t) => {
  const bodies: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/workitemtypes')) {
      return Response.json({ value: Object.entries(metadata.statesByType).map(([name, states]) => ({ name, states })) })
    }
    if (url.pathname.endsWith('/wiql')) {
      bodies.push(String(init?.body))
      return Response.json({ workItems: [] })
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  })
  const engine = new AdoQueryEngine('fixture-token')
  const off = { ...options, includeNewBugs: false }
  await engine.getTriageItems(team, off)
  await engine.getTriageItems(team, { ...off, excludedIterationPaths: [] })
  await engine.getTriageItems(team, { ...off, excludedIterationPaths: ['Project\\Elsewhere'] })
  assert.equal(bodies.length, 1, 'paths that are not in use share one cached query')
  assert.doesNotMatch(bodies[0], /IterationPath/)
})
