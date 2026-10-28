import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine, IterationWindowInfo, WorkItemSummary, WorkItemUpdate } from '../../../ado/queryEngine'
import { resolveStatusFromStateAndTags, type TagRule } from '../../../ado/workItemStatus'
import { resolveUpdateTimestamp, toTimestamp } from '../../../ado/workItemHistoryTimeline'
import { EFFORT_FIELD_NAMES, parseEffort } from '../../../ado/workItemsApi'
import { formatDateKey, parseDateOnly } from '../utils/dateOnly'
import { STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
import { calculateSprintForecast, type SprintForecast } from '../utils/sprintForecast'
import type { SprintScopeState } from './useSprintScopeChanges'

export type EffortFlowPoint = { date: string } & Record<StatusColumn, number | null>

type UseEffortFlowHistoryArgs = {
  adoQueryEngine: AdoQueryEngine | null
  team: { orgName: string; projectName: string }
  tagRules: TagRule[]
  workItems: WorkItemSummary[]
  historyWorkItems?: WorkItemSummary[]
  iterationWindow: IterationWindowInfo
  /** Sprint-start membership; when omitted, every current item is treated as committed at start. */
  sprintScope?: SprintScopeState
}

type UseEffortFlowHistoryResult = {
  points: EffortFlowPoint[]
  isLoading: boolean
  sprintForecast: SprintForecast
  /** Distinct status columns each item occupied from the start of the current sprint through now,
   * derived from the same per-item revision timelines used for the effort flow chart (no extra queries). */
  visitedStatusesByItemId: Record<number, StatusColumn[]>
}

const DAY_MS = 24 * 60 * 60 * 1000

type TimelineEntry = {
  timestamp: number
  status: StatusColumn
  effort: number
  hasKnownState: boolean
}

type HistorySnapshot = {
  timelines: Record<number, TimelineEntry[]>
  unavailableItemIds: number[]
  queryEngine: AdoQueryEngine
  team: UseEffortFlowHistoryArgs['team']
  tagRules: TagRule[]
  items: WorkItemSummary[]
}

const EMPTY_TIMELINES: Record<number, TimelineEntry[]> = {}
const EMPTY_ITEMS: WorkItemSummary[] = []

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
      hasKnownState: currentState.trim().length > 0,
      // Effort is rarely revised — fall back to the item's current effort until history proves otherwise.
      effort: currentEffort ?? item.effort ?? 0,
    })
  }

  if (timeline.length === 0) {
    const createdAt = toTimestamp(item.createdAt) ?? now
    timeline.push({ timestamp: createdAt, status: item.status, effort: item.effort ?? 0, hasKnownState: false })
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
  historyWorkItems: boardHistoryWorkItems = workItems,
  iterationWindow,
  sprintScope,
}: UseEffortFlowHistoryArgs): UseEffortFlowHistoryResult {
  const removedWorkItems = sprintScope?.status === 'ready' ? sprintScope.removedItems : EMPTY_ITEMS
  const historyWorkItems = useMemo(() => {
    if (removedWorkItems.length === 0) {
      return boardHistoryWorkItems
    }
    const knownIds = new Set(boardHistoryWorkItems.map((item) => item.id))
    return [...boardHistoryWorkItems, ...removedWorkItems.filter((item) => !knownIds.has(item.id))]
  }, [boardHistoryWorkItems, removedWorkItems])
  const [historySnapshot, setHistorySnapshot] = useState<HistorySnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const historyIsCurrent = historySnapshot?.queryEngine === adoQueryEngine
    && historySnapshot?.team === team
    && historySnapshot?.tagRules === tagRules
    && historySnapshot?.items === historyWorkItems
  const timelinesByItemId = historyIsCurrent ? historySnapshot.timelines : EMPTY_TIMELINES

  useEffect(() => {
    if (!adoQueryEngine || historyWorkItems.length === 0) {
      setHistorySnapshot(null)
      setIsLoading(false)
      return
    }

    const abortController = new AbortController()
    setIsLoading(true)

    Promise.all(
      historyWorkItems.map(async (item) => {
        try {
          const updates = await adoQueryEngine.getWorkItemUpdates(team, item.id, abortController.signal)
          const hasStateHistory = updates.some((update) =>
            typeof update.fields?.['System.State']?.newValue === 'string'
            && toTimestamp(resolveUpdateTimestamp(update, Date.now())) !== null,
          )
          return { itemId: item.id, timeline: buildItemTimeline(item, updates, tagRules), unavailable: !hasStateHistory }
        } catch {
          return { itemId: item.id, timeline: buildItemTimeline(item, [], tagRules), unavailable: true }
        }
      }),
    )
      .then((entries) => {
        if (abortController.signal.aborted) {
          return
        }

        setHistorySnapshot({
          timelines: Object.fromEntries(entries.map((entry) => [entry.itemId, entry.timeline])),
          unavailableItemIds: entries.filter((entry) => entry.unavailable).map((entry) => entry.itemId),
          queryEngine: adoQueryEngine,
          team,
          tagRules,
          items: historyWorkItems,
        })
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, team, tagRules, historyWorkItems])

  const sprintForecast = useMemo<SprintForecast>(() => {
    const forecastItems = workItems.filter((item) => item.kind !== 'pull-request')
    if (forecastItems.length === 0) {
      return { status: 'unavailable', reason: 'No current-sprint work items match the current filters.' }
    }
    if (!adoQueryEngine) {
      return { status: 'unavailable', reason: 'Work-item history is unavailable.' }
    }
    const start = parseDateOnly(iterationWindow.current?.startDate)
    const finish = parseDateOnly(iterationWindow.current?.finishDate)
    if (!start || !finish || finish < start) {
      return { status: 'unavailable', reason: 'Sprint dates are unavailable or invalid.' }
    }
    if (sprintScope?.status === 'unavailable') {
      return { status: 'unavailable', reason: 'Sprint membership at sprint start could not be loaded. Refresh to retry.' }
    }
    if (sprintScope?.status === 'loading' || isLoading || !historyIsCurrent) {
      return { status: 'loading' }
    }
    const startItemIds = sprintScope?.status === 'ready' ? sprintScope.startItemIds : null
    const now = new Date()
    const end = new Date(finish.getFullYear(), finish.getMonth(), finish.getDate() + 1).getTime() - 1
    const sprintEnded = now.getTime() > end
    const startTotals = createEmptyTotals()
    const currentTotals = createEmptyTotals()
    let addedEffort = 0
    let removedEffort = 0
    const timelineFor = (itemId: number) =>
      historySnapshot.unavailableItemIds.includes(itemId) ? undefined : timelinesByItemId[itemId]
    for (const item of forecastItems) {
      const timeline = timelineFor(item.id)
      if (!timeline) {
        return { status: 'unavailable', reason: 'Work-item history could not be loaded. Refresh to retry.' }
      }
      let currentEffort = item.effort ?? 0
      let currentStatus = item.status
      if (sprintEnded) {
        const final = statusAsOf(timeline, end)
        if (final && !final.hasKnownState) {
          return { status: 'unavailable', reason: 'Work-item history does not establish the sprint-end state.' }
        }
        currentEffort = final?.effort ?? 0
        currentStatus = final?.status ?? item.status
      }
      currentTotals[currentStatus] += currentEffort
      if (startItemIds && !startItemIds.has(item.id)) {
        addedEffort += currentEffort
        continue
      }
      const initial = statusAsOf(timeline, start.getTime())
      if ((initial && !initial.hasKnownState)
        || (!initial && (startItemIds !== null || (toTimestamp(item.createdAt) ?? 0) <= start.getTime()))) {
        return { status: 'unavailable', reason: 'Work-item history does not establish the sprint-start state.' }
      }
      if (initial) startTotals[initial.status] += initial.effort
    }
    for (const item of removedWorkItems) {
      const timeline = timelineFor(item.id)
      if (!timeline) {
        return { status: 'unavailable', reason: 'Work-item history could not be loaded. Refresh to retry.' }
      }
      const initial = statusAsOf(timeline, start.getTime())
      if (!initial || !initial.hasKnownState) {
        return { status: 'unavailable', reason: 'Work-item history does not establish the sprint-start state.' }
      }
      startTotals[initial.status] += initial.effort
      removedEffort += initial.effort
    }
    return calculateSprintForecast({
      startDate: iterationWindow.current?.startDate,
      finishDate: iterationWindow.current?.finishDate,
      start: startTotals,
      current: currentTotals,
      addedEffort,
      removedEffort,
      now,
    })
  }, [workItems, adoQueryEngine, isLoading, historyIsCurrent, historySnapshot, iterationWindow, timelinesByItemId, sprintScope, removedWorkItems])

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

  return { points, isLoading, visitedStatusesByItemId, sprintForecast }
}

export { STATUS_COLUMNS }
