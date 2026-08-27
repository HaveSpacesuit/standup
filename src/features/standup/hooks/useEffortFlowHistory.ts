import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine, IterationWindowInfo, WorkItemSummary, WorkItemUpdate } from '../../../ado/queryEngine'
import { resolveStatusFromStateAndTags, type TagRule } from '../../../ado/workItemStatus'
import { resolveUpdateTimestamp, toTimestamp } from '../../../ado/workItemHistoryTimeline'
import { EFFORT_FIELD_NAMES, parseEffort } from '../../../ado/workItemsApi'
import { formatDateKey, parseDateOnly } from '../utils/dateOnly'
import { STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'

export type EffortFlowPoint = { date: string } & Record<StatusColumn, number | null>

type UseEffortFlowHistoryArgs = {
  adoQueryEngine: AdoQueryEngine | null
  team: { orgName: string; projectName: string }
  tagRules: TagRule[]
  workItems: WorkItemSummary[]
  iterationWindow: IterationWindowInfo
}

type UseEffortFlowHistoryResult = {
  points: EffortFlowPoint[]
  isLoading: boolean
  /** Distinct status columns each item occupied from the start of the current sprint through now,
   * derived from the same per-item revision timelines used for the effort flow chart (no extra queries). */
  visitedStatusesByItemId: Record<number, StatusColumn[]>
}

const DAY_MS = 24 * 60 * 60 * 1000

type TimelineEntry = {
  timestamp: number
  status: StatusColumn
  effort: number
}

/** Replays a work item's revision history into a chronological (timestamp, status, effort) timeline. */
function buildItemTimeline(item: WorkItemSummary, updates: WorkItemUpdate[], tagRules: TagRule[]): TimelineEntry[] {
  const now = Date.now()
  const sorted = [...updates].sort((left, right) => {
    const leftAt = toTimestamp(resolveUpdateTimestamp(left, now)) ?? 0
    const rightAt = toTimestamp(resolveUpdateTimestamp(right, now)) ?? 0
    return leftAt - rightAt
  })

  let currentState = ''
  let currentTags = ''
  let currentEffort: number | undefined
  const timeline: TimelineEntry[] = []

  for (const update of sorted) {
    const updateTimestamp = resolveUpdateTimestamp(update, now)
    if (!updateTimestamp) {
      continue
    }

    const fields = update.fields ?? {}

    if (Object.hasOwn(fields, 'System.State')) {
      const value = fields['System.State']?.newValue
      currentState = typeof value === 'string' ? value : currentState
    }

    if (Object.hasOwn(fields, 'System.Tags')) {
      const value = fields['System.Tags']?.newValue
      currentTags = typeof value === 'string' ? value : ''
    }

    for (const fieldName of EFFORT_FIELD_NAMES) {
      if (Object.hasOwn(fields, fieldName)) {
        const parsed = parseEffort(fields[fieldName]?.newValue)
        if (parsed !== undefined) {
          currentEffort = parsed
        }
      }
    }

    timeline.push({
      timestamp: toTimestamp(updateTimestamp) ?? now,
      status: resolveStatusFromStateAndTags(currentState, currentTags, tagRules),
      // Effort is rarely revised — fall back to the item's current effort until history proves otherwise.
      effort: currentEffort ?? item.effort ?? 0,
    })
  }

  if (timeline.length === 0) {
    const createdAt = toTimestamp(item.createdAt) ?? now
    timeline.push({ timestamp: createdAt, status: item.status, effort: item.effort ?? 0 })
  }

  return timeline
}

function statusAsOf(timeline: TimelineEntry[], asOfMs: number): TimelineEntry | null {
  let candidate: TimelineEntry | null = null

  for (const entry of timeline) {
    if (entry.timestamp > asOfMs) {
      break
    }

    candidate = entry
  }

  return candidate
}

function createEmptyTotals(): Record<StatusColumn, number> {
  return { Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 }
}

export function useEffortFlowHistory({
  adoQueryEngine,
  team,
  tagRules,
  workItems,
  iterationWindow,
}: UseEffortFlowHistoryArgs): UseEffortFlowHistoryResult {
  const [timelinesByItemId, setTimelinesByItemId] = useState<Record<number, TimelineEntry[]>>({})
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!adoQueryEngine || workItems.length === 0) {
      setTimelinesByItemId({})
      return
    }

    const abortController = new AbortController()
    setIsLoading(true)

    Promise.all(
      workItems.map(async (item) => {
        try {
          const updates = await adoQueryEngine.getWorkItemUpdates(team, item.id, abortController.signal)
          return [item.id, buildItemTimeline(item, updates, tagRules)] as const
        } catch {
          return [item.id, buildItemTimeline(item, [], tagRules)] as const
        }
      }),
    )
      .then((entries) => {
        if (abortController.signal.aborted) {
          return
        }

        setTimelinesByItemId(Object.fromEntries(entries))
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setTimelinesByItemId({})
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, team, tagRules, workItems])

  const points = useMemo<EffortFlowPoint[]>(() => {
    const start = parseDateOnly(iterationWindow.current?.startDate)
    const finish = parseDateOnly(iterationWindow.current?.finishDate)
    if (!start || !finish || workItems.length === 0 || finish < start) {
      return []
    }

    const today = new Date()
    const todayAtMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    const result: EffortFlowPoint[] = []

    // Span the full sprint (start through finish) so future days render as blank space rather than
    // stopping the chart at today. Weekends are skipped entirely — we expect little to no movement
    // on those days, so they'd just add noise.
    for (let cursor = new Date(start); cursor <= finish; cursor = new Date(cursor.getTime() + DAY_MS)) {
      const dayOfWeek = cursor.getDay()
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        continue
      }

      if (cursor > todayAtMidnight) {
        result.push({ date: formatDateKey(cursor), Blocked: null, New: null, Active: null, Review: null, Done: null })
        continue
      }

      const endOfDayMs = cursor.getTime() + DAY_MS - 1
      const totals = createEmptyTotals()

      for (const item of workItems) {
        const timeline = timelinesByItemId[item.id]
        if (!timeline) {
          continue
        }

        const asOf = statusAsOf(timeline, endOfDayMs)
        if (!asOf) {
          continue
        }

        totals[asOf.status] += asOf.effort
      }

      result.push({ date: formatDateKey(cursor), ...totals })
    }

    return result
  }, [iterationWindow, timelinesByItemId, workItems])

  const visitedStatusesByItemId = useMemo<Record<number, StatusColumn[]>>(() => {
    const sprintStart = parseDateOnly(iterationWindow.current?.startDate)
    if (!sprintStart) {
      return {}
    }

    const sprintStartMs = sprintStart.getTime()
    const nowMs = Date.now()
    const result: Record<number, StatusColumn[]> = {}

    for (const [itemIdText, timeline] of Object.entries(timelinesByItemId)) {
      const visited = new Set<StatusColumn>()
      const atSprintStart = statusAsOf(timeline, sprintStartMs)
      if (atSprintStart) {
        visited.add(atSprintStart.status)
      }

      for (const entry of timeline) {
        if (entry.timestamp > sprintStartMs && entry.timestamp <= nowMs) {
          visited.add(entry.status)
        }
      }

      result[Number(itemIdText)] = Array.from(visited)
    }

    return result
  }, [iterationWindow, timelinesByItemId])

  return { points, isLoading, visitedStatusesByItemId }
}

export { STATUS_COLUMNS }
