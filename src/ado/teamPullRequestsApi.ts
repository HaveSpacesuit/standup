import type { TeamProfile } from '../teamProfiles'
import { parseAssignedTo, toIdentityKeys } from './identity'
import type { AdoRequestClient } from './httpClient'
import type { CurrentIterationInfo, TeamMember, WorkItemPullRequestSummary, WorkItemSummary } from './types'
import { fetchPolicyEvaluationChecksSummary, fetchProjectId } from './policyEvaluationChecksApi'
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

type PullRequestFilterMode = 'unlinked-board-items' | 'active-team-items'

function parseIsoDate(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
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
  mode: PullRequestFilterMode,
): boolean {
  const pullRequestId = pullRequest.pullRequestId
  if (typeof pullRequestId !== 'number') {
    return false
  }

  if (pullRequest.isDraft === true) {
    return false
  }

  if (mode === 'unlinked-board-items' && linkedPullRequestIds.has(pullRequestId)) {
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
  if (mode === 'active-team-items') {
    return status === 'active'
  }

  if (status === 'active') {
    return true
  }

  if (status === 'completed') {
    return isWithinCurrentIteration(pullRequest.creationDate, currentIteration)
  }

  return false
}

function getPullRequestIconUrl(iconMap: Record<string, string>): string | undefined {
  const direct = iconMap['icon_pull_request']
  if (direct) {
    return direct
  }

  for (const [iconId, iconUrl] of Object.entries(iconMap)) {
    const normalized = iconId.trim().toLowerCase()
    if (normalized.includes('pull') && normalized.includes('request')) {
      return iconUrl
    }
  }

  return undefined
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

function resolvePullRequestReviewState(
  reviewers: PullRequestApiResponse['reviewers'],
): WorkItemPullRequestSummary['reviewState'] {
  const dedupedReviewerVotes = new Map<string, number>()

  for (const reviewer of reviewers ?? []) {
    if (!reviewer || reviewer.isContainer === true) {
      continue
    }

    const vote = reviewer.vote
    if (typeof vote !== 'number') {
      continue
    }

    const reviewerKey = reviewer.id ?? reviewer.uniqueName ?? reviewer.displayName
    if (!reviewerKey) {
      continue
    }

    const previousVote = dedupedReviewerVotes.get(reviewerKey)
    if (previousVote === undefined || Math.abs(vote) > Math.abs(previousVote)) {
      dedupedReviewerVotes.set(reviewerKey, vote)
    }
  }

  const votes = [...dedupedReviewerVotes.values()]

  if (votes.some((vote) => vote <= -10)) {
    return 'rejected'
  }

  if (votes.some((vote) => vote === -5)) {
    return 'waiting-for-author'
  }

  const approvalCount = votes.filter((vote) => vote >= 5).length
  if (approvalCount === 1) {
    return 'partially-approved'
  }

  if (approvalCount >= 2) {
    return 'fully-approved'
  }

  return undefined
}

function resolvePullRequestApprovalCount(
  reviewers: PullRequestApiResponse['reviewers'],
): number {
  const dedupedReviewerVotes = new Map<string, number>()

  for (const reviewer of reviewers ?? []) {
    if (!reviewer || reviewer.isContainer === true) {
      continue
    }

    const vote = reviewer.vote
    if (typeof vote !== 'number') {
      continue
    }

    const reviewerKey = reviewer.id ?? reviewer.uniqueName ?? reviewer.displayName
    if (!reviewerKey) {
      continue
    }

    const previousVote = dedupedReviewerVotes.get(reviewerKey)
    if (previousVote === undefined || Math.abs(vote) > Math.abs(previousVote)) {
      dedupedReviewerVotes.set(reviewerKey, vote)
    }
  }

  return [...dedupedReviewerVotes.values()].filter((vote) => vote >= 5).length
}


function mapPullRequestToWorkItemSummary(
  pullRequest: PullRequestApiResponse,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'repoName'>,
  pullRequestIconUrl: string | undefined,
  checks: WorkItemPullRequestSummary['checks'],
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
  }

  return {
    id: -pullRequestId,
    kind: 'pull-request',
    title: pullRequestSummary.title,
    recentActivityAt:
      pullRequest.status?.trim().toLowerCase() === 'completed'
        ? pullRequest.closedDate ?? pullRequest.creationDate
        : pullRequest.creationDate,
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
  mode: PullRequestFilterMode,
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

  if (mode === 'unlinked-board-items') {
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
  }

  const responses = await Promise.all(requests)
  const workItemIconMap = await workItemIconMapPromise
  const pullRequestIconUrl = getPullRequestIconUrl(workItemIconMap)
  const includeChecks = mode === 'active-team-items'
  const projectId = includeChecks
    ? await fetchProjectId(client, team.orgName, team.projectName, signal)
    : null

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
    shouldIncludePullRequest(pullRequest, linkedPullRequestIds, memberKeys, currentIteration, mode),
  )

  const mappedItems = await Promise.all(
    filteredPullRequests.map(async (pullRequest) => {
      const pullRequestId = pullRequest.pullRequestId
      const checks = includeChecks
        ? (projectId && typeof pullRequestId === 'number'
          ? await fetchPolicyEvaluationChecksSummary(
            client,
            team,
            pullRequestId,
            projectId,
            signal,
          ) ?? undefined
          : undefined)
        : undefined

      return mapPullRequestToWorkItemSummary(pullRequest, team, pullRequestIconUrl, checks)
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
    'unlinked-board-items',
    signal,
  )
}

export async function fetchActiveTeamPullRequestItems(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'repoName'>,
  members: TeamMember[],
  signal?: AbortSignal,
): Promise<WorkItemSummary[]> {
  const items = await fetchPullRequestItems(
    client,
    team,
    members,
    new Set<number>(),
    null,
    'active-team-items',
    signal,
  )

  return [...items].sort((left, right) => {
    const leftAt = parseIsoDate(left.recentActivityAt) ?? Number.NEGATIVE_INFINITY
    const rightAt = parseIsoDate(right.recentActivityAt) ?? Number.NEGATIVE_INFINITY
    return leftAt - rightAt
  })
}
