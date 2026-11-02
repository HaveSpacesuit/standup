import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { SprintEffortTotals } from './sprintForecast'

const EFFORT_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

/** Summed fractional estimates round to one decimal place. */
export function formatEffort(effort: number): string {
  return EFFORT_FORMAT.format(effort)
}

/** "13 pts" */
export function formatEffortPoints(effort: number): string {
  return `${formatEffort(effort)} pts`
}

export function createEmptyEffortTotals(): SprintEffortTotals {
  return { Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 }
}

/** Effort per status for current-sprint items; every item counts when the current sprint is unknown. */
export function getCurrentSprintEffortTotals(
  workItems: readonly WorkItemSummary[],
  currentIterationName: string | null,
): SprintEffortTotals {
  const totals = createEmptyEffortTotals()

  for (const item of workItems) {
    if (currentIterationName && item.sprintName !== currentIterationName) {
      continue
    }

    if (typeof item.effort === 'number') {
      totals[item.status] += item.effort
    }
  }

  return totals
}
