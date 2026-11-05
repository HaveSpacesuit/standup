/** The lowest Value of each named tier; anything under Medium is Low. */
export type BacklogTierThresholds = {
  top: number
  high: number
  medium: number
}

export type BacklogOptions = {
  tierThresholds: BacklogTierThresholds
  /** Low usually holds most of the backlog, so it can start collapsed to keep the list on the bugs worth discussing. */
  startLowCollapsed: boolean
  /** How many months a bug can stay New before Needs attention flags it as old. */
  agingMonths: number
  /** The effort budget, in points, that Plan a sprint starts from and goes back to on Reset. */
  defaultPlanBudget: number
  /** Whether Plan a sprint passes over bugs already in this sprint or the next. */
  skipPlannedBugs: boolean
  /** Whether Plan a sprint passes over bugs without an Effort, which it would otherwise count as the minimum. */
  skipUnestimatedBugs: boolean
}

export const BACKLOG_OPTIONS_STORAGE_KEY_PREFIX = 'standup:backlog-options'

export const DEFAULT_BACKLOG_TIER_THRESHOLDS: Readonly<BacklogTierThresholds> = { top: 80, high: 30, medium: 12 }

export const DEFAULT_AGING_MONTHS = 12
export const MAX_AGING_MONTHS = 120

export const DEFAULT_PLAN_BUDGET = 10
export const MAX_PLAN_BUDGET = 999

export function backlogOptionsStorageKey(teamId: string): string {
  return `${BACKLOG_OPTIONS_STORAGE_KEY_PREFIX}:${teamId}`
}

export function createDefaultBacklogOptions(): BacklogOptions {
  return {
    tierThresholds: { ...DEFAULT_BACKLOG_TIER_THRESHOLDS },
    startLowCollapsed: true,
    agingMonths: DEFAULT_AGING_MONTHS,
    defaultPlanBudget: DEFAULT_PLAN_BUDGET,
    skipPlannedBugs: true,
    skipUnestimatedBugs: true,
  }
}

/** A whole number of months, from 1 to 10 years. */
export function isValidAgingMonths(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_AGING_MONTHS
}

/** A whole number of points, from 1 to 999. */
export function isValidPlanBudget(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_PLAN_BUDGET
}

/** Each threshold must be a positive number below the one above it, so every Value falls in exactly one tier. */
export function areValidTierThresholds(thresholds: BacklogTierThresholds): boolean {
  const { top, high, medium } = thresholds
  return [top, high, medium].every(Number.isFinite) && top > high && high > medium && medium > 0
}

function parseTierThresholds(value: unknown): BacklogTierThresholds {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_BACKLOG_TIER_THRESHOLDS }
  }

  const candidate = value as Record<string, unknown>
  const thresholds = { top: candidate.top, high: candidate.high, medium: candidate.medium }
  const numeric = Object.values(thresholds).every((entry) => typeof entry === 'number')
  return numeric && areValidTierThresholds(thresholds as BacklogTierThresholds)
    ? (thresholds as BacklogTierThresholds)
    : { ...DEFAULT_BACKLOG_TIER_THRESHOLDS }
}

/** Reads stored or imported options; anything missing or invalid falls back to its default. */
export function parseBacklogOptions(value: unknown): BacklogOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createDefaultBacklogOptions()
  }

  const candidate = value as Record<string, unknown>
  return {
    tierThresholds: parseTierThresholds(candidate.tierThresholds),
    startLowCollapsed: candidate.startLowCollapsed !== false,
    agingMonths: isValidAgingMonths(candidate.agingMonths) ? candidate.agingMonths : DEFAULT_AGING_MONTHS,
    defaultPlanBudget: isValidPlanBudget(candidate.defaultPlanBudget) ? candidate.defaultPlanBudget : DEFAULT_PLAN_BUDGET,
    skipPlannedBugs: candidate.skipPlannedBugs !== false,
    skipUnestimatedBugs: candidate.skipUnestimatedBugs !== false,
  }
}

export function parseStoredBacklogOptions(value: string | null): BacklogOptions {
  if (!value) {
    return createDefaultBacklogOptions()
  }

  try {
    return parseBacklogOptions(JSON.parse(value))
  } catch {
    return createDefaultBacklogOptions()
  }
}

export function serializeBacklogOptions(options: BacklogOptions): string {
  return JSON.stringify(options)
}
