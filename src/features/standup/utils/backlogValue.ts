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
  /** 1-based position among all of the team's open bugs, so it holds while the quick filter hides some; 1 when ranked alone. */
  rank: number
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
    rank: 1,
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
  const ranked = bugs.map((bug) => rankWithSprint(bug, resolveSprint)).sort(compareRankedBacklogBugs)
  ranked.forEach((bug, index) => {
    bug.rank = index + 1
  })
  return ranked
}

/** The lowest and highest Values a bug can score at the minimum effort, which bound the Value meter. */
const VALUE_METER_MIN = ((SEVERITY_SCORES[4] * IMPACT_SCORES[4]) / MIN_ADJUSTED_EFFORT) * VALUE_MULTIPLIER
const VALUE_METER_MAX = ((SEVERITY_SCORES[1] * IMPACT_SCORES[1]) / MIN_ADJUSTED_EFFORT) * VALUE_MULTIPLIER
const VALUE_METER_FLOOR = 4

/**
 * How full the Value meter is, from 4 to 100. The scale is logarithmic because each severity and impact level
 * multiplies the Value, so equal steps in the meter are equal steps in level. The bounds come from the formula, not
 * the team's bugs, so a bar means the same thing on every team; a Value below the lowest bound keeps a sliver.
 */
export function getValueMeterPercent(value: number): number {
  if (!(value > 0)) {
    return VALUE_METER_FLOOR
  }

  const position = (Math.log(value) - Math.log(VALUE_METER_MIN)) / (Math.log(VALUE_METER_MAX) - Math.log(VALUE_METER_MIN))
  return Math.min(100, Math.max(VALUE_METER_FLOOR, position * 100))
}

/** A number in the Value tooltip: at most one decimal, and none for a whole number ("4.8", "8", "96.8"). */
export function formatValueTerm(value: number): string {
  return String(Math.round(value * 10) / 10)
}

const SEVERITY_NAMES: Readonly<Record<number, string>> = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low' }
const IMPACT_NAMES: Readonly<Record<number, string>> = {
  1: 'most users hit it',
  2: 'many users hit it',
  3: 'some users hit it',
  4: 'few users hit it',
}

export type SeverityDisplay = {
  /** 1-4 when the Value scores the severity as written; undefined for a severity it cannot read. */
  level: number | undefined
  /** The severity's name, such as "Critical", or the severity as written when it has no level. */
  name: string
  /** "S1 · Critical", or the severity as written when it has no level. */
  label: string
}

/** How the Severity column shows a picklist value such as "1 - Critical", or undefined when it is not set. */
export function getSeverityDisplay(severity: string | undefined): SeverityDisplay | undefined {
  const text = severity?.trim()
  if (!text) {
    return undefined
  }

  const level = parseLevel(text)
  if (level === undefined || SEVERITY_SCORES[level] === undefined) {
    return { level: undefined, name: text, label: text }
  }

  const name = text.replace(/^\d+\s*-?\s*/, '') || SEVERITY_NAMES[level]
  return { level, name, label: `S${level} · ${name}` }
}

/** What a bug's Impact (its Priority) level means, such as "most users hit it", or undefined for an unknown level. */
export function getImpactDescription(priority: number | undefined): string | undefined {
  return priority === undefined ? undefined : IMPACT_NAMES[priority]
}

/** Which of the Value's inputs it assumed a default for, because the field is empty or unreadable. */
export function getAssumedValueInputs(bug: RankedBacklogBug): { severity: boolean; impact: boolean; effort: boolean } {
  return {
    severity: getSeverityDisplay(bug.severity)?.level === undefined,
    impact: getImpactDescription(bug.priority) === undefined,
    effort: bug.effort === undefined || !Number.isFinite(bug.effort),
  }
}

function describeSeverity(bug: RankedBacklogBug): string {
  const display = getSeverityDisplay(bug.severity)
  const score = formatValueTerm(bug.severityScore)
  if (display?.level !== undefined) {
    return `Severity ${bug.severity?.trim()} → ${score}`
  }

  const given = display ? `"${display.label}" has no level` : 'not set'
  return `Severity ${given}, counted as ${DEFAULT_LEVEL} - ${SEVERITY_NAMES[DEFAULT_LEVEL]} → ${score}`
}

function describeImpact(bug: RankedBacklogBug): string {
  const score = formatValueTerm(bug.impactScore)
  const description = getImpactDescription(bug.priority)
  if (description) {
    return `Impact ${bug.priority}, ${description} → ${score}`
  }

  const given = bug.priority === undefined ? 'not set' : `${bug.priority} has no level`
  return `Impact ${given}, counted as ${DEFAULT_LEVEL} → ${score}`
}

function describeEffort(bug: RankedBacklogBug): string {
  if (bug.effort === undefined || !Number.isFinite(bug.effort)) {
    return `Effort not set, counted as ${MIN_ADJUSTED_EFFORT} pts`
  }

  const effort = formatValueTerm(bug.effort)
  return bug.effort < MIN_ADJUSTED_EFFORT
    ? `Effort ${effort} pts, raised to the minimum ${MIN_ADJUSTED_EFFORT}`
    : `Effort ${effort} pts`
}

/**
 * The lines of the Value tooltip: the sum with its terms, then where each term came from, noting any assumed or
 * raised input. Numbers are rounded to one decimal for reading, so the sum is approximate; the ranking is exact.
 */
export function describeBacklogValue(bug: RankedBacklogBug): string[] {
  const terms = [bug.severityScore, bug.impactScore, bug.adjustedEffort].map(formatValueTerm)
  return [
    `Value ${formatValueTerm(bug.value)} = ${terms[0]} × ${terms[1]} ÷ ${terms[2]} × ${VALUE_MULTIPLIER}`,
    describeSeverity(bug),
    describeImpact(bug),
    describeEffort(bug),
  ]
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
