import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine, WorkItemSummary } from '../../../ado/queryEngine'
import { isUsableHistoryTimestamp, resolveUpdateTimestamp, toTimestamp } from '../../../ado/workItemHistoryTimeline'
import { parsePullRequestArtifactLink } from '../../../ado/adoShared'
import {
  getRelevantTagRuleSignature,
  resolveStatusFromStateAndTags,
  type TagRule,
} from '../../../ado/workItemStatus'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import { DEFAULT_CARD_HIGHLIGHT_OPTIONS } from '../utils/cardHighlightOptions'

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
  tagRules: TagRule[]
  workItems: WorkItemSummary[]
  cardHighlightOptions?: CardHighlightOptions
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

const DAY_MS = 24 * 60 * 60 * 1000

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

export function getHighlightState(
  referenceAt: string | undefined,
  baselineAt: string | undefined,
  now: number,
  options: CardHighlightOptions = DEFAULT_CARD_HIGHLIGHT_OPTIONS,
): ChangeHighlightState {
  const freshWindowMs = Math.max(options.freshDays, 1) * DAY_MS
  const staleWindowMs = Math.max(options.staleDays, 1) * DAY_MS

  const trackedAt = toTimestamp(referenceAt)
  if (trackedAt !== null) {
    if (trackedAt >= now - freshWindowMs && trackedAt <= now) {
      return 'new'
    }

    const ageMs = Math.max(now - trackedAt, 0)
    if (ageMs >= staleWindowMs) {
      return 'stale'
    }

    return 'none'
  }

  const baseline = toTimestamp(baselineAt)
  if (baseline !== null && Math.max(now - baseline, 0) >= staleWindowMs) {
    return 'stale'
  }

  return 'none'
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
  tagRules: TagRule[],
  item: WorkItemSummary,
  signal: AbortSignal,
  cardHighlightOptions: CardHighlightOptions = DEFAULT_CARD_HIGHLIGHT_OPTIONS,
): Promise<HighlightResult> {
  const now = Date.now()
  const itemUpdates = await adoQueryEngine.getWorkItemUpdates(team, item.id, signal)

  const updates = [...itemUpdates].sort((left, right) => {
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
      if (relation.rel !== 'ArtifactLink' || typeof relation.url !== 'string') {
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
    const beforeColumn = resolveStatusFromStateAndTags(beforeState, beforeTags, tagRules)
    const beforeRelevantTags = getRelevantTagRuleSignature(beforeTags, tagRules)

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

    const afterColumn = resolveStatusFromStateAndTags(currentState, currentTags, tagRules)
    const afterRelevantTags = getRelevantTagRuleSignature(currentTags, tagRules)
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
      if (relation.rel !== 'ArtifactLink' || typeof relation.url !== 'string') {
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
  const state = getHighlightState(trackedAt, baselineAt, now, cardHighlightOptions)

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
  cardHighlightOptions: CardHighlightOptions = DEFAULT_CARD_HIGHLIGHT_OPTIONS,
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

  const state = getHighlightState(latestVote, baselineAt, Date.now(), cardHighlightOptions)

  return {
    state,
    trackedAt: latestVote,
    baselineAt,
    justification: latestVote
      ? `Latest PR vote update at ${latestVote}`
      : 'No PR vote update events found in ADO thread history.',
  }
}

export function useAdoHistoryHighlights({ adoQueryEngine, team, tagRules, workItems, cardHighlightOptions = DEFAULT_CARD_HIGHLIGHT_OPTIONS }: UseAdoHistoryHighlightsArgs): Record<number, ChangeHighlightState> {
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
          ? await computePullRequestHighlight(adoQueryEngine, team, item, abortController.signal, cardHighlightOptions)
          : await computeWorkItemHighlight(adoQueryEngine, team, tagRules, item, abortController.signal, cardHighlightOptions)

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
  }, [adoQueryEngine, team, tagRules, workItems, cardHighlightOptions])

  return useMemo(() => {
    const highlights: Record<number, ChangeHighlightState> = {}

    for (const item of workItems) {
      highlights[item.id] = results[item.id]?.state ?? 'none'
    }

    return highlights
  }, [results, workItems])
}
