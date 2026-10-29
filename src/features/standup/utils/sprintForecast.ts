import { parseDateOnly } from './dateOnly'
import type { StatusColumn } from './statusColumnStyles'

export type SprintEffortTotals = Record<StatusColumn, number>

/** Effort split into mutually exclusive buckets, so the three always add up to `total`. */
export type SprintForecastSnapshot = {
  /** Done. */
  complete: number
  /** Active + Review. */
  inProgress: number
  /** Blocked + New. */
  notStarted: number
  total: number
}

export type ReadySprintForecast = {
  status: 'ready'
  /** Effort committed at sprint start, including items since removed. */
  start: SprintForecastSnapshot
  /** Effort currently in the sprint. */
  current: SprintForecastSnapshot
  /** Where the current pace lands at sprint end, measured against today's scope. */
  projected: SprintForecastSnapshot
  /** Current effort of items that joined the sprint after it started. */
  addedEffort: number
  /** Sprint-start effort of items that have since left the sprint. */
  removedEffort: number
}

export type SprintForecast =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: string }
  | ReadySprintForecast

function workingDaysBetween(start: Date, finish: Date): number {
  let total = 0
  for (let day = new Date(start.getFullYear(), start.getMonth(), start.getDate()); day < finish;) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
    if (day.getDay() !== 0 && day.getDay() !== 6) {
      const overlap = Math.min(finish.getTime(), next.getTime()) - Math.max(start.getTime(), day.getTime())
      total += Math.max(0, overlap) / (next.getTime() - day.getTime())
    }
    day = next
  }
  return total
}

export function calculateSprintForecast({
  startDate,
  finishDate,
  start,
  current,
  addedEffort = 0,
  removedEffort = 0,
  now = new Date(),
}: {
  startDate?: string
  finishDate?: string
  start: SprintEffortTotals
  current: SprintEffortTotals
  addedEffort?: number
  removedEffort?: number
  now?: Date
}): SprintForecast {
  const firstDay = parseDateOnly(startDate)
  const lastDay = parseDateOnly(finishDate)
  if (!firstDay || !lastDay || lastDay < firstDay) {
    return { status: 'unavailable', reason: 'Sprint dates are unavailable or invalid.' }
  }

  const end = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1)
  if (now < firstDay) {
    return { status: 'unavailable', reason: 'The sprint has not started yet.' }
  }
  const asOf = new Date(Math.min(now.getTime(), end.getTime()))
  const elapsed = workingDaysBetween(firstDay, asOf)
  if (elapsed < 1) {
    return { status: 'unavailable', reason: 'Not enough history: at least one working day must elapse.' }
  }
  const remaining = workingDaysBetween(asOf, end)
  if ([...Object.values(start), ...Object.values(current), addedEffort, removedEffort].some((value) => !Number.isFinite(value) || value < 0)) {
    return { status: 'unavailable', reason: 'Sprint effort data is invalid.' }
  }

  const snapshot = (totals: SprintEffortTotals): SprintForecastSnapshot => {
    const complete = totals.Done
    const inProgress = totals.Active + totals.Review
    const notStarted = totals.Blocked + totals.New
    return { complete, inProgress, notStarted, total: complete + inProgress + notStarted }
  }
  const initial = snapshot(start)
  const latest = snapshot(current)
  const project = (before: number, after: number) => Math.max(0, after + (after - before) * remaining / elapsed)

  // Scope churn isn't trended: completion pace is measured against today's scope, so the projected
  // buckets still add up to the same total. Not started can't exceed what's left to do.
  const complete = Math.min(latest.total, project(initial.complete, latest.complete))
  const left = latest.total - complete
  const notStarted = Math.min(left, project(initial.notStarted, latest.notStarted))

  return {
    status: 'ready',
    start: initial,
    current: latest,
    projected: { complete, inProgress: left - notStarted, notStarted, total: latest.total },
    addedEffort,
    removedEffort,
  }
}
