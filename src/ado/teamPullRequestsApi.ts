import type { TeamProfile } from '../appSettings'
import { parseAssignedTo, toIdentityKeys } from './identity'
import type { AdoRequestClient } from './httpClient'
import type { CurrentIterationInfo, PullRequestApiResponse, TeamMember, WorkItemPullRequestSummary, WorkItemSummary } from './types'
import { resolvePullRequestApprovalCount, resolvePullRequestReviewState } from './pullRequestReview'
import { fetchPullRequestPolicies, fetchProjectId } from './policyEvaluationChecksApi'
import { fetchPullRequestReadyForReviewAt } from './pullRequestReadyForReview'
import { getPullRequestIconUrl, parseIsoDate } from './adoShared'
import { fetchWorkItemIconMap } from './workItemIconsApi'

type PullRequestListResponse = {
  value?: PullRequestApiResponse[]
}

function addDays(timestamp: number, days: number): number {
  return timestamp + days * 24 * 60 * 60 * 1000
}

function isWithinCurrentIteration(
  creationDate: string | undefined,
  currentIteration: CurrentIterationInfo | null,
): boolean {
  if (!currentIteration?.startDate || !currentIteration.finishDate) {
    return false
  }

  const createdAt = parseIsoDate(creationDate)
  const startAt = parseIsoDate(currentIteration.startDate)
  const finishAt = parseIsoDate(currentIteration.finishDate)
  if (createdAt === null || startAt === null || finishAt === null) {
    return false
  }

  return createdAt >= startAt && createdAt < addDays(finishAt, 1)
}

function shouldIncludePullRequest(
  pullRequest: PullRequestApiResponse,
  linkedPullRequestIds: Set<number>,
  memberKeys: Set<string>,
  currentIteration: CurrentIterationInfo | null,
): boolean {
  const pullRequestId = pullRequest.pullRequestId
  if (typeof pullRequestId !== 'number') {
    return false
  }

  if (pullRequest.isDraft === true) {
    return false
  }

  if (linkedPullRequestIds.has(pullRequestId)) {
    return false
  }

  const creator = parseAssignedTo(pullRequest.createdBy)
  if (!creator) {
    return false
  }

  const isTeamMemberCreator = toIdentityKeys(creator).some((key) => memberKeys.has(key))
  if (!isTeamMemberCreator) {
    return false
  }

  const status = pullRequest.status?.trim().toLowerCase()
  if (status === 'active') {
    return true
  }

  if (status === 'completed') {
    return isWithinCurrentIteration(pullRequest.closedDate, currentIteration)
  }

  return false
}

function buildPullRequestWebUrl(
  orgName: string,
  projectName: string,
  pullRequest: PullRequestApiResponse,
  repoName: string,
  pullRequestId: number,
): string {
  const linkedUrl = pullRequest._links?.web?.href
  if (linkedUrl) {
    return linkedUrl
  }

  const repositoryName = pullRequest.repository?.name?.trim() || repoName
  return `https://dev.azure.com/${encodeURIComponent(orgName)}/${encodeURIComponent(projectName)}/_git/${encodeURIComponent(repositoryName)}/pullrequest/${pullRequestId}`
}


function mapPullRequestToWorkItemSummary(
  pullRequest: PullRequestApiResponse,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'repoName'>,
  pullRequestIconUrl: string | undefined,
  policies: Pick<WorkItemPullRequestSummary, 'checks' | 'reviewPolicy'>,
  readyForReviewAt?: string,
): WorkItemSummary | null {
  const pullRequestId = pullRequest.pullRequestId
  if (typeof pullRequestId !== 'number') {
    return null
  }

  const creator = parseAssignedTo(pullRequest.createdBy)
  if (!creator) {
    return null
  }

  const pullRequestSummary: WorkItemPullRequestSummary = {
    id: pullRequestId,
    repositoryId: pullRequest.repository?.id,
    repositoryName: pullRequest.repository?.name?.trim() || undefined,
    title: pullRequest.title?.trim() || `Pull Request ${pullRequestId}`,
    url: buildPullRequestWebUrl(
      team.orgName,
      team.projectName,
      pullRequest,
      team.repoName,
      pullRequestId,
    ),
    iconUrl: pullRequestIconUrl,
    approvalCount: resolvePullRequestApprovalCount(pullRequest.reviewers),
    reviewState: resolvePullRequestReviewState(pullRequest.reviewers),
    status: pullRequest.status?.trim().toLowerCase(),
    ...policies,
    recentActivityAt: readyForReviewAt ?? pullRequest.creationDate,
  }

  return {
    id: -pullRequestId,
    kind: 'pull-request',
    title: pullRequestSummary.title,
    recentActivityAt:
      pullRequest.status?.trim().toLowerCase() === 'completed'
        ? pullRequest.closedDate ?? pullRequest.creationDate
        : readyForReviewAt ?? pullRequest.creationDate,
    pullRequest: pullRequestSummary,
    assignedTo: creator,
    status: pullRequest.status?.trim().toLowerCase() === 'completed' ? 'Done' : 'Review',
  }
}

async function fetchPullRequestItems(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'repoName'>,
  members: TeamMember[],
  linkedPullRequestIds: Set<number>,
  currentIteration: CurrentIterationInfo | null,
  signal?: AbortSignal,
): Promise<WorkItemSummary[]> {
  const memberKeys = new Set(
    members.flatMap((member) =>
      toIdentityKeys({
        displayName: member.displayName,
        uniqueName: member.uniqueName,
      }),
    ),
  )

  if (memberKeys.size === 0) {
    return []
  }

  const workItemIconMapPromise = fetchWorkItemIconMap(client, team.orgName, signal)
  const requests = [
    client.request<PullRequestListResponse>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/_apis/git/repositories/${encodeURIComponent(team.repoName)}/pullrequests`,
      params: {
        'api-version': '7.1',
        'searchCriteria.status': 'active',
      },
      signal,
    }),
  ]

  requests.push(
    client.request<PullRequestListResponse>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/_apis/git/repositories/${encodeURIComponent(team.repoName)}/pullrequests`,
      params: {
        'api-version': '7.1',
        'searchCriteria.status': 'completed',
      },
      signal,
    }),
  )

  const responses = await Promise.all(requests)
  const workItemIconMap = await workItemIconMapPromise
  const pullRequestIconUrl = getPullRequestIconUrl(workItemIconMap)
  const projectId = await fetchProjectId(client, team.orgName, team.projectName, signal)

  const pullRequestsById = new Map<number, PullRequestApiResponse>()
  for (const response of responses) {
    for (const pullRequest of response.value ?? []) {
      const pullRequestId = pullRequest.pullRequestId
      if (typeof pullRequestId === 'number') {
        pullRequestsById.set(pullRequestId, pullRequest)
      }
    }
  }

  const filteredPullRequests = [...pullRequestsById.values()].filter((pullRequest) =>
    shouldIncludePullRequest(pullRequest, linkedPullRequestIds, memberKeys, currentIteration),
  )

  const mappedItems = await Promise.all(
    filteredPullRequests.map(async (pullRequest) => {
      const pullRequestId = pullRequest.pullRequestId
      const readyForReviewAt = typeof pullRequestId === 'number'
        ? await fetchPullRequestReadyForReviewAt(client, team, pullRequest.repository?.id?.trim(), pullRequestId, signal)
        : undefined
      const policies = typeof pullRequestId === 'number'
        ? await fetchPullRequestPolicies(client, team, pullRequestId, projectId, signal)
        : {}

      return mapPullRequestToWorkItemSummary(
        pullRequest,
        team,
        pullRequestIconUrl,
        policies,
        readyForReviewAt,
      )
    }),
  )

  return mappedItems.filter((item): item is WorkItemSummary => item !== null)
}

/** A pull request card read fresh, with the pull request's status: lower-cased, or `draft` while it is one. */
export type PullRequestCardRead = {
  /** Null once the board no longer shows the pull request: back to draft, or abandoned. */
  card: WorkItemSummary | null
  status: string
}

/**
 * One pull request's card as Azure DevOps has it now, read by ID. A completed pull request keeps its card, in Done.
 *
 * @param pullRequest The card's pull request as the board shows it, whose icon and repository name fill any gaps.
 */
export async function fetchPullRequestCard(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  pullRequest: Pick<WorkItemPullRequestSummary, 'id' | 'repositoryId' | 'repositoryName' | 'iconUrl'>,
  signal?: AbortSignal,
): Promise<PullRequestCardRead> {
  const project = encodeURIComponent(team.projectName)
  const [current, workItemIconMap, projectId] = await Promise.all([
    client.request<PullRequestApiResponse>({
      method: 'GET',
      orgName: team.orgName,
      path: pullRequest.repositoryId
        ? `/${project}/_apis/git/repositories/${encodeURIComponent(pullRequest.repositoryId)}/pullrequests/${pullRequest.id}`
        : `/${project}/_apis/git/pullrequests/${pullRequest.id}`,
      params: {
        'api-version': '7.1',
      },
      signal,
    }),
    fetchWorkItemIconMap(client, team.orgName, signal).catch(() => ({})),
    fetchProjectId(client, team.orgName, team.projectName, signal),
  ])
  if (current?.pullRequestId !== pullRequest.id) {
    throw new Error(`Azure DevOps did not return pull request ${pullRequest.id}.`)
  }

  const status = current.isDraft === true ? 'draft' : current.status?.trim().toLowerCase() ?? ''
  if (status !== 'active' && status !== 'completed') {
    return { card: null, status }
  }

  const repositoryId = current.repository?.id?.trim() || pullRequest.repositoryId
  const [policies, readyForReviewAt] = await Promise.all([
    fetchPullRequestPolicies(client, team, pullRequest.id, projectId, signal),
    fetchPullRequestReadyForReviewAt(client, team, repositoryId, pullRequest.id, signal),
  ])
  const card = mapPullRequestToWorkItemSummary(
    current,
    { ...team, repoName: pullRequest.repositoryName ?? repositoryId ?? '' },
    getPullRequestIconUrl(workItemIconMap) ?? pullRequest.iconUrl,
    policies,
    readyForReviewAt,
  )
  return { card, status }
}

export async function fetchUnlinkedActivePullRequestItems(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'repoName'>,
  members: TeamMember[],
  visibleWorkItems: WorkItemSummary[],
  currentIteration: CurrentIterationInfo | null,
  signal?: AbortSignal,
): Promise<WorkItemSummary[]> {
  const linkedPullRequestIds = new Set(
    visibleWorkItems.flatMap((item) => item.linkedPullRequestIds ?? item.activePullRequests?.map((pullRequest) => pullRequest.id) ?? []),
  )

  return fetchPullRequestItems(
    client,
    team,
    members,
    linkedPullRequestIds,
    currentIteration,
    signal,
  )
}
