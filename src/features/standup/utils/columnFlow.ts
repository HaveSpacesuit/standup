import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { EffortFlowPoint } from '../hooks/useEffortFlowHistory'
import { calendarDaysBetween, type SprintJourney } from './sprintJourney'
import { formatEffortPoints } from './sprintEffortTotals'
import { STATUS_COLUMNS, type StatusColumn } from './statusColumnStyles'

export type ColumnFlowTone = 'positive' | 'critical' | 'neutral'

/** How a column's effort has moved this sprint, for its header. */
export type ColumnFlow = {
  /** The column's effort at the end of each working day so far. */
  series: number[]
  /** Working days in the whole sprint, so the sparkline leaves room for the days still to come. */
  dayCount: number
  /** Effort now minus effort on the sprint's first day. */
  delta: number
  tone: ColumnFlowTone
  /** Calendar days the longest-waiting card has been in the column; Active and Review only. */
  oldestDays: number | null
}

/** Columns where a card sitting still is worth calling out. */
const OLDEST_AGE_COLUMNS: ReadonlySet<StatusColumn> = new Set(['Active', 'Review'])
/** Matches the card captions, which turn amber from five days. */
export const COLUMN_OLDEST_ATTENTION_DAYS = 5

const DELTA_EPSILON = 1e-9

/** Done growing is good news; Blocked growing is bad news and shrinking is good news. */
export function getColumnFlowTone(status: StatusColumn, delta: number): ColumnFlowTone {
  if (status === 'Done') {
    return delta > DELTA_EPSILON ? 'positive' : 'neutral'
  }
  if (status === 'Blocked') {
    return delta > DELTA_EPSILON ? 'critical' : delta < -DELTA_EPSILON ? 'positive' : 'neutral'
  }
  return 'neutral'
}

/** "▲3 pts", "▼2 pts", or "±0 pts". */
export function formatColumnFlowDelta(delta: number): string {
  if (Math.abs(delta) <= DELTA_EPSILON) {
    return '±0 pts'
  }
  return `${delta > 0 ? '▲' : '▼'}${formatEffortPoints(Math.abs(delta))}`
}

/** "3 pts more than at sprint start", for screen readers and the tooltip. */
export function describeColumnFlowDelta(delta: number): string {
  if (Math.abs(delta) <= DELTA_EPSILON) {
    return 'No change since sprint start'
  }
  return `${formatEffortPoints(Math.abs(delta))} ${delta > 0 ? 'more' : 'fewer'} than at sprint start`
}

function daysInCurrentColumn(journey: SprintJourney, now: number): number {
  const { steps } = journey
  // Same rule as the card captions: a card that never moved has been there since before the sprint.
  const since = steps.length === 1 ? journey.firstStepSince : steps[steps.length - 1].at
  return calendarDaysBetween(since, now)
}

type GetColumnFlowsOptions = {
  points: readonly EffortFlowPoint[]
  /** The current sprint's cards. */
  items: readonly WorkItemSummary[]
  journeysByItemId: Record<number, SprintJourney>
  now: number
}

/** Each column's flow, or null until the sprint has at least one day of history. */
export function getColumnFlows({ points, items, journeysByItemId, now }: GetColumnFlowsOptions): Record<StatusColumn, ColumnFlow> | null {
  const elapsed = points.filter((point) => STATUS_COLUMNS.some((status) => point[status] !== null))
  if (elapsed.length === 0) {
    return null
  }

  const oldestByStatus = new Map<StatusColumn, number>()
  for (const item of items) {
    const journey = journeysByItemId[item.id]
    if (!journey || !OLDEST_AGE_COLUMNS.has(item.status) || journey.steps[journey.steps.length - 1].status !== item.status) {
      continue
    }
    const days = daysInCurrentColumn(journey, now)
    oldestByStatus.set(item.status, Math.max(oldestByStatus.get(item.status) ?? 0, days))
  }

  return Object.fromEntries(STATUS_COLUMNS.map((status) => {
    const series = elapsed.map((point) => point[status] ?? 0)
    const delta = series[series.length - 1] - series[0]
    return [status, {
      series,
      dayCount: points.length,
      delta,
      tone: getColumnFlowTone(status, delta),
      oldestDays: oldestByStatus.get(status) ?? null,
    }]
  })) as Record<StatusColumn, ColumnFlow>
}
