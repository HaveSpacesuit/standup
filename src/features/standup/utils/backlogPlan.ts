import { formatBacklogValue, MIN_ADJUSTED_EFFORT, type RankedBacklogBug } from './backlogValue'

/** Why the planner passed over a bug ranked above its last pick. */
export type BacklogPlanSkipReason = 'Unchecked' | 'This sprint' | 'Next sprint' | 'No effort' | 'Too big'

/** The bugs picked or unpicked by hand, which override the planner's own choice. */
export type BacklogPlanPicks = {
  forceIn: ReadonlySet<number>
  forceOut: ReadonlySet<number>
}

export type BacklogPlanSettings = BacklogPlanPicks & {
  /** Effort points to fill. */
  budget: number
  skipPlanned: boolean
  skipUnestimated: boolean
}

export type BacklogPlan = {
  /** The bugs the planner could pick: the listed bugs, narrowed to the Needs attention facet when one is on. */
  candidateIds: ReadonlySet<number>
  pickedIds: ReadonlySet<number>
  skipReasons: ReadonlyMap<number, BacklogPlanSkipReason>
  /** Each pick's effort plus the effort of the picks ranked above it. */
  runningTotals: ReadonlyMap<number, number>
  /** The picks in rank order. */
  picks: readonly RankedBacklogBug[]
  /** The picks' effort, which a hand pick can push over the budget. */
  used: number
  budget: number
  valueTotal: number
  /** Picks without an Effort, each counted as the minimum. */
  assumedEffortCount: number
}

export const NO_PLAN_PICKS: BacklogPlanPicks = { forceIn: new Set(), forceOut: new Set() }

const hasEffort = (bug: RankedBacklogBug) => bug.effort !== undefined && Number.isFinite(bug.effort)

/** The points a bug takes from the budget: its Effort, or the Value's minimum when it has none. */
export function getPlanEffort(bug: RankedBacklogBug): number {
  return hasEffort(bug) ? bug.effort! : MIN_ADJUSTED_EFFORT
}

function getSkipReason(
  bug: RankedBacklogBug,
  settings: BacklogPlanSettings,
  used: number,
): BacklogPlanSkipReason | undefined {
  if (settings.forceOut.has(bug.id)) {
    return 'Unchecked'
  }
  if (settings.skipPlanned && bug.sprint.kind === 'current') {
    return 'This sprint'
  }
  if (settings.skipPlanned && bug.sprint.kind === 'next') {
    return 'Next sprint'
  }
  if (settings.skipUnestimated && !hasEffort(bug)) {
    return 'No effort'
  }
  return used + getPlanEffort(bug) > settings.budget ? 'Too big' : undefined
}

/**
 * Fills the budget greedily in rank order: each bug that fits is picked, and one that doesn't is passed over so a
 * smaller bug further down can still fill the gap. Hand picks come first and always count, even past the budget.
 */
export function planBacklogSprint(candidates: readonly RankedBacklogBug[], settings: BacklogPlanSettings): BacklogPlan {
  let used = candidates.reduce((sum, bug) => sum + (settings.forceIn.has(bug.id) ? getPlanEffort(bug) : 0), 0)
  const pickedIds = new Set<number>()
  const skipReasons = new Map<number, BacklogPlanSkipReason>()

  for (const bug of candidates) {
    if (settings.forceIn.has(bug.id)) {
      pickedIds.add(bug.id)
      continue
    }

    const reason = getSkipReason(bug, settings, used)
    if (reason) {
      skipReasons.set(bug.id, reason)
      continue
    }

    pickedIds.add(bug.id)
    used += getPlanEffort(bug)
  }

  const picks = candidates.filter((bug) => pickedIds.has(bug.id))
  const runningTotals = new Map<number, number>()
  let running = 0
  for (const bug of picks) {
    running += getPlanEffort(bug)
    runningTotals.set(bug.id, running)
  }

  return {
    candidateIds: new Set(candidates.map((bug) => bug.id)),
    pickedIds,
    skipReasons,
    runningTotals,
    picks,
    used,
    budget: settings.budget,
    valueTotal: picks.reduce((sum, bug) => sum + bug.value, 0),
    assumedEffortCount: picks.filter((bug) => !hasEffort(bug)).length,
  }
}

/**
 * Checking or unchecking a bug by hand, given whether it was picked before the click. Undoing a hand choice hands the
 * bug back to the planner: unchecking a bug picked by hand drops the hand pick, and checking a bug unchecked by hand
 * lets the planner consider it again in rank order.
 */
export function togglePlanPick(picks: BacklogPlanPicks, id: number, wasPicked: boolean): BacklogPlanPicks {
  const forceIn = new Set(picks.forceIn)
  const forceOut = new Set(picks.forceOut)
  if (wasPicked) {
    if (!forceIn.delete(id)) {
      forceOut.add(id)
    }
  } else if (!forceOut.delete(id)) {
    forceIn.add(id)
  }
  return { forceIn, forceOut }
}

/** One tab-separated line per pick, which pastes into a spreadsheet or a chat as a list. */
export function formatPlanList(picks: readonly RankedBacklogBug[]): string {
  return picks
    .map((bug) => `${bug.id}\t${bug.title}\t${hasEffort(bug) ? bug.effort : '?'} pts\tValue ${formatBacklogValue(bug.value)}`)
    .join('\n')
}
