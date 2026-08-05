import type { TeamProfile } from '../teamProfiles'
import { parseAssignedTo } from './identity'
import type { AdoRequestClient } from './httpClient'
import type { WorkItemPullRequestSummary, WorkItemSummary } from './types'
import { buildIterationScopedWiql } from './wiql'
import resolveStatusFromStateAndTags from './workItemStatus'
import { fetchWorkItemIconMap } from './workItemIconsApi'

const WORK_ITEM_TYPE_ICON_IDS: Record<string, string> = {
  bug: 'icon_insect',
  task: 'icon_clipboard',
  issue: 'icon_clipboard_issue',
  story: 'icon_book',
  'user story': 'icon_book',
  'product backlog item': 'icon_list',
  feature: 'icon_trophy',
  epic: 'icon_star',
}

function normalizeType(value: string): string {
  return value.trim().toLowerCase()
}

function getIconIdForWorkItemType(typeValue?: string): string {
  if (!typeValue) {
    return 'icon_clipboard'
  }

  return WORK_ITEM_TYPE_ICON_IDS[normalizeType(typeValue)] ?? 'icon_clipboard'
}

type WiqlResponse = {
  workItems?: Array<{ id: number }>
}

type WorkItemsBatchResponse = {
  count: number
  value: WorkItemApiItem[]
}

type WorkItemApiItem = {
  id?: number
  fields?: {
    'System.Title'?: string
    'System.IterationPath'?: unknown
    'System.WorkItemType'?: unknown
    'System.AssignedTo'?: unknown
    'System.State'?: unknown
    'System.Tags'?: unknown
    'Microsoft.VSTS.Scheduling.Effort'?: unknown
    'Microsoft.VSTS.Scheduling.StoryPoints'?: unknown
    'Microsoft.VSTS.Scheduling.Size'?: unknown
  }
}

type WorkItemRelationsBatchResponse = {
  value?: WorkItemRelationsItem[]
}

type WorkItemRelationsItem = {
  id?: number
  relations?: Array<{
    rel?: string
    url?: string
  }>
}

type PullRequestApiResponse = {
  pullRequestId?: number
  title?: string
  status?: string
  isDraft?: boolean
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

type PullRequestRef = {
  repositoryId: string
  pullRequestId: number
}

const PULL_REQUEST_ARTIFACT_PREFIX = 'vstfs:///Git/PullRequestId/'

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

function parseEffort(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function resolveEffort(fields: WorkItemApiItem['fields']): number | undefined {
  return (
    parseEffort(fields?.['Microsoft.VSTS.Scheduling.Effort']) ??
    parseEffort(fields?.['Microsoft.VSTS.Scheduling.StoryPoints']) ??
    parseEffort(fields?.['Microsoft.VSTS.Scheduling.Size'])
  )
}

function resolveSprintName(fields: WorkItemApiItem['fields']): string | undefined {
  const path = fields?.['System.IterationPath']
  if (typeof path !== 'string') {
    return undefined
  }

  const trimmed = path.trim()
  if (!trimmed) {
    return undefined
  }

  const segments = trimmed.split('\\').filter(Boolean)
  return segments.length > 0 ? segments[segments.length - 1] : trimmed
}

function resolveTags(fields: WorkItemApiItem['fields']): string[] {
  const rawTags = fields?.['System.Tags']
  if (typeof rawTags !== 'string') {
    return []
  }

  return rawTags
    .split(';')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}

function parsePullRequestArtifactLink(url: string): PullRequestRef | null {
  const markerIndex = url.indexOf(PULL_REQUEST_ARTIFACT_PREFIX)
  if (markerIndex === -1) {
    return null
  }

  const encodedPayload = url.slice(markerIndex + PULL_REQUEST_ARTIFACT_PREFIX.length)
  const decodedPayload = decodeURIComponent(encodedPayload)
  const segments = decodedPayload.split('/').filter(Boolean)

  if (segments.length < 3) {
    return null
  }

  const repositoryId = segments[1]
  const pullRequestId = Number(segments[2])

  if (!repositoryId || !Number.isFinite(pullRequestId)) {
    return null
  }

  return {
    repositoryId,
    pullRequestId,
  }
}

function buildPullRequestWebUrl(
  orgName: string,
  projectName: string,
  pullRequest: PullRequestApiResponse,
  fallback: PullRequestRef,
): string {
  const linkedUrl = pullRequest._links?.web?.href
  if (linkedUrl) {
    return linkedUrl
  }

  const repositoryName = pullRequest.repository?.name
  if (repositoryName) {
    return `https://dev.azure.com/${encodeURIComponent(orgName)}/${encodeURIComponent(projectName)}/_git/${encodeURIComponent(repositoryName)}/pullrequest/${fallback.pullRequestId}`
  }

  return `https://dev.azure.com/${encodeURIComponent(orgName)}/${encodeURIComponent(projectName)}/_git/${encodeURIComponent(fallback.repositoryId)}/pullrequest/${fallback.pullRequestId}`
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

async function fetchActivePullRequestsByWorkItem(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  workItemIds: number[],
  pullRequestIconUrl: string | undefined,
  signal?: AbortSignal,
): Promise<Record<number, WorkItemPullRequestSummary[]>> {
  if (workItemIds.length === 0) {
    return {}
  }

  const relationsResponse = await client.request<WorkItemRelationsBatchResponse>({
    method: 'GET',
    orgName: team.orgName,
    path: '/_apis/wit/workitems',
    params: {
      'api-version': '7.1',
      ids: workItemIds.join(','),
      '$expand': 'Relations',
    },
    signal,
  })

  const refsByWorkItem = new Map<number, PullRequestRef[]>()
  const uniqueRefMap = new Map<string, PullRequestRef>()

  for (const item of relationsResponse.value ?? []) {
    if (typeof item.id !== 'number') {
      continue
    }

    const refs: PullRequestRef[] = []
    for (const relation of item.relations ?? []) {
      if (relation.rel !== 'ArtifactLink' || typeof relation.url !== 'string') {
        continue
      }

      const parsed = parsePullRequestArtifactLink(relation.url)
      if (!parsed) {
        continue
      }

      const key = `${parsed.repositoryId}:${parsed.pullRequestId}`
      uniqueRefMap.set(key, parsed)
      refs.push(parsed)
    }

    refsByWorkItem.set(item.id, refs)
  }

  if (uniqueRefMap.size === 0) {
    return {}
  }

  const activePullRequestMap = new Map<string, WorkItemPullRequestSummary>()

  await Promise.all(
    [...uniqueRefMap.entries()].map(async ([key, ref]) => {
      try {
        const pullRequest = await client.request<PullRequestApiResponse>({
          method: 'GET',
          orgName: team.orgName,
          path: `/${encodeURIComponent(team.projectName)}/_apis/git/repositories/${encodeURIComponent(ref.repositoryId)}/pullRequests/${ref.pullRequestId}`,
          params: {
            'api-version': '7.1',
          },
          signal,
        })

        const status = typeof pullRequest.status === 'string' ? pullRequest.status.toLowerCase() : ''
        if (status !== 'active' || pullRequest.isDraft === true) {
          return
        }

        activePullRequestMap.set(key, {
          id: pullRequest.pullRequestId ?? ref.pullRequestId,
          title: pullRequest.title?.trim() || `Pull Request ${ref.pullRequestId}`,
          url: buildPullRequestWebUrl(team.orgName, team.projectName, pullRequest, ref),
          iconUrl: pullRequestIconUrl,
          reviewState: resolvePullRequestReviewState(pullRequest.reviewers),
        })
      } catch {
        // Ignore PR lookup failures so work item rendering still succeeds.
      }
    }),
  )

  const result: Record<number, WorkItemPullRequestSummary[]> = {}
  for (const [workItemId, refs] of refsByWorkItem.entries()) {
    const activeForItem: WorkItemPullRequestSummary[] = []

    for (const ref of refs) {
      const key = `${ref.repositoryId}:${ref.pullRequestId}`
      const activePullRequest = activePullRequestMap.get(key)
      if (activePullRequest) {
        activeForItem.push(activePullRequest)
      }
    }

    result[workItemId] = activeForItem
  }

  return result
}

export async function fetchWorkItemsForCurrentAndNextIteration(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath' | 'iterationPath'>,
  signal?: AbortSignal,
): Promise<WorkItemSummary[]> {
  const wiqlQuery = buildIterationScopedWiql(team.projectName, team.areaPath, team.iterationPath)

  const wiqlResponse = await client.request<WiqlResponse>({
    method: 'POST',
    orgName: team.orgName,
    path: `/${encodeURIComponent(team.projectName)}/_apis/wit/wiql`,
    params: {
      'api-version': '7.1',
    },
    body: {
      query: wiqlQuery,
    },
    signal,
  })

  const ids = (wiqlResponse.workItems ?? []).map((item) => item.id)
  if (ids.length === 0) {
    return []
  }

  const workItemIconMapPromise = fetchWorkItemIconMap(client, team.orgName, signal)

  const batchResponse = await client.request<WorkItemsBatchResponse>({
    method: 'POST',
    orgName: team.orgName,
    path: '/_apis/wit/workitemsbatch',
    params: {
      'api-version': '7.1',
    },
    body: {
      ids,
      fields: [
        'System.Title',
        'System.IterationPath',
        'System.WorkItemType',
        'System.AssignedTo',
        'System.State',
        'System.Tags',
        'Microsoft.VSTS.Scheduling.Effort',
        'Microsoft.VSTS.Scheduling.StoryPoints',
        'Microsoft.VSTS.Scheduling.Size',
      ],
    },
    signal,
  })

  const workItemIconMap = await workItemIconMapPromise
  const pullRequestIconUrl = getPullRequestIconUrl(workItemIconMap)
  const activePullRequestsByWorkItem = await (async () => {
    try {
      return await fetchActivePullRequestsByWorkItem(
        client,
        team,
        ids,
        pullRequestIconUrl,
        signal,
      )
    } catch {
      return {}
    }
  })()

  return (batchResponse.value ?? [])
    .map((item): WorkItemSummary | null => {
      if (typeof item.id !== 'number') {
        return null
      }

      const workItemType =
        typeof item.fields?.['System.WorkItemType'] === 'string'
          ? item.fields?.['System.WorkItemType']
          : undefined
      const iconId = getIconIdForWorkItemType(workItemType)

      return {
        id: item.id,
        title: item.fields?.['System.Title'] ?? `Work Item ${item.id}`,
        tags: resolveTags(item.fields),
        sprintName: resolveSprintName(item.fields),
        activePullRequests: activePullRequestsByWorkItem[item.id] ?? [],
        workItemUrl: `https://dev.azure.com/${encodeURIComponent(team.orgName)}/${encodeURIComponent(team.projectName)}/_workitems/edit/${item.id}`,
        effort: resolveEffort(item.fields),
        workItemType,
        workItemIconUrl: workItemIconMap[iconId],
        assignedTo: parseAssignedTo(item.fields?.['System.AssignedTo']),
        status: resolveStatusFromStateAndTags(
          item.fields?.['System.State'],
          item.fields?.['System.Tags'],
        ),
      }
    })
    .filter((item): item is WorkItemSummary => item !== null)
}
