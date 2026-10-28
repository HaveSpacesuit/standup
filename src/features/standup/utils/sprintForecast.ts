import { parseDateOnly } from './dateOnly'
import type { StatusColumn } from './statusColumnStyles'

export type SprintEffortTotals = Record<StatusColumn, number>

export type SprintForecastRow = {
  label: 'Remaining' | 'Not started' | 'Complete' | 'Added' | 'Removed'
  /** True when the row is a subset of the row above it (Not started is part of Remaining). */
  nested?: boolean
  start: number
  current: number
  projected: number
}

export type SprintForecast =
  | { status: 'loading' }
  | { status: 'unavailable'; reason: string }
  | {
      status: 'ready'
      /** Effort currently in the sprint. */
      totalEffort: number
      /** Effort committed at sprint start, including items since removed. */
      startTotalEffort: number
      /** Current effort of items that joined the sprint after it started. */
      addedEffort: number
      /** Sprint-start effort of items that have since left the sprint. */
      removedEffort: number
      rows: SprintForecastRow[]
    }

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

  const totalEffort = Object.values(current).reduce((sum, effort) => sum + effort, 0)
  const startTotalEffort = Object.values(start).reduce((sum, effort) => sum + effort, 0)
  const group = (totals: SprintEffortTotals) => ({
    notStarted: totals.Blocked + totals.New,
    remaining: totals.Blocked + totals.New + totals.Active + totals.Review,
    complete: totals.Done,
  })
  const initial = group(start)
  const latest = group(current)
  const project = (before: number, after: number) => Math.max(0, after + (after - before) * remaining / elapsed)

  return {
    status: 'ready',
    totalEffort,
    startTotalEffort,
    addedEffort,
    removedEffort,
    rows: [
      { label: 'Remaining', start: initial.remaining, current: latest.remaining, projected: project(initial.remaining, latest.remaining) },
      { label: 'Not started', nested: true, start: initial.notStarted, current: latest.notStarted, projected: project(initial.notStarted, latest.notStarted) },
      { label: 'Complete', start: initial.complete, current: latest.complete, projected: Math.min(totalEffort, project(initial.complete, latest.complete)) },
      // Scope churn isn't trended. Added effort is already counted in Remaining/Complete.
      { label: 'Added', start: 0, current: addedEffort, projected: addedEffort },
      { label: 'Removed', start: 0, current: removedEffort, projected: removedEffort },
    ],
  }
}
