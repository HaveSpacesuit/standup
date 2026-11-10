import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestClient, AdoRequestOptions } from '../src/ado/httpClient.ts'
import type { ProjectWorkItemTypeInfo } from '../src/ado/workItemTypesApi.ts'
import type { TriageOptions } from '../src/features/standup/utils/triageOptions.ts'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { buildAdoQueryUrl, buildTriageQueryWiql, buildTriageWiql } = await server.ssrLoadModule('/src/ado/wiql.ts')
const {
  fetchTriageItems, getTriageReasons, hasRichTextContent, isUnderIteration, summarizeTriageHistory, toPlainText, TRIAGE_HISTORY_LIMIT,
} = await server.ssrLoadModule('/src/ado/triageApi.ts')
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
const options: TriageOptions = { tags: ['Triage', "Team's queue"], includeNewBugs: true, excludedIterationPaths: ['Project\\To Refine'], ageFlagDays: 2,
  readinessChecks: { bug: ['reproSteps'], other: [] }, waitingTags: ['Needs Info'],
}
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

type History = { updates?: Record<number, unknown[] | Error>; comments?: Record<number, unknown[]> }

function clientFor(rows: Raw[], parentMode: 'ok' | 'missing' | 'failure' = 'ok', history: History = {}) {
  const requests: AdoRequestOptions[] = []
  const client: AdoRequestClient = {
    request: async <T>(request: AdoRequestOptions): Promise<T> => {
      requests.push(request)
      const id = Number(request.path.match(/\/workItems\/(\d+)\//)?.[1])
      if (request.path.endsWith('/updates')) {
        const updates = history.updates?.[id] ?? []
        if (updates instanceof Error) throw updates
        const skip = Number(request.params?.$skip ?? 0)
        return { value: updates.slice(skip, skip + Number(request.params?.$top)) } as T
      }
      if (request.path.endsWith('/comments')) return { comments: history.comments?.[id] ?? [] } as T
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

test('API keeps only whether each readiness text field has content, counting a pasted screenshot but not empty markup', async () => {
  assert.equal(hasRichTextContent('<div>Open the file, then save.</div>'), true)
  assert.equal(hasRichTextContent('<div><img src="https://dev.azure.com/org/_apis/wit/attachments/1"></div>'), true)
  for (const empty of [undefined, null, 42, '', '   ', '<div><br></div>', '<p>&nbsp;</p>', '<div>&#160;</div>']) {
    assert.equal(hasRichTextContent(empty), false, String(empty))
  }
  const fixture = clientFor([
    raw(1, { 'Microsoft.VSTS.TCM.ReproSteps': '<ol><li>Open a file</li></ol>', 'System.Description': '<div><br></div>' }),
    raw(2, { 'Microsoft.VSTS.Common.AcceptanceCriteria': '<img src="x.png">' }),
  ])
  const result = await fetchTriageItems(fixture.client, team, options, metadata)
  assert.deepEqual(result.items.map((item: { filledText: unknown }) => item.filledText), [
    { reproSteps: true, acceptanceCriteria: false, description: false },
    { reproSteps: false, acceptanceCriteria: true, description: false },
  ])
  assert.ok(!JSON.stringify(result.items).includes('Open a file'), 'the field text itself is not kept')
  const fields = (fixture.requests.find((request) => (request.body as { fields?: string[] })?.fields?.includes('System.State'))!.body as { fields: string[] }).fields
  for (const field of ['Microsoft.VSTS.TCM.ReproSteps', 'Microsoft.VSTS.Common.AcceptanceCriteria', 'System.Description']) {
    assert.ok(fields.includes(field), field)
  }
})

test('API batches work items and parent IDs at 200, and does not load off-rule parent details', async () => {
  const fixture = clientFor(Array.from({ length: 450 }, (_, index) => raw(index + 1, {}, index + 1000)))
  const result = await fetchTriageItems(fixture.client, team, options, metadata)
  assert.equal(result.items.length, 450)
  const batches = fixture.requests.filter((request) => request.path.endsWith('/workitemsbatch'))
  assert.deepEqual(batches.map((request) => (request.body as { ids: number[] }).ids.length), [200, 200, 50, 200, 200, 50])
  assert.ok(!fixture.requests.some((request) => request.path.endsWith('/updates')), `no history past ${TRIAGE_HISTORY_LIMIT} items`)
  assert.deepEqual(result.warnings, [`History loads for up to ${TRIAGE_HISTORY_LIMIT} items, so ages count from when each item was created and replies are not shown.`])
})

const update = (at: string, fields: Record<string, unknown>, by = 'Ana') => ({
  revisedDate: '9999-01-01T00:00:00Z',
  revisedBy: { displayName: by, uniqueName: `${by.toLowerCase()}@example.com` },
  fields: { 'System.ChangedDate': { newValue: at }, ...Object.fromEntries(Object.entries(fields).map(([field, newValue]) => [field, { newValue }])) },
})

test('history replays when each current tag was last added and when the state last changed', () => {
  const history = summarizeTriageHistory([
    update('2026-04-01T09:00:00Z', { 'System.State': 'Reported', 'System.Tags': 'frontend' }),
    update('2026-04-02T09:00:00Z', { 'System.Tags': 'frontend; Triage' }, 'Ben'),
    update('2026-04-03T09:00:00Z', { 'System.Tags': 'frontend' }),
    update('2026-04-04T09:00:00Z', { 'System.Tags': 'Frontend; TRIAGE; Needs Info' }, 'Cy'),
    update('2026-04-05T09:00:00Z', { 'System.Title': 'Renamed' }),
    update('2026-04-06T09:00:00Z', { 'System.State': 'Active' }, 'Dee'),
    update('2026-04-07T09:00:00Z', { 'System.State': 'Reported' }, 'Eve'),
  ])
  assert.deepEqual(Object.keys(history.tagsAdded).sort(), ['frontend', 'needs info', 'triage'])
  assert.equal(history.tagsAdded.frontend.at, '2026-04-01T09:00:00Z', 'a change in case is not a new tag')
  assert.equal(history.tagsAdded.triage.at, '2026-04-04T09:00:00Z', 'a tag removed and added again counts from the second time')
  assert.equal(history.tagsAdded.triage.by.displayName, 'Cy')
  assert.equal(history.stateSince.at, '2026-04-07T09:00:00Z')
  assert.equal(history.stateSince.by.displayName, 'Eve')
  assert.deepEqual(summarizeTriageHistory([]), { tagsAdded: {}, stateSince: undefined })
})

test('comment text becomes one short line for a tooltip, naming images and decoding entities', () => {
  assert.equal(toPlainText('<div>Can&#39;t repro on&nbsp;<b>v2</b></div>\n<div><img src="x.png"></div><p>&lt;tag&gt; &amp; &#x1F600; &bogus;</p>'),
    "Can't repro on v2 (image) <tag> & 😀 &bogus;")
  assert.equal(toPlainText(`<p>${'word '.repeat(20)}</p>`, 24), 'word word word word wor…')
  assert.equal(toPlainText('<div><br></div>'), '')
})

test('API loads each item history, paging past 200 updates, and the newest comment only when there are comments', async () => {
  const many = Array.from({ length: 250 }, (_, index) => update(`2026-04-02T${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00Z`, { 'System.Title': `Title ${index}` }))
  many[0] = update('2026-04-01T09:00:00Z', { 'System.State': 'Reported', 'System.Tags': 'frontend' })
  many[249] = update('2026-04-03T09:00:00Z', { 'System.Tags': 'frontend; Triage; Needs Info' }, 'Ben')
  const fixture = clientFor([
    raw(1, { 'System.CommentCount': 2 }),
    raw(2, { 'System.CommentCount': 0 }),
  ], 'ok', {
    updates: { 1: many },
    comments: { 1: [{ text: '<div>Still happens on <b>main</b></div>', createdDate: '2026-04-04T10:00:00Z', createdBy: { displayName: 'Cy' } }] },
  })
  const result = await fetchTriageItems(fixture.client, team, options, metadata)
  assert.deepEqual(result.warnings, [])
  const [first, second] = result.items
  assert.equal(first.history.tagsAdded.triage.at, '2026-04-03T09:00:00Z')
  assert.equal(first.history.tagsAdded['needs info'].by.displayName, 'Ben')
  assert.equal(first.history.stateSince.at, '2026-04-01T09:00:00Z')
  assert.equal(first.latestComment.at, '2026-04-04T10:00:00Z')
  assert.equal(first.latestComment.by.displayName, 'Cy')
  assert.equal(first.latestComment.text, 'Still happens on main')
  assert.equal(first.inInitialState, true)
  assert.deepEqual(second.history, { tagsAdded: {}, stateSince: undefined })
  assert.equal(second.latestComment, undefined)
  const pages = fixture.requests.filter((request) => request.path.endsWith('/workItems/1/updates'))
  assert.deepEqual(pages.map((request) => [request.method, request.params?.$skip, request.params?.$top]), [['GET', 0, 200], ['GET', 200, 200]])
  const comments = fixture.requests.filter((request) => request.path.endsWith('/comments'))
  assert.deepEqual(comments.map((request) => [request.path, request.params?.order, request.params?.$top]), [['/Project/_apis/wit/workItems/1/comments', 'desc', 1]])
})

test('history that fails to load keeps the item, counting from creation, with an explicit warning', async () => {
  const fixture = clientFor([raw(1), raw(2)], 'ok', { updates: { 1: new Error('HTTP 500') } })
  const result = await fetchTriageItems(fixture.client, team, options, metadata)
  assert.deepEqual(result.items.map((item: { id: number }) => item.id), [1, 2])
  assert.equal(result.items[0].history, undefined)
  assert.ok(result.items[1].history)
  assert.deepEqual(result.warnings, ['Some item history could not be loaded, so those ages count from when the item was created and replies may be missing.'])
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
