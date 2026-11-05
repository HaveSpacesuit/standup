import type { BacklogTierThresholds } from './backlogOptions'
import { getBacklogTier, type BacklogTierKey } from './backlogTiers'
import { getImpactDescription, getSeverityDisplay, MIN_ADJUSTED_EFFORT, type RankedBacklogBug } from './backlogValue'
import { formatEffort } from './sprintEffortTotals'

/** Bugs with the same inputs to the Value, which share one place on the map. */
export type BacklogMapBubble = {
  key: string
  /** The effort the Value divides by: the Effort, raised to the minimum. */
  adjustedEffort: number
  /** Severity score × Impact score: what fixing one of the bugs is worth before its effort. */
  benefit: number
  value: number
  tier: BacklogTierKey
  /** The Value assumed a missing or unreadable input, so the bubble's place is a guess. */
  assumed: boolean
  /** In ranked order. */
  bugs: RankedBacklogBug[]
}

export type PlacedBacklogMapBubble = BacklogMapBubble & { cx: number; cy: number; r: number }

/** Value = benefit ÷ effort × 10, so the benefit of a Value at an effort is Value × effort ÷ 10. */
const VALUE_MULTIPLIER = 10

/** Severity × Impact runs from 1 (S4, Impact 4) to 85.2 (S1, Impact 1), with room for the bubbles at either end. */
export const MAP_BENEFIT_DOMAIN: readonly [number, number] = [0.8, 120]
export const MAP_BENEFIT_TICKS: readonly number[] = [1, 2, 5, 10, 20, 50, 100]
/** The log-scale margin around the efforts, so bubbles at either end stay inside the plot. */
const EFFORT_PADDING = 1.22
/** The narrowest effort range, so a backlog of small bugs still spreads out. */
const MIN_EFFORT_SPAN = 2.5
/** The fewest pixels between effort labels. */
export const MIN_TICK_GAP = 28

const BUBBLE_MIN_RADIUS = 8
const BUBBLE_MAX_RADIUS = 16
const BUBBLE_RADIUS_STEP = 2.5
/** Assumed bubbles sit a little left of known ones with the same inputs, so they never cover each other exactly. */
const ASSUMED_OFFSET = 7
/** How far a bubble moves sideways, per step, out of the way of one already placed. */
const NUDGE = 13
const NUDGE_STEPS = [0, 1, -1, 2, -2, 3, -3, 4, -4]

/** The Value used a default for the Severity, the Impact, or the Effort. */
export function usesAssumedDefault(bug: RankedBacklogBug): boolean {
  return getSeverityDisplay(bug.severity)?.level === undefined
    || getImpactDescription(bug.priority) === undefined
    || bug.effort === undefined
    || !Number.isFinite(bug.effort)
}

/** One bubble per distinct effort, benefit, and assumed flag; given ranked bugs, the bubbles follow the best rank. */
export function groupBacklogMapBubbles(bugs: readonly RankedBacklogBug[], thresholds: BacklogTierThresholds): BacklogMapBubble[] {
  const bubbles = new Map<string, BacklogMapBubble>()
  for (const bug of bugs) {
    const benefit = bug.severityScore * bug.impactScore
    const assumed = usesAssumedDefault(bug)
    const key = `${bug.adjustedEffort}:${benefit.toFixed(3)}:${assumed ? 'assumed' : 'known'}`
    const bubble = bubbles.get(key)
    if (bubble) {
      bubble.bugs.push(bug)
    } else {
      bubbles.set(key, {
        key,
        adjustedEffort: bug.adjustedEffort,
        benefit,
        value: bug.value,
        tier: getBacklogTier(bug.value, thresholds),
        assumed,
        bugs: [bug],
      })
    }
  }
  return [...bubbles.values()]
}

/** The effort axis's ends: the team's efforts with a margin, and at least a 2.5× span. */
export function getMapEffortDomain(bubbles: readonly BacklogMapBubble[]): [number, number] {
  const efforts = bubbles.map((bubble) => bubble.adjustedEffort)
  const low = Math.min(MIN_ADJUSTED_EFFORT, ...efforts)
  const high = Math.max(low * MIN_EFFORT_SPAN, ...efforts)
  return [low / EFFORT_PADDING, high * EFFORT_PADDING]
}

/** Maps a value on a log scale from `domain` to `range`; the range may run backwards, as the y axis does. */
export function createLogScale([d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]) {
  const span = Math.log(d1) - Math.log(d0)
  return (value: number) => r0 + ((Math.log(value) - Math.log(d0)) / span) * (r1 - r0)
}

/**
 * The efforts to label: the team's own efforts rather than a fixed scale, skipping any too close to the last label.
 * The largest effort is always labeled, in place of the label before it if needed.
 */
export function pickEffortTicks(efforts: readonly number[], toX: (effort: number) => number, minGap = MIN_TICK_GAP): number[] {
  const sorted = [...new Set(efforts)].sort((a, b) => a - b)
  const ticks: number[] = []
  for (const effort of sorted) {
    if (ticks.length === 0 || toX(effort) - toX(ticks[ticks.length - 1]) >= minGap) {
      ticks.push(effort)
    }
  }

  const largest = sorted[sorted.length - 1]
  if (ticks.length > 1 && ticks[ticks.length - 1] !== largest) {
    ticks[ticks.length - 1] = largest
  }
  return ticks
}

/** "≤4" for the minimum, which also stands for every smaller or missing Effort; otherwise the effort. */
export function formatMapEffort(effort: number): string {
  return effort === MIN_ADJUSTED_EFFORT ? `≤${MIN_ADJUSTED_EFFORT}` : formatEffort(effort)
}

/** The benefit that scores `value` at `effort`, for drawing a line of equal Value. */
export function benefitForValue(value: number, effort: number): number {
  return (value * effort) / VALUE_MULTIPLIER
}

export type MapPoint = { effort: number; benefit: number }

/** A line of equal Value across the plot, and where to label it. */
export type IsoValueLine = { value: number; start: MapPoint; end: MapPoint; label: MapPoint }

/** How far the label sits back from where its line leaves the plot, as a ratio of effort, so it stays inside. */
const ISO_LABEL_INSET = 1.18

/**
 * The line through every effort and benefit that scores `value`, from the left edge of the plot to the right; null
 * when it misses the plot. Its label sits near where it leaves the plot, at the top or the right.
 */
export function getIsoValueLine(
  value: number,
  [lowEffort, highEffort]: readonly [number, number],
  [lowBenefit, highBenefit]: readonly [number, number],
): IsoValueLine | null {
  if (!(value > 0) || benefitForValue(value, highEffort) <= lowBenefit || benefitForValue(value, lowEffort) >= highBenefit) {
    return null
  }

  const at = (effort: number): MapPoint => ({ effort, benefit: benefitForValue(value, effort) })
  const exitEffort = Math.min(highEffort, (highBenefit * VALUE_MULTIPLIER) / value)
  return {
    value,
    start: at(lowEffort),
    end: at(highEffort),
    label: at(Math.max(lowEffort, exitEffort / ISO_LABEL_INSET)),
  }
}

export function getBubbleRadius(count: number): number {
  return Math.min(BUBBLE_MAX_RADIUS, BUBBLE_MIN_RADIUS + BUBBLE_RADIUS_STEP * (count - 1))
}

/**
 * Places each bubble at its effort and benefit. Bubbles are placed largest first, and one that would overlap a
 * bubble already placed moves sideways, within the plot, to the nearest free spot; with none it keeps its place.
 */
export function layoutBacklogMap(
  bubbles: readonly BacklogMapBubble[],
  toX: (effort: number) => number,
  toY: (benefit: number) => number,
  [left, right]: readonly [number, number],
): PlacedBacklogMapBubble[] {
  const placed = new Map<string, PlacedBacklogMapBubble>()
  const bySize = [...bubbles].sort((a, b) => b.bugs.length - a.bugs.length || b.value - a.value)
  for (const bubble of bySize) {
    const r = getBubbleRadius(bubble.bugs.length)
    const home = toX(bubble.adjustedEffort) - (bubble.assumed ? ASSUMED_OFFSET : 0)
    const cy = toY(bubble.benefit)
    const fits = (x: number) => x - r >= left && x + r <= right
    const free = (x: number) => [...placed.values()].every((other) => Math.hypot(other.cx - x, other.cy - cy) >= other.r + r + 1)
    const cx = NUDGE_STEPS.map((step) => home + step * NUDGE).find((x) => fits(x) && free(x)) ?? home
    placed.set(bubble.key, { ...bubble, cx, cy, r })
  }
  // Back in the order given, which sets the keyboard order: by Value when the bubbles came from ranked bugs.
  return bubbles.map((bubble) => placed.get(bubble.key)!)
}
