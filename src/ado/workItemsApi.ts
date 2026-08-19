import type { TeamProfile } from '../teamProfiles'
import { parseAssignedTo } from './identity'
import type { AdoRequestClient } from './httpClient'
import type { WorkItemPullRequestSummary, WorkItemSummary } from './types'
import { resolvePullRequestApprovalCount, resolvePullRequestReviewState } from './pullRequestReview'
import { buildIterationScopedWiql, buildQaBucketCandidatesWiql } from './wiql'
import { fetchPolicyEvaluationChecksSummary, fetchProjectId } from './policyEvaluationChecksApi'
import { fetchPullRequestReadyForReviewAt } from './pullRequestReadyForReview'
import { getPullRequestIconUrl } from './adoShared'
import resolveStatusFromStateAndTags from './workItemStatus'
import { fetchWorkItemIconMap } from './workItemIconsApi'
import {
  type WorkItemUpdatesResponse,
  type WorkItemUpdate,
} from '../features/standup/utils/qualityAssuranceBuckets'

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
    'System.CreatedDate'?: unknown
    'System.ChangedDate'?: unknown
    'System.IterationPath'?: unknown
    'System.WorkItemType'?: unknown
    'System.AssignedTo'?: unknown
    'System.CreatedBy'?: unknown
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
  creationDate?: string
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
const PULL_REQUEST_LOOKUP_CONCURRENCY = 8
const WORK_ITEM_BATCH_LIMIT = 200

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return []
  }

  const outputs = new Array<TOutput>(items.length)
  let nextIndex = 0

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= items.length) {
        return
      }

      outputs[currentIndex] = await mapper(items[currentIndex])
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return outputs
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    return [items]
  }

  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }

  return chunks
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

function resolveRecentActivityAt(fields: WorkItemApiItem['fields']): string | undefined {
  const changedDate = fields?.['System.ChangedDate']
  return typeof changedDate === 'string' && changedDate.trim() ? changedDate : undefined
}

function resolveCreatedAt(fields: WorkItemApiItem['fields']): string | undefined {
  const createdDate = fields?.['System.CreatedDate']
  return typeof createdDate === 'string' && createdDate.trim() ? createdDate : undefined
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

async function fetchActivePullRequestsByWorkItem(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  refsByWorkItem: Map<number, PullRequestRef[]>,
  pullRequestIconUrl: string | undefined,
  signal?: AbortSignal,
): Promise<Record<number, WorkItemPullRequestSummary[]>> {
  if (refsByWorkItem.size === 0) {
    return {}
  }
  const uniqueRefMap = new Map<string, PullRequestRef>()

  for (const refs of refsByWorkItem.values()) {
    for (const ref of refs) {
      uniqueRefMap.set(`${ref.repositoryId}:${ref.pullRequestId}`, ref)
    }
  }

  if (uniqueRefMap.size === 0) {
    return {}
  }

  const projectId = await fetchProjectId(client, team.orgName, team.projectName, signal)

  const activePullRequestMap = new Map<string, WorkItemPullRequestSummary>()

  await mapWithConcurrency(
    [...uniqueRefMap.entries()],
    PULL_REQUEST_LOOKUP_CONCURRENCY,
    async ([key, ref]) => {
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

        const pullRequestId = pullRequest.pullRequestId ?? ref.pullRequestId
        const [checks, readyForReviewAt] = await Promise.all([
          projectId
            ? fetchPolicyEvaluationChecksSummary(client, team, pullRequestId, projectId, signal).then((value) => value ?? undefined)
            : Promise.resolve(undefined),
          fetchPullRequestReadyForReviewAt(client, team, ref.repositoryId, pullRequestId, signal),
        ])

        activePullRequestMap.set(key, {
          id: pullRequestId,
          repositoryId: ref.repositoryId,
          title: pullRequest.title?.trim() || `Pull Request ${ref.pullRequestId}`,
          url: buildPullRequestWebUrl(team.orgName, team.projectName, pullRequest, ref),
          iconUrl: pullRequestIconUrl,
          approvalCount: resolvePullRequestApprovalCount(pullRequest.reviewers),
          reviewState: resolvePullRequestReviewState(pullRequest.reviewers),
          checks,
          recentActivityAt: readyForReviewAt ?? pullRequest.creationDate,
        })
      } catch {
        // Ignore PR lookup failures so work item rendering still succeeds.
      }
    },
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

async function fetchPullRequestRefsByWorkItem(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName'>,
  workItemIds: number[],
  signal?: AbortSignal,
): Promise<Map<number, PullRequestRef[]>> {
  if (workItemIds.length === 0) {
    return new Map()
  }

  const refsByWorkItem = new Map<number, PullRequestRef[]>()
  for (const workItemIdsChunk of chunkArray(workItemIds, WORK_ITEM_BATCH_LIMIT)) {
    const relationsResponse = await client.request<WorkItemRelationsBatchResponse>({
      method: 'GET',
      orgName: team.orgName,
      path: '/_apis/wit/workitems',
      params: {
        'api-version': '7.1',
        ids: workItemIdsChunk.join(','),
        '$expand': 'Relations',
      },
      signal,
    })

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
        if (parsed) {
          refs.push(parsed)
        }
      }

      refsByWorkItem.set(item.id, refs)
    }
  }

  return refsByWorkItem
}

async function fetchWorkItemsByWiql(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  wiqlQuery: string,
  signal?: AbortSignal,
): Promise<WorkItemSummary[]> {
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

  const batchResponses = await Promise.all(
    chunkArray(ids, WORK_ITEM_BATCH_LIMIT).map((idsChunk) => client.request<WorkItemsBatchResponse>({
      method: 'POST',
      orgName: team.orgName,
      path: '/_apis/wit/workitemsbatch',
      params: {
        'api-version': '7.1',
      },
      body: {
        ids: idsChunk,
        fields: [
          'System.Title',
          'System.CreatedDate',
          'System.ChangedDate',
          'System.IterationPath',
          'System.WorkItemType',
          'System.AssignedTo',
          'System.CreatedBy',
          'System.State',
          'System.Tags',
          'Microsoft.VSTS.Scheduling.Effort',
          'Microsoft.VSTS.Scheduling.StoryPoints',
          'Microsoft.VSTS.Scheduling.Size',
        ],
      },
      signal,
    })),
  )

  const workItemIconMap = await workItemIconMapPromise
  const pullRequestIconUrl = getPullRequestIconUrl(workItemIconMap)
  const pullRequestRefsByWorkItem = await (async () => {
    try {
      return await fetchPullRequestRefsByWorkItem(client, team, ids, signal)
    } catch {
      return new Map<number, PullRequestRef[]>()
    }
  })()
  const activePullRequestsByWorkItem = await (async () => {
    try {
      return await fetchActivePullRequestsByWorkItem(
        client,
        team,
        pullRequestRefsByWorkItem,
        pullRequestIconUrl,
        signal,
      )
    } catch {
      return {}
    }
  })()

  return batchResponses.flatMap((batchResponse) => batchResponse.value ?? [])
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
        kind: 'work-item',
        title: item.fields?.['System.Title'] ?? `Work Item ${item.id}`,
        createdAt: resolveCreatedAt(item.fields),
        state: typeof item.fields?.['System.State'] === 'string' ? item.fields?.['System.State'] : undefined,
        recentActivityAt: resolveRecentActivityAt(item.fields),
        tags: resolveTags(item.fields),
        sprintName: resolveSprintName(item.fields),
        activePullRequests: activePullRequestsByWorkItem[item.id] ?? [],
        linkedPullRequestIds: (pullRequestRefsByWorkItem.get(item.id) ?? []).map((ref) => ref.pullRequestId),
        workItemUrl: `https://dev.azure.com/${encodeURIComponent(team.orgName)}/${encodeURIComponent(team.projectName)}/_workitems/edit/${item.id}`,
        effort: resolveEffort(item.fields),
        workItemType,
        workItemIconUrl: workItemIconMap[iconId],
        assignedTo: parseAssignedTo(item.fields?.['System.AssignedTo']),
        createdBy: parseAssignedTo(item.fields?.['System.CreatedBy']),
        status: resolveStatusFromStateAndTags(
          item.fields?.['System.State'],
          item.fields?.['System.Tags'],
        ),
      }
    })
    .filter((item): item is WorkItemSummary => item !== null)
}

export async function fetchWorkItemsForCurrentAndNextIteration(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath' | 'iterationPath'>,
  signal?: AbortSignal,
): Promise<WorkItemSummary[]> {
  const wiqlQuery = buildIterationScopedWiql(team.projectName, team.areaPath, team.iterationPath)

  return fetchWorkItemsByWiql(client, team, wiqlQuery, signal)
}

async function fetchWorkItemUpdatesById(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  workItemId: number,
  signal?: AbortSignal,
): Promise<WorkItemUpdatesResponse> {
  return client.request<WorkItemUpdatesResponse>({
    method: 'GET',
    orgName: team.orgName,
    path: `/${encodeURIComponent(team.projectName)}/_apis/wit/workItems/${workItemId}/updates`,
    params: {
      'api-version': '7.1',
    },
    signal,
  })
}

async function fetchQualityAssuranceWorkItemUpdates(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  workItemIds: number[],
  signal?: AbortSignal,
): Promise<Record<number, ReturnType<typeof normalizeUpdates>>> {
  const result: Record<number, ReturnType<typeof normalizeUpdates>> = {}

  await mapWithConcurrency(workItemIds, 6, async (workItemId) => {
    try {
      const response = await fetchWorkItemUpdatesById(client, team, workItemId, signal)
      result[workItemId] = normalizeUpdates(response)
    } catch {
      result[workItemId] = []
    }
  })

  return result
}

function normalizeUpdates(response: WorkItemUpdatesResponse) {
  return [...(response.value ?? [])].sort((left, right) => {
    const leftAt = Date.parse(left.revisedDate ?? '') || 0
    const rightAt = Date.parse(right.revisedDate ?? '') || 0
    return leftAt - rightAt
  })
}

export type QualityAssuranceRawData = {
  candidates: WorkItemSummary[]
  updatesByItemId: Record<number, WorkItemUpdate[]>
}

export async function fetchQualityAssuranceRawData(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>,
  signal?: AbortSignal,
  options?: { includeWorkItemTypes?: string[]; includeIterationPaths?: string[] },
): Promise<QualityAssuranceRawData> {
  const wiqlQuery = buildQaBucketCandidatesWiql(team.projectName, team.areaPath, 21, options?.includeWorkItemTypes, options?.includeIterationPaths)
  const candidates = await fetchWorkItemsByWiql(client, team, wiqlQuery, signal)
  const updatesByItemId = await fetchQualityAssuranceWorkItemUpdates(client, team, candidates.map((item) => item.id), signal)

  return { candidates, updatesByItemId }
}
