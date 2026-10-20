import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { createServer } from 'vite'
import type { WorkItemSummary } from '../src/ado/types'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(() => server.close())
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')

const team = { id: 'team', orgName: 'example-org', projectName: 'example-project', repoName: 'SharePortal' }
const members = [{ displayName: 'Team Member', uniqueName: 'member@example.com' }]

function mockPullRequests(t: TestContext) {
  const requests: URL[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (!url.pathname.endsWith('/pullrequests')) {
      return Response.json({ value: [] })
    }
    requests.push(url)
    const value = url.pathname.includes('/repositories/SharePortal/')
      && url.searchParams.get('searchCriteria.status') === 'active'
      ? [{
        pullRequestId: 682196,
        status: 'active',
        createdBy: members[0],
      }]
      : []
    return Response.json({ value })
  })
  return requests
}

test('repository changes reload standalone PRs, including when restoring the original repository', async (t) => {
  const requests = mockPullRequests(t)
  const engine = new AdoQueryEngine('')
  const load = (profile = team): Promise<WorkItemSummary[]> =>
    engine.getUnlinkedActivePullRequestItems(profile, members, [], null)

  assert.deepEqual((await load()).map((item) => item.id), [-682196])
  await load()
  assert.equal(requests.length, 2, 'unchanged configuration uses the cache')

  assert.deepEqual(await load({ ...team, repoName: 'ConstructSim' }), [])
  assert.deepEqual((await load()).map((item) => item.id), [-682196])
  assert.deepEqual(
    requests.map((url) => [url.pathname.split('/repositories/')[1], url.searchParams.get('searchCriteria.status')]),
    [
      ['SharePortal/pullrequests', 'active'],
      ['SharePortal/pullrequests', 'completed'],
      ['ConstructSim/pullrequests', 'active'],
      ['ConstructSim/pullrequests', 'completed'],
      ['SharePortal/pullrequests', 'active'],
      ['SharePortal/pullrequests', 'completed'],
    ],
  )
})

test('repository cache identity includes organization and project', async (t) => {
  const requests = mockPullRequests(t)
  const engine = new AdoQueryEngine('')
  for (const profile of [
    team,
    { ...team, orgName: 'other-org' },
    { ...team, projectName: 'other-project' },
  ]) {
    await engine.getUnlinkedActivePullRequestItems(profile, members, [], null)
  }
  assert.equal(requests.length, 6)
  assert.equal(requests[2].pathname, '/other-org/example-project/_apis/git/repositories/SharePortal/pullrequests')
  assert.equal(requests[4].pathname, '/example-org/other-project/_apis/git/repositories/SharePortal/pullrequests')
})

test('Refresh clears repository-aware PR entries only for the requested team', async (t) => {
  const requests = mockPullRequests(t)
  const engine = new AdoQueryEngine('')
  const otherTeam = { ...team, id: 'other-team' }
  const load = (profile = team) => engine.getUnlinkedActivePullRequestItems(profile, members, [], null)

  await load()
  await load(otherTeam)
  engine.clearDevelopmentDataCache(team.id)
  await load(otherTeam)
  assert.equal(requests.length, 4)
  await load()
  assert.equal(requests.length, 6)

  engine.clearDevelopmentDataCache()
  await load()
  await load(otherTeam)
  assert.equal(requests.length, 10)
})

test('PRs linked to visible work items remain excluded from standalone cards after a repository change', async (t) => {
  mockPullRequests(t)
  const engine = new AdoQueryEngine('')
  await engine.getUnlinkedActivePullRequestItems({ ...team, repoName: 'ConstructSim' }, members, [], null)
  const workItems = [{ id: 123, linkedPullRequestIds: [682196] }] as WorkItemSummary[]
  assert.deepEqual(await engine.getUnlinkedActivePullRequestItems(team, members, workItems, null), [])
  assert.deepEqual(workItems[0].linkedPullRequestIds, [682196])
})
