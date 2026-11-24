import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { buildIterationMembershipWiql } = await server.ssrLoadModule('/src/ado/wiql.ts')
const { fetchSprintScopeChanges } = await server.ssrLoadModule('/src/ado/workItemsApi.ts')
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')

test('iteration membership WIQL pins the exact iteration and appends ASOF last', () => {
  const query = buildIterationMembershipWiql("O'Project", 'Area\\Team', 'Project\\Sprint 1', ['Bug'], '2026-10-19T05:00:00.000Z')
  assert.match(query, /\[System\.TeamProject\] = 'O''Project'/)
  assert.match(query, /\[System\.IterationPath\] = 'Project\\Sprint 1'/)
  assert.match(query, /\[System\.WorkItemType\] IN \('Bug'\)/)
  assert.match(query, /\nASOF '2026-10-19T05:00:00\.000Z'$/)
  assert.doesNotMatch(buildIterationMembershipWiql('P', 'A', 'I'), /ASOF/)
})

test('a forced scope refresh bypasses cached current membership but keeps ordinary reads cached', async (t) => {
  let moved = false
  let membershipQueries = 0
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url)
    let body: unknown
    if (path.includes('/_apis/wit/wiql')) {
      membershipQueries++
      const query = JSON.parse(String(init?.body)).query as string
      body = { workItems: query.includes('ASOF') || !moved ? [{ id: 1 }] : [] }
    } else if (path.includes('/_apis/wit/workitemsbatch')) {
      body = { value: [{ id: 1, fields: { 'System.Title': 'Moved item', 'System.IterationPath': 'Project\\Next' } }] }
    } else if (path.includes('/_apis/wit/workitemicons')) {
      body = { value: [] }
    } else {
      throw new Error(`Unexpected request ${path}`)
    }
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  })
  const engine = new AdoQueryEngine('nonfunctional-test-token')
  const team = { id: 'team', orgName: 'org', projectName: 'project', areaPath: 'Area' }
  const args = [team, 'Project\\Sprint', '2026-10-19T05:00:00.000Z'] as const
  assert.deepEqual((await engine.getSprintScopeChanges(...args)).removedItems, [])
  moved = true
  assert.deepEqual((await engine.getSprintScopeChanges(...args)).removedItems, [])
  assert.equal(membershipQueries, 2)
  const refreshed = await engine.getSprintScopeChanges(...args, undefined, { forceRefresh: true })
  assert.deepEqual(refreshed.removedItems.map((item: { id: number }) => item.id), [1])
  assert.equal(membershipQueries, 4)
  assert.equal(await engine.getSprintScopeChanges(...args), refreshed)
})

test('sprint scope changes report start members and fetch only removed items without PR lookups', async () => {
  const requests: { path: string; body?: { query?: string; ids?: number[] } }[] = []
  const client = {
    async request(options: { path: string; body?: { query?: string; ids?: number[] } }) {
      requests.push(options)
      if (options.path.endsWith('/_apis/wit/wiql')) {
        const ids = options.body?.query?.includes('ASOF') ? [1, 2, 3] : [2, 3, 4]
        return { workItems: ids.map((id) => ({ id })) }
      }
      if (options.path === '/_apis/wit/workitemsbatch') {
        return { value: options.body?.ids?.map((id) => ({ id, fields: { 'System.Title': `Item ${id}`, 'Microsoft.VSTS.Scheduling.Effort': 5 } })) }
      }
      if (options.path === '/_apis/wit/workitemicons') {
        return { value: [] }
      }
      throw new Error(`Unexpected request ${options.path}`)
    },
  }

  const result = await fetchSprintScopeChanges(client, { orgName: 'org', projectName: 'project', areaPath: 'Area' }, 'Project\\Sprint', '2026-10-19T05:00:00.000Z')
  assert.deepEqual(result.startItemIds, [1, 2, 3])
  assert.deepEqual(result.removedItems.map((item: { id: number; effort?: number }) => [item.id, item.effort]), [[1, 5]])
  assert.deepEqual(requests.find((request) => request.path === '/_apis/wit/workitemsbatch')?.body?.ids, [1])
  assert.ok(requests.every((request) => !request.path.includes('pullrequest') && !request.path.includes('pullRequests')))
})
