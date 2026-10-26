import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { act, createElement } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
})
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: dom.window.localStorage })
const { createRoot } = await import('react-dom/client')
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(async () => {
  await server.close()
  dom.window.close()
})
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')
const { useProjectWorkItemStates } = await server.ssrLoadModule('/src/features/standup/hooks/useProjectWorkItemStates.ts')
const { useBoardViewModel } = await server.ssrLoadModule('/src/features/standup/hooks/useBoardViewModel.ts')
const { createDefaultAssignmentOptions } = await server.ssrLoadModule('/src/features/standup/utils/standupOptionDefaults.ts')
const team = { id: 'team', orgName: 'example-org', projectName: 'example-project' }

test('failed metadata remains an error until retry, then restores types and states without reloading', async (t) => {
  let available = false
  let requests = 0
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    assert.match(String(input), /\/_apis\/wit\/workitemtypes\?/)
    requests++
    return available
      ? Response.json({ value: [
        { name: 'Bug', states: [{ name: 'Active', category: 'InProgress' }] },
        { name: 'Product Backlog Item' },
      ] })
      : Response.json({ message: 'Metadata temporarily unavailable' }, { status: 503 })
  })
  const engine = new AdoQueryEngine('')
  let result: ReturnType<typeof useProjectWorkItemStates>
  function Metadata() {
    result = useProjectWorkItemStates({ adoQueryEngine: engine, selectedTeam: team })
    return null
  }
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  await act(async () => root.render(createElement(Metadata)))

  assert.match(result!.workItemStatesError, /Unable to load work item types and states.*503.*Metadata temporarily unavailable/)
  assert.deepEqual(result!.workItemTypes, [])
  assert.equal(result!.workItemStatesLoading, false)
  assert.equal(requests, 1, 'states and types share one request')

  await act(async () => result!.retryWorkItemStates())
  assert.match(result!.workItemStatesError, /503/)
  assert.equal(requests, 2, 'a failed retry can be retried again')

  available = true
  await act(async () => result!.retryWorkItemStates())
  assert.equal(result!.workItemStatesError, null)
  assert.deepEqual(result!.workItemTypes, ['Bug', 'Product Backlog Item'])
  assert.deepEqual(result!.workItemStates, [{ name: 'Active', category: 'InProgress' }])
  assert.equal(requests, 3)

  await act(async () => result!.retryWorkItemStates())
  assert.equal(requests, 4, 'refresh invalidates successful metadata too')
})

test('successful empty metadata is not a failure, and removing the client clears errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ value: [] }))
  let engine = new AdoQueryEngine('')
  let result: ReturnType<typeof useProjectWorkItemStates>
  function Metadata() {
    result = useProjectWorkItemStates({ adoQueryEngine: engine, selectedTeam: team })
    return null
  }
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  await act(async () => root.render(createElement(Metadata)))
  assert.deepEqual(result!.workItemTypes, [])
  assert.deepEqual(result!.workItemStates, [])
  assert.equal(result!.workItemStatesError, null)
  assert.equal(result!.workItemStatesLoading, false)

  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network unavailable') })
  await act(async () => result!.retryWorkItemStates())
  assert.match(result!.workItemStatesError, /Network unavailable/)
  engine = null
  await act(async () => root.render(createElement(Metadata)))
  assert.equal(result!.workItemStatesError, null)
  assert.deepEqual(result!.workItemTypes, [])
})

for (const view of ['development', 'qa-activity']) {
  test(`${view} toolbar Refresh retries metadata without disrupting successful board requests`, async (t) => {
    dom.window.history.replaceState(null, '', `/#${view}`)
    let available = false
    let metadataRequests = 0
    t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/_apis/wit/workitemtypes')) {
        metadataRequests++
        return available
          ? Response.json({ value: [{ name: 'Bug' }, { name: 'Product Backlog Item' }] })
          : Response.json({ message: 'Metadata temporarily unavailable' }, { status: 503 })
      }
      return Response.json({ value: [], workItems: [] })
    })
    const teamProfiles = [{ ...team, teamName: 'Example team', areaPath: 'Project', iterationPath: 'Project' }]
    const assignmentOptionsByTeam = { [team.id]: createDefaultAssignmentOptions() }
    let result: ReturnType<typeof useBoardViewModel>
    function Board() {
      result = useBoardViewModel({ pat: 'test-pat', teamProfiles, assignmentOptionsByTeam })
      return null
    }
    const root = createRoot(document.createElement('div'))
    t.after(() => act(() => root.unmount()))
    await act(async () => root.render(createElement(Board)))
    assert.match(result!.projectWorkItemStatesError, /503.*Metadata temporarily unavailable/)
    assert.equal(result!.workItemsError, null)
    assert.equal(result!.membersError, null)
    assert.equal(result!.isTeamDataLoading, false)
    assert.equal(metadataRequests, 1)

    available = true
    await act(async () => result!.onRefresh())
    assert.equal(metadataRequests, 2)
    assert.equal(result!.projectWorkItemStatesError, null)
    assert.deepEqual(result!.projectWorkItemTypes, ['Bug', 'Product Backlog Item'])
    assert.equal(result!.workItemsError, null)
    assert.equal(result!.membersError, null)
  })
}

test('iteration-window failures block board results after team iteration metadata loads', async (t) => {
  dom.window.history.replaceState(null, '', '/#development')
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname.includes('/_apis/projects/') && url.pathname.includes('/teams/')) {
      return Response.json({ id: 'team-id' })
    }
    if (url.pathname.endsWith('/_apis/work/teamsettings/iterations')) {
      return url.searchParams.has('$timeframe')
        ? Response.json({ message: 'Iteration window unavailable' }, { status: 503 })
        : Response.json({ value: [] })
    }
    return Response.json({ value: [], workItems: [] })
  })
  const teamProfiles = [{ ...team, teamName: 'Example team', areaPath: 'Project', iterationPath: 'Project' }]
  const assignmentOptionsByTeam = { [team.id]: createDefaultAssignmentOptions() }
  let result: ReturnType<typeof useBoardViewModel>
  function Board() {
    result = useBoardViewModel({ pat: 'test-pat', teamProfiles, assignmentOptionsByTeam })
    return null
  }
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  await act(async () => root.render(createElement(Board)))

  assert.match(result!.teamIterationsError, /503.*Iteration window unavailable/)
  assert.equal(result!.workItemsError, null)
  assert.equal(result!.isTeamDataLoading, false)
})
