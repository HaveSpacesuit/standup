import type { BacklogBug, TeamIterationOption } from '../../../ado/types'
import { createBacklogSprintResolver, type BacklogSprint, type BacklogSprintResolver } from './backlogSprint'

const SEVERITY_SCORES: Readonly<Record<number, number>> = { 1: 10.648, 2: 4.84, 3: 2.2, 4: 1 }
const IMPACT_SCORES: Readonly<Record<number, number>> = { 1: 8, 2: 4, 3: 2, 4: 1 }

/** Severity and priority assumed when a bug leaves the field empty (or uses an unmapped value). */
const DEFAULT_LEVEL = 4
/** Smaller or missing efforts are raised to this floor so tiny estimates cannot dominate the ranking. */
export const MIN_ADJUSTED_EFFORT = 4
const VALUE_MULTIPLIER = 10
const VALUE_DECIMALS = 1
/** Values this close (relative to their size) are equal, so floating-point noise cannot split a genuine tie. */
const VALUE_TIE_TOLERANCE = 1e-9

export type RankedBacklogBug = BacklogBug & {
  severityScore: number
  impactScore: number
  adjustedEffort: number
  /** The exact value score. Ranking compares it unrounded; only the displayed text is rounded. */
  value: number
  /** The bug's sprint relative to the team's sprints; it plays no part in the ranking. */
  sprint: BacklogSprint
}

/** Reads a 1-4 level from a number or a picklist label such as "2 - High". */
function parseLevel(value: unknown): number | undefined {
  const level = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN
  return Number.isInteger(level) ? level : undefined
}

function scoreForLevel(scores: Readonly<Record<number, number>>, level: number | undefined): number {
  return scores[level ?? DEFAULT_LEVEL] ?? scores[DEFAULT_LEVEL]
}

export function getSeverityScore(severity: unknown): number {
  return scoreForLevel(SEVERITY_SCORES, parseLevel(severity))
}

/** The Priority field stands in for how frequently users encounter the bug. */
export function getImpactScore(priority: unknown): number {
  return scoreForLevel(IMPACT_SCORES, parseLevel(priority))
}

export function getAdjustedEffort(effort: number | undefined): number {
  return effort !== undefined && Number.isFinite(effort) ? Math.max(effort, MIN_ADJUSTED_EFFORT) : MIN_ADJUSTED_EFFORT
}

/** Rounds for display only; ranking always uses the exact value. */
export function formatBacklogValue(value: number): string {
  return value.toFixed(VALUE_DECIMALS)
}

function rankWithSprint(bug: BacklogBug, resolveSprint: BacklogSprintResolver): RankedBacklogBug {
  const severityScore = getSeverityScore(bug.severity)
  const impactScore = getImpactScore(bug.priority)
  const adjustedEffort = getAdjustedEffort(bug.effort)

  return {
    ...bug,
    severityScore,
    impactScore,
    adjustedEffort,
    value: ((severityScore * impactScore) / adjustedEffort) * VALUE_MULTIPLIER,
    sprint: resolveSprint(bug.iterationPath),
  }
}

const resolveWithoutSprints = createBacklogSprintResolver([])

/** Scores one bug; without the team's sprints its sprint is just its path's last segment. */
export function rankBacklogBug(bug: BacklogBug): RankedBacklogBug {
  return rankWithSprint(bug, resolveWithoutSprints)
}

function createdTime(bug: RankedBacklogBug): number {
  const time = bug.createdAt ? Date.parse(bug.createdAt) : Number.NaN
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

/** Exact value descending, then severity score descending, then oldest first; the id keeps equal rows stable. */
export function compareRankedBacklogBugs(a: RankedBacklogBug, b: RankedBacklogBug): number {
  const valueGap = b.value - a.value
  if (Math.abs(valueGap) > VALUE_TIE_TOLERANCE * Math.max(a.value, b.value)) {
    return valueGap
  }

  if (a.severityScore !== b.severityScore) {
    return b.severityScore - a.severityScore
  }

  const aCreated = createdTime(a)
  const bCreated = createdTime(b)
  if (aCreated !== bCreated) {
    return aCreated < bCreated ? -1 : 1
  }

  return a.id - b.id
}

/** Ranks the bugs and places each in the team's sprints, which are `iterations` (none until they load). */
export function rankBacklogBugs(bugs: readonly BacklogBug[], iterations: readonly TeamIterationOption[] = []): RankedBacklogBug[] {
  const resolveSprint = createBacklogSprintResolver(iterations)
  return bugs.map((bug) => rankWithSprint(bug, resolveSprint)).sort(compareRankedBacklogBugs)
}

const CREATED_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

export function formatCreatedDate(createdAt: string | undefined): string {
  const time = createdAt ? Date.parse(createdAt) : Number.NaN
  return Number.isNaN(time) ? '' : CREATED_DATE_FORMATTER.format(time)
}

const DAY_MS = 86_400_000

/** Whole days since the bug was created, or undefined when the date is missing or invalid. */
export function getBacklogAgeDays(createdAt: string | undefined, now = Date.now()): number | undefined {
  const time = createdAt ? Date.parse(createdAt) : Number.NaN
  return Number.isNaN(time) ? undefined : Math.max(Math.floor((now - time) / DAY_MS), 0)
}

/** The Assigned To text: the display name, else the unique name, else blank for an unassigned bug. */
export function formatAssignee(assignedTo: BacklogBug['assignedTo']): string {
  return assignedTo?.displayName || assignedTo?.uniqueName || ''
}
