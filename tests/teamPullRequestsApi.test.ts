import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestOptions } from '../src/ado/httpClient'
import type { WorkItemSummary } from '../src/ado/types'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
})
after(() => server.close())
const { fetchUnlinkedActivePullRequestItems } = await server.ssrLoadModule('/src/ado/teamPullRequestsApi.ts')
const { fetchWorkItemsForCurrentAndNextIteration } = await server.ssrLoadModule('/src/ado/workItemsApi.ts')

for (const linked of [true, false]) {
  test(`${linked ? 'linked' : 'standalone'} PRs carry their own review policy using one policy request per PR`, async () => {
    const policyRequests: number[] = []
    const requirements = [0, 1, 2, 3]
    const pullRequests = requirements.map((count, index) => ({
      pullRequestId: index + 1,
      title: `PR ${index + 1}`,
      status: 'active',
      repository: { id: 'repo', name: 'repo' },
      createdBy: { displayName: 'Team Member', uniqueName: 'member@example.com' },
      reviewers: Array.from({ length: count }, (_, reviewer) => ({ id: `reviewer-${reviewer}`, vote: 10 })),
    }))
    const client = {
      async request<T>(options: AdoRequestOptions): Promise<T> {
        let response: unknown
        if (options.path.endsWith('/_apis/projects/project')) {
          response = { id: 'project-id' }
        } else if (options.path.endsWith('/_apis/wit/wiql')) {
          response = { workItems: [{ id: 100 }] }
        } else if (options.path.endsWith('/_apis/wit/workitemsbatch')) {
          response = { value: [{ id: 100, fields: { 'System.Title': 'Linked item' } }] }
        } else if (options.path.endsWith('/_apis/wit/workitems')) {
          response = {
            value: [{
              id: 100,
              relations: pullRequests.map((pr) => ({
                rel: 'ArtifactLink',
                url: `vstfs:///Git/PullRequestId/project-id%2Frepo%2F${pr.pullRequestId}`,
              })),
            }],
          }
        } else if (options.path.endsWith('/pullrequests')) {
          response = { value: options.params?.['searchCriteria.status'] === 'active' ? pullRequests : [] }
        } else if (options.path.endsWith('/_apis/policy/evaluations')) {
          const id = Number(String(options.params?.artifactId).split('/').at(-1))
          policyRequests.push(id)
          response = {
            value: requirements[id - 1] === 0 ? [] : [{
              status: 'approved',
              configuration: {
                isEnabled: true,
                isBlocking: true,
                type: { id: id === 3 ? 'fd2167ab-b0be-447a-8ec8-39368250530e' : 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd' },
                settings: {
                  minimumApproverCount: requirements[id - 1],
                  ...(id === 3 ? { requiredReviewerIds: ['reviewer-group'] } : {}),
                },
              },
            }],
          }
        } else if (options.path.endsWith('/workitemicons') || options.path.endsWith('/threads')) {
          response = { value: [] }
        } else {
          throw new Error(`Unexpected request: ${options.path}`)
        }
        return response as T
      },
      async requestPage<T>(): Promise<{ data: T; continuationToken: null }> {
        throw new Error('requestPage should not be called')
      },
    }
    const team = {
      id: 'team', orgName: `review-policy-${linked}-org`, projectName: 'project',
      repoName: 'repo', areaPath: 'project', iterationPath: 'project',
    }
    const items: WorkItemSummary[] = linked
      ? await fetchWorkItemsForCurrentAndNextIteration(client, team)
      : await fetchUnlinkedActivePullRequestItems(client, team, [{ displayName: 'Team Member', uniqueName: 'member@example.com' }], [], null)
    const summaries = linked ? items[0].activePullRequests : items.map((item) => item.pullRequest)
    assert.deepEqual(summaries?.map((pr) => pr?.reviewPolicy), requirements.map((requiredApprovals) => ({ requiredApprovals, state: 'passing' })))
    assert.deepEqual(summaries?.map((pr) => pr?.approvalCount), requirements)
    assert.deepEqual(policyRequests.sort(), [1, 2, 3, 4])
  })
}

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

test('unlinked PR items carry the repository name', async () => {
  const client = {
    async request<T>(options: AdoRequestOptions): Promise<T> {
      if (options.path.endsWith('/_apis/git/repositories/repo/pullrequests')) {
        const value = options.params?.['searchCriteria.status'] === 'completed'
          ? [{
              pullRequestId: 7,
              status: 'completed',
              creationDate: '2026-10-13T12:00:00Z',
              closedDate: '2026-10-14T12:00:00Z',
              repository: { id: 'repo-id', name: ' pw-web ' },
              createdBy: { displayName: 'Team Member', uniqueName: 'member@example.com' },
            }]
          : []
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
    { orgName: 'pr-repository-name-test-org', projectName: 'project', repoName: 'repo' },
    [{ displayName: 'Team Member', uniqueName: 'member@example.com' }],
    [],
    { name: 'Sprint', fullName: 'Project\\Sprint', startDate: '2026-10-12', finishDate: '2026-10-30' },
  )

  assert.equal(items[0]?.pullRequest?.repositoryName, 'pw-web')
})
