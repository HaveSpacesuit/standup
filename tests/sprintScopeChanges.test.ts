import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { buildIterationMembershipWiql } = await server.ssrLoadModule('/src/ado/wiql.ts')
const { fetchSprintScopeChanges } = await server.ssrLoadModule('/src/ado/workItemsApi.ts')

test('iteration membership WIQL pins the exact iteration and appends ASOF last', () => {
  const query = buildIterationMembershipWiql("O'Project", 'Area\\Team', 'Project\\Sprint 1', ['Bug'], '2026-10-19T05:00:00.000Z')
  assert.match(query, /\[System\.TeamProject\] = 'O''Project'/)
  assert.match(query, /\[System\.IterationPath\] = 'Project\\Sprint 1'/)
  assert.match(query, /\[System\.WorkItemType\] IN \('Bug'\)/)
  assert.match(query, /\nASOF '2026-10-19T05:00:00\.000Z'$/)
  assert.doesNotMatch(buildIterationMembershipWiql('P', 'A', 'I'), /ASOF/)
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
