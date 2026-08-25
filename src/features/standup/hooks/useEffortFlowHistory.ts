import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine, IterationWindowInfo, WorkItemSummary, WorkItemUpdate } from '../../../ado/queryEngine'
import { resolveStatusFromStateAndTags, type TagRule } from '../../../ado/workItemStatus'
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
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDateOnly(value?: string): Date | null {
  if (!value) {
    return null
  }

  const datePart = value.slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart)
  if (!match) {
    const fallback = new Date(value)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function toTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function resolveUpdateTimestamp(update: WorkItemUpdate, now: number): string | undefined {
  const changedDateValue = update.fields?.['System.ChangedDate']?.newValue
  const candidate = typeof changedDateValue === 'string' ? changedDateValue : update.revisedDate
  const timestamp = toTimestamp(candidate)
  return timestamp !== null && timestamp <= now ? candidate : undefined
}

function parseEffortValue(value: unknown): number | undefined {
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

    for (const fieldName of ['Microsoft.VSTS.Scheduling.Effort', 'Microsoft.VSTS.Scheduling.StoryPoints', 'Microsoft.VSTS.Scheduling.Size']) {
      if (Object.hasOwn(fields, fieldName)) {
        const parsed = parseEffortValue(fields[fieldName]?.newValue)
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

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
    // stopping the chart at today.
    for (let cursor = new Date(start); cursor <= finish; cursor = new Date(cursor.getTime() + DAY_MS)) {
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

  return { points, isLoading }
}

export { STATUS_COLUMNS }
