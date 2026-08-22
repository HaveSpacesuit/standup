import type { TeamProfile } from '../teamConfig'
import { parseAssignedTo, toIdentityKeys } from './identity'
import type { AdoRequestClient } from './httpClient'
import type { CurrentIterationInfo, TeamMember, WorkItemPullRequestSummary, WorkItemSummary } from './types'
import { resolvePullRequestApprovalCount, resolvePullRequestReviewState } from './pullRequestReview'
import { fetchPolicyEvaluationChecksSummary, fetchProjectId } from './policyEvaluationChecksApi'
import { fetchPullRequestReadyForReviewAt } from './pullRequestReadyForReview'
import { getPullRequestIconUrl, parseIsoDate } from './adoShared'
import { fetchWorkItemIconMap } from './workItemIconsApi'

type PullRequestListResponse = {
  value?: PullRequestApiResponse[]
}

type PullRequestApiResponse = {
  pullRequestId?: number
  title?: string
  status?: string
  isDraft?: boolean
  creationDate?: string
  closedDate?: string
  createdBy?: unknown
  reviewers?: Array<{
    id?: string
    uniqueName?: string
    displayName?: string
    isContainer?: boolean
    vote?: number
  }>
  repository?: {
    id?: string
    name?: string
  }
  _links?: {
    web?: {
      href?: string
    }
  }
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
    return isWithinCurrentIteration(pullRequest.creationDate, currentIteration)
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
  checks: WorkItemPullRequestSummary['checks'],
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
    checks,
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
      const checks = projectId && typeof pullRequestId === 'number'
        ? await fetchPolicyEvaluationChecksSummary(client, team, pullRequestId, projectId, signal).then((value) => value ?? undefined)
        : undefined

      return mapPullRequestToWorkItemSummary(
        pullRequest,
        team,
        pullRequestIconUrl,
        checks,
        readyForReviewAt,
      )
    }),
  )

  return mappedItems.filter((item): item is WorkItemSummary => item !== null)
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
