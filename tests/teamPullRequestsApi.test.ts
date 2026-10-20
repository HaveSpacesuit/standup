import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestOptions } from '../src/ado/httpClient'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
})
after(() => server.close())
const { fetchUnlinkedActivePullRequestItems } = await server.ssrLoadModule('/src/ado/teamPullRequestsApi.ts')

test('completed unlinked PRs are selected by their completion date', async () => {
  const pullRequests = [
    { pullRequestId: 1, status: 'completed', creationDate: '2026-10-09T12:00:00Z', closedDate: '2026-10-13T12:00:00Z' },
    { pullRequestId: 2, status: 'completed', creationDate: '2026-10-08T12:00:00Z', closedDate: '2026-10-11T12:00:00Z' },
    { pullRequestId: 3, status: 'completed', creationDate: '2026-10-13T12:00:00Z', closedDate: '2026-10-13T13:00:00Z' },
    { pullRequestId: 4, status: 'completed', creationDate: '2026-10-09T12:00:00Z' },
    { pullRequestId: 5, status: 'completed', creationDate: '2026-10-29T12:00:00Z', closedDate: '2026-10-31T12:00:00Z' },
  ].map((pullRequest) => ({
    ...pullRequest,
    createdBy: { displayName: 'Team Member', uniqueName: 'member@example.com' },
  }))
  const client = {
    async request<T>(options: AdoRequestOptions): Promise<T> {
      if (options.path.endsWith('/_apis/git/repositories/repo/pullrequests')) {
        const value = options.params?.['searchCriteria.status'] === 'completed' ? pullRequests : []
        return { value } as T
      }
      return {} as T
    },
    async requestPage<T>(): Promise<{ data: T; continuationToken: null }> {
      throw new Error('requestPage should not be called')
    },
  }

  const items = await fetchUnlinkedActivePullRequestItems(
    client,
    { orgName: 'pr-sprint-filter-test-org', projectName: 'project', repoName: 'repo' },
    [{ displayName: 'Team Member', uniqueName: 'member@example.com' }],
    [],
    { name: 'Sprint', fullName: 'Project\\Sprint', startDate: '2026-10-12', finishDate: '2026-10-30' },
  )

  assert.deepEqual(items.map((item: { pullRequest?: { id: number } }) => item.pullRequest?.id), [1, 3])
})
