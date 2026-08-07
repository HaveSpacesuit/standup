import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine, WorkItemSummary } from '../../../ado/queryEngine'
import resolveStatusFromStateAndTags from '../../../ado/workItemStatus'

export type ChangeHighlightState = 'new' | 'stale' | 'none'

type HighlightResult = {
  state: ChangeHighlightState
  trackedAt?: string
  baselineAt?: string
  justification: string
}

type UseAdoHistoryHighlightsArgs = {
  adoQueryEngine: AdoQueryEngine | null
  team: {
    orgName: string
    projectName: string
    repoName: string
  }
  workItems: WorkItemSummary[]
}

type WorkItemFieldUpdate = {
  oldValue?: unknown
  newValue?: unknown
}

type WorkItemRelation = {
  rel?: string
  url?: string
}

type WorkItemUpdate = {
  revisedDate?: string
  fields?: Record<string, WorkItemFieldUpdate>
  relations?: {
    added?: WorkItemRelation[]
    removed?: WorkItemRelation[]
    updated?: WorkItemRelation[]
  }
}

type WorkItemUpdatesResponse = {
  value?: WorkItemUpdate[]
}

type PullRequestThread = {
  publishedDate?: string
  properties?: Record<string, { $value?: unknown }>
}

type PullRequestThreadsResponse = {
  value?: PullRequestThread[]
}

type PullRequestDetailsResponse = {
  creationDate?: string
  isDraft?: boolean
}

const STALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const PULL_REQUEST_ARTIFACT_PREFIX = 'vstfs:///Git/PullRequestId/'

function toTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function isUsableHistoryTimestamp(value: string | undefined, now = Date.now()): value is string {
  const timestamp = toTimestamp(value)
  return timestamp !== null && timestamp <= now
}

function resolveUpdateTimestamp(update: WorkItemUpdate, now = Date.now()): string | undefined {
  const fieldChangedDate = update.fields?.['System.ChangedDate']?.newValue
  const changedDateValue = typeof fieldChangedDate === 'string' ? fieldChangedDate : undefined

  if (isUsableHistoryTimestamp(changedDateValue, now)) {
    return changedDateValue
  }

  return isUsableHistoryTimestamp(update.revisedDate, now) ? update.revisedDate : undefined
}

function normalizeTags(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  return value
    .split(';')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
}

function getRelevantTagSignature(tagsValue: string | undefined): string {
  const tags = normalizeTags(tagsValue)
  const relevant = tags.filter((tag) => tag === 'pr' || tag.includes('blocked'))
  return relevant.join(';')
}

function parseAssignedIdentityKey(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return ''
  }

  const candidate = value as { uniqueName?: unknown; displayName?: unknown; name?: unknown }
  if (typeof candidate.uniqueName === 'string' && candidate.uniqueName.trim()) {
    return candidate.uniqueName.trim()
  }

  if (typeof candidate.displayName === 'string' && candidate.displayName.trim()) {
    return candidate.displayName.trim()
  }

  if (typeof candidate.name === 'string' && candidate.name.trim()) {
    return candidate.name.trim()
  }

  return ''
}

function parsePullRequestArtifactLink(url: string | undefined): { repositoryId: string; pullRequestId: number } | null {
  if (!url) {
    return null
  }

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

  return { repositoryId, pullRequestId }
}

function getThreadType(thread: PullRequestThread): string {
  const value = thread.properties?.CodeReviewThreadType?.$value
  return typeof value === 'string' ? value : ''
}

function getVoteUpdateMoments(threads: PullRequestThread[]): string[] {
  const now = Date.now()

  return threads
    .filter((thread) => getThreadType(thread) === 'VoteUpdate')
    .map((thread) => thread.publishedDate)
    .filter((value): value is string => isUsableHistoryTimestamp(value, now))
}

function getPreviousWeekdayFreshnessThreshold(now = new Date()): number {
  const previousWeekday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0)

  do {
    previousWeekday.setDate(previousWeekday.getDate() - 1)
  } while (previousWeekday.getDay() === 0 || previousWeekday.getDay() === 6)

  return previousWeekday.getTime()
}

function getHighlightState(referenceAt: string | undefined, baselineAt: string | undefined, now: number): ChangeHighlightState {
  const trackedAt = toTimestamp(referenceAt)
  if (trackedAt !== null) {
    const freshThreshold = getPreviousWeekdayFreshnessThreshold(new Date(now))
    if (trackedAt >= freshThreshold && trackedAt <= now) {
      return 'new'
    }

    const ageMs = Math.max(now - trackedAt, 0)

    if (ageMs >= STALE_WINDOW_MS) {
      return 'stale'
    }

    return 'none'
  }

  const baseline = toTimestamp(baselineAt)
  if (baseline !== null && Math.max(now - baseline, 0) >= STALE_WINDOW_MS) {
    return 'stale'
  }

  return 'none'
}

function getItemDebugLabel(item: WorkItemSummary): string {
  return item.kind === 'pull-request'
    ? `PR ${item.pullRequest?.id ?? Math.abs(item.id)} ${item.title}`
    : `WI ${item.id} ${item.title}`
}

async function fetchPullRequestDetails(
  adoQueryEngine: AdoQueryEngine,
  team: UseAdoHistoryHighlightsArgs['team'],
  repositoryId: string,
  pullRequestId: number,
  signal: AbortSignal,
): Promise<PullRequestDetailsResponse | null> {
  try {
    return await adoQueryEngine.request<PullRequestDetailsResponse>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/pullRequests/${pullRequestId}`,
      params: {
        'api-version': '7.1',
      },
      signal,
    })
  } catch {
    return null
  }
}

async function fetchPullRequestVoteMoments(
  adoQueryEngine: AdoQueryEngine,
  team: UseAdoHistoryHighlightsArgs['team'],
  repositoryId: string | undefined,
  pullRequestId: number,
  signal: AbortSignal,
): Promise<string[]> {
  if (!repositoryId) {
    return []
  }

  try {
    const response = await adoQueryEngine.request<PullRequestThreadsResponse>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/pullRequests/${pullRequestId}/threads`,
      params: {
        'api-version': '7.1',
      },
      signal,
    })

    return getVoteUpdateMoments(response.value ?? [])
  } catch {
    return []
  }
}

async function computeWorkItemHighlight(
  adoQueryEngine: AdoQueryEngine,
  team: UseAdoHistoryHighlightsArgs['team'],
  item: WorkItemSummary,
  signal: AbortSignal,
): Promise<HighlightResult> {
  const now = Date.now()
  const response = await adoQueryEngine.request<WorkItemUpdatesResponse>({
    method: 'GET',
    orgName: team.orgName,
    path: `/${encodeURIComponent(team.projectName)}/_apis/wit/workItems/${item.id}/updates`,
    params: {
      'api-version': '7.1',
    },
    signal,
  })

  const updates = [...(response.value ?? [])].sort((left, right) => {
    const leftAt = toTimestamp(resolveUpdateTimestamp(left, now)) ?? 0
    const rightAt = toTimestamp(resolveUpdateTimestamp(right, now)) ?? 0
    return leftAt - rightAt
  })

  const baselineAt = updates.map((update) => resolveUpdateTimestamp(update, now)).find((value) => Boolean(value)) ?? item.recentActivityAt
  let currentState = ''
  let currentTags = ''
  let currentAssignee = ''
  let lastTrackedChangeAt: string | undefined
  const reasons: string[] = []
  const earliestPullRequestAttachmentById = new Map<number, { repositoryId: string; attachedAt: string }>()

  for (const update of updates) {
    const updateTimestamp = resolveUpdateTimestamp(update, now)
    if (!updateTimestamp) {
      continue
    }

    for (const relation of update.relations?.added ?? []) {
      if (relation.rel !== 'ArtifactLink') {
        continue
      }

      const parsed = parsePullRequestArtifactLink(relation.url)
      if (!parsed) {
        continue
      }

      const existing = earliestPullRequestAttachmentById.get(parsed.pullRequestId)
      if (!existing || (toTimestamp(updateTimestamp) ?? 0) < (toTimestamp(existing.attachedAt) ?? Number.POSITIVE_INFINITY)) {
        earliestPullRequestAttachmentById.set(parsed.pullRequestId, {
          repositoryId: parsed.repositoryId,
          attachedAt: updateTimestamp,
        })
      }
    }
  }

  for (const [index, update] of updates.entries()) {
    const updateTimestamp = resolveUpdateTimestamp(update, now)
    if (!updateTimestamp) {
      continue
    }

    const fields = update.fields ?? {}
    const beforeState = currentState
    const beforeTags = currentTags
    const beforeAssignee = currentAssignee
    const beforeColumn = resolveStatusFromStateAndTags(beforeState, beforeTags)
    const beforeRelevantTags = getRelevantTagSignature(beforeTags)

    if (Object.hasOwn(fields, 'System.State')) {
      const value = fields['System.State']?.newValue
      currentState = typeof value === 'string' ? value : currentState
    }

    if (Object.hasOwn(fields, 'System.Tags')) {
      const value = fields['System.Tags']?.newValue
      currentTags = typeof value === 'string' ? value : ''
    }

    if (Object.hasOwn(fields, 'System.AssignedTo')) {
      currentAssignee = parseAssignedIdentityKey(fields['System.AssignedTo']?.newValue)
    }

    if (index === 0) {
      continue
    }

    const afterColumn = resolveStatusFromStateAndTags(currentState, currentTags)
    const afterRelevantTags = getRelevantTagSignature(currentTags)
    const updateReasons: string[] = []

    if (beforeState !== currentState) {
      updateReasons.push(`state: ${beforeState || '(empty)'} -> ${currentState || '(empty)'}`)
    }

    if (beforeAssignee !== currentAssignee) {
      updateReasons.push(`assignee: ${beforeAssignee || '(empty)'} -> ${currentAssignee || '(empty)'}`)
    }

    if (beforeRelevantTags !== afterRelevantTags) {
      updateReasons.push(`relevant tags: ${beforeRelevantTags || '(none)'} -> ${afterRelevantTags || '(none)'}`)
    }

    if (beforeColumn !== afterColumn) {
      updateReasons.push(`column: ${beforeColumn} -> ${afterColumn}`)
    }

    for (const relation of update.relations?.added ?? []) {
      if (relation.rel !== 'ArtifactLink') {
        continue
      }

      const parsed = parsePullRequestArtifactLink(relation.url)
      if (!parsed) {
        continue
      }

      const earliestAttachment = earliestPullRequestAttachmentById.get(parsed.pullRequestId)
      if (!earliestAttachment || earliestAttachment.attachedAt !== updateTimestamp) {
        continue
      }

      const details = await fetchPullRequestDetails(
        adoQueryEngine,
        team,
        earliestAttachment.repositoryId,
        parsed.pullRequestId,
        signal,
      )

      if (details?.isDraft === true) {
        continue
      }

      const createdAt = details?.creationDate
      updateReasons.push(
        createdAt
          ? `non-draft PR attached: ${parsed.pullRequestId} (first linked ${updateTimestamp}, PR created ${createdAt})`
          : `non-draft PR attached: ${parsed.pullRequestId}`,
      )
    }

    if (updateReasons.length > 0) {
      lastTrackedChangeAt = updateTimestamp
      reasons.push(`${updateTimestamp}: ${updateReasons.join('; ')}`)
    }
  }

  const pullRequestVoteReasons: string[] = []
  let lastVoteChangeAt = lastTrackedChangeAt

  for (const pullRequest of item.activePullRequests ?? []) {
    const voteMoments = await fetchPullRequestVoteMoments(
      adoQueryEngine,
      team,
      pullRequest.repositoryId,
      pullRequest.id,
      signal,
    )

    const latestVote = voteMoments
      .map((value) => ({ value, timestamp: toTimestamp(value) ?? 0 }))
      .sort((left, right) => right.timestamp - left.timestamp)[0]

    if (!latestVote?.value) {
      continue
    }

    if ((toTimestamp(latestVote.value) ?? 0) > (toTimestamp(lastVoteChangeAt) ?? 0)) {
      lastVoteChangeAt = latestVote.value
    }

    pullRequestVoteReasons.push(`PR ${pullRequest.id} latest vote update at ${latestVote.value}`)
  }

  const trackedAt = lastVoteChangeAt
  const state = getHighlightState(trackedAt, baselineAt, now)

  return {
    state,
    trackedAt,
    baselineAt,
    justification:
      reasons.length > 0 || pullRequestVoteReasons.length > 0
        ? [...reasons, ...pullRequestVoteReasons].join(' | ')
        : 'No tracked work item or active PR vote changes found in ADO history.',
  }
}

async function computePullRequestHighlight(
  adoQueryEngine: AdoQueryEngine,
  team: UseAdoHistoryHighlightsArgs['team'],
  item: WorkItemSummary,
  signal: AbortSignal,
): Promise<HighlightResult> {
  const pullRequest = item.pullRequest
  const baselineAt = item.recentActivityAt
  const voteMoments = await fetchPullRequestVoteMoments(
    adoQueryEngine,
    team,
    pullRequest?.repositoryId,
    pullRequest?.id ?? Math.abs(item.id),
    signal,
  )

  const latestVote = voteMoments
    .map((value) => ({ value, timestamp: toTimestamp(value) ?? 0 }))
    .sort((left, right) => right.timestamp - left.timestamp)[0]?.value

  const state = getHighlightState(latestVote, baselineAt, Date.now())

  return {
    state,
    trackedAt: latestVote,
    baselineAt,
    justification: latestVote
      ? `Latest PR vote update at ${latestVote}`
      : 'No PR vote update events found in ADO thread history.',
  }
}

export function useAdoHistoryHighlights({ adoQueryEngine, team, workItems }: UseAdoHistoryHighlightsArgs): Record<number, ChangeHighlightState> {
  const [results, setResults] = useState<Record<number, HighlightResult>>({})

  useEffect(() => {
    if (!adoQueryEngine || workItems.length === 0) {
      setResults({})
      return
    }

    const abortController = new AbortController()

    Promise.all(
      workItems.map(async (item) => {
        const result = item.kind === 'pull-request'
          ? await computePullRequestHighlight(adoQueryEngine, team, item, abortController.signal)
          : await computeWorkItemHighlight(adoQueryEngine, team, item, abortController.signal)

        return [item.id, result] as const
      }),
    )
      .then((entries) => {
        if (abortController.signal.aborted) {
          return
        }

        setResults(Object.fromEntries(entries))
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setResults({})
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, team, workItems])

  useEffect(() => {
    if (workItems.length === 0) {
      return
    }

    const now = Date.now()

    for (const item of workItems) {
      const result = results[item.id]
      if (!result || result.state === 'none') {
        continue
      }

      const referenceAt = result.trackedAt ?? result.baselineAt
      const ageHours = referenceAt
        && isUsableHistoryTimestamp(referenceAt, now)
        ? Number((((now - (toTimestamp(referenceAt) ?? now)) / (60 * 60 * 1000))).toFixed(2))
        : null

      console.debug(`[standup][change-highlight] ${result.state.toUpperCase()} ${getItemDebugLabel(item)}`, {
        itemId: item.id,
        kind: item.kind ?? 'work-item',
        trackedAt: result.trackedAt ?? null,
        baselineAt: result.baselineAt ?? null,
        ageHours,
        justification: result.justification,
        state: item.state,
        statusColumn: item.status,
        assignee: item.assignedTo?.uniqueName ?? item.assignedTo?.displayName ?? null,
        linkedPullRequestIds: item.activePullRequests?.map((pullRequest) => pullRequest.id) ?? [],
        reviewState:
          item.kind === 'pull-request'
            ? item.pullRequest?.reviewState ?? null
            : item.activePullRequests?.map((pullRequest) => ({ id: pullRequest.id, reviewState: pullRequest.reviewState ?? null })) ?? [],
      })
    }
  }, [results, workItems])

  return useMemo(() => {
    const highlights: Record<number, ChangeHighlightState> = {}

    for (const item of workItems) {
      highlights[item.id] = results[item.id]?.state ?? 'none'
    }

    return highlights
  }, [results, workItems])
}
