import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
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
const { useBoardViewModel } = await server.ssrLoadModule('/src/features/standup/hooks/useBoardViewModel.ts')
const { createDefaultAssignmentOptions } = await server.ssrLoadModule('/src/features/standup/utils/standupOptionDefaults.ts')

const team = {
  id: 'team',
  orgName: 'example-org',
  projectName: 'example-project',
  teamName: 'Example team',
  areaPath: 'example-project\\Example team',
  iterationPath: 'example-project',
}
const teamProfiles = [team]
const assignmentOptionsByTeam = { [team.id]: createDefaultAssignmentOptions() }

type BugFixture = { id: number; fields: Record<string, unknown> }

const minorGlitch: BugFixture = {
  id: 101,
  fields: { 'System.Title': 'Minor glitch', 'Microsoft.VSTS.Common.Severity': '4 - Low', 'Microsoft.VSTS.Common.Priority': 4 },
}
const dataLoss: BugFixture = {
  id: 102,
  fields: {
    'System.Title': 'Data loss',
    'Microsoft.VSTS.Common.Severity': '1 - Critical',
    'Microsoft.VSTS.Common.Priority': 1,
    'Microsoft.VSTS.Scheduling.Effort': 4,
  },
}
const slowPage: BugFixture = {
  id: 103,
  fields: {
    'System.Title': 'Slow page',
    'Microsoft.VSTS.Common.Severity': '3 - Medium',
    'Microsoft.VSTS.Common.Priority': 2,
    'Microsoft.VSTS.Scheduling.Effort': 8,
  },
}
const brokenLink: BugFixture = {
  id: 104,
  fields: {
    'System.Title': 'Broken link',
    'Microsoft.VSTS.Common.Severity': '2 - High',
    'Microsoft.VSTS.Common.Priority': 2,
    'Microsoft.VSTS.Scheduling.Effort': 4,
  },
}

const isBacklogQuery = (query: string | undefined) => Boolean(query?.includes("[System.WorkItemType] = 'Bug'"))

function mockAzureDevOps(
  t: TestContext,
  state: { bugs: BugFixture[]; metadataStatus?: number; wiqlStatus?: number },
) {
  const requests: Array<{ url: URL; body?: { query?: string; ids?: number[]; fields?: string[] } }> = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    requests.push({ url, body })

    if (url.pathname.endsWith('/_apis/wit/workitemtypes')) {
      return state.metadataStatus
        ? Response.json({ message: 'Metadata unavailable' }, { status: state.metadataStatus })
        : Response.json({
          value: [{ name: 'Bug', states: [{ name: 'Active', category: 'InProgress' }, { name: 'Closed', category: 'Completed' }] }],
        })
    }
    if (url.pathname.endsWith('/_apis/wit/wiql') && isBacklogQuery(body?.query)) {
      return state.wiqlStatus
        ? Response.json({ message: 'Query unavailable' }, { status: state.wiqlStatus })
        : Response.json({ workItems: state.bugs.map(({ id }) => ({ id })) })
    }
    if (url.pathname.endsWith('/_apis/wit/workitemsbatch') && body?.fields?.includes('Microsoft.VSTS.Common.Severity')) {
      return Response.json({ value: state.bugs.filter(({ id }) => body.ids?.includes(id)) })
    }
    return Response.json({ value: [], workItems: [] })
  })

  return {
    backlogQueries: () => requests.filter((request) => isBacklogQuery(request.body?.query)),
    metadataRequests: () => requests.filter((request) => request.url.pathname.endsWith('/_apis/wit/workitemtypes')),
  }
}

async function renderBoard(t: TestContext, view: string) {
  dom.window.history.replaceState(null, '', `/#${view}`)
  const holder: { result?: ReturnType<typeof useBoardViewModel> } = {}
  function Board() {
    holder.result = useBoardViewModel({ pat: 'test-pat', teamProfiles, assignmentOptionsByTeam })
    return null
  }
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  await act(async () => root.render(createElement(Board)))

  return () => holder.result!
}

const ids = (bugs: Array<{ id: number }>) => bugs.map((bug) => bug.id)

test('the Backlog view loads the selected team\'s open bugs ranked by value', async (t) => {
  const api = mockAzureDevOps(t, { bugs: [minorGlitch, dataLoss, slowPage] })
  const result = await renderBoard(t, 'backlog')

  assert.deepEqual(ids(result().backlogBugs), [102, 103, 101])
  const expectedValues = [212.96, 11, 2.5]
  result().backlogBugs.forEach((bug: { value: number }, index: number) => {
    assert.ok(Math.abs(bug.value - expectedValues[index]) < 1e-9, `value ${bug.value} should be ${expectedValues[index]}`)
  })
  assert.equal(result().backlogBugsLoading, false)
  assert.equal(result().backlogBugsError, null)

  assert.equal(api.backlogQueries().length, 1)
  const query = api.backlogQueries()[0].body!.query!
  assert.match(query, /\[System\.AreaPath\] UNDER 'example-project\\Example team'/)
  assert.match(query, /\[System\.State\] NOT IN \('Closed'\)/)
})

test('Refresh on the Backlog view queries the bugs and the work item metadata again', async (t) => {
  const state = { bugs: [minorGlitch, dataLoss, slowPage] }
  const api = mockAzureDevOps(t, state)
  const result = await renderBoard(t, 'backlog')
  assert.equal(api.backlogQueries().length, 1)
  assert.equal(api.metadataRequests().length, 1, 'the closed-state lookup shares one metadata request')

  state.bugs = [minorGlitch, dataLoss, slowPage, brokenLink]
  await act(async () => result().onRefresh())

  assert.equal(api.backlogQueries().length, 2)
  assert.equal(api.metadataRequests().length, 2)
  assert.deepEqual(ids(result().backlogBugs), [102, 104, 103, 101])
  assert.equal(result().backlogBugsError, null)
})

for (const view of ['development', 'qa-activity', 'tests']) {
  test(`the ${view} view never queries the backlog`, async (t) => {
    const api = mockAzureDevOps(t, { bugs: [dataLoss] })
    const result = await renderBoard(t, view)

    assert.equal(api.backlogQueries().length, 0)
    assert.deepEqual(result().backlogBugs, [])
    assert.equal(result().backlogBugsLoading, false)
    assert.equal(result().backlogBugsError, null)

    await act(async () => result().onRefresh())
    assert.equal(api.backlogQueries().length, 0, 'Refresh on another page does not load the backlog either')
  })
}

test('the backlog loads when the page is opened from another view', async (t) => {
  const api = mockAzureDevOps(t, { bugs: [dataLoss, slowPage] })
  const result = await renderBoard(t, 'development')
  assert.equal(api.backlogQueries().length, 0)

  dom.window.history.replaceState(null, '', '/#backlog')
  await act(async () => { dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')) })

  assert.equal(api.backlogQueries().length, 1)
  assert.deepEqual(ids(result().backlogBugs), [102, 103])
  assert.equal(result().backlogBugsLoading, false)

  dom.window.history.replaceState(null, '', '/#development')
  await act(async () => { dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')) })
  dom.window.history.replaceState(null, '', '/#backlog')
  await act(async () => { dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')) })

  assert.equal(api.backlogQueries().length, 1, 'returning to the page reuses the cached bugs until Refresh')
  assert.deepEqual(ids(result().backlogBugs), [102, 103])
})

test('a failed backlog query is reported as an error and cleared by a successful Refresh', async (t) => {
  const state: { bugs: BugFixture[]; wiqlStatus?: number } = { bugs: [dataLoss], wiqlStatus: 503 }
  mockAzureDevOps(t, state)
  const result = await renderBoard(t, 'backlog')

  assert.equal(result().backlogBugsError, 'Azure DevOps query failed (HTTP 503). Try refreshing.')
  assert.deepEqual(result().backlogBugs, [])
  assert.equal(result().backlogBugsLoading, false)

  state.wiqlStatus = undefined
  await act(async () => result().onRefresh())

  assert.equal(result().backlogBugsError, null)
  assert.deepEqual(ids(result().backlogBugs), [102])
})

test('a metadata failure is reported as a backlog error instead of guessing the closed states', async (t) => {
  const api = mockAzureDevOps(t, { bugs: [dataLoss], metadataStatus: 503 })
  const result = await renderBoard(t, 'backlog')

  assert.equal(result().backlogBugsError, 'Azure DevOps query failed (HTTP 503). Try refreshing.')
  assert.deepEqual(result().backlogBugs, [])
  assert.equal(api.backlogQueries().length, 0)
})
