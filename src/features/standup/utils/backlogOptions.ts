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
}

export const BACKLOG_OPTIONS_STORAGE_KEY_PREFIX = 'standup:backlog-options'

export const DEFAULT_BACKLOG_TIER_THRESHOLDS: Readonly<BacklogTierThresholds> = { top: 80, high: 30, medium: 12 }

export function backlogOptionsStorageKey(teamId: string): string {
  return `${BACKLOG_OPTIONS_STORAGE_KEY_PREFIX}:${teamId}`
}

export function createDefaultBacklogOptions(): BacklogOptions {
  return {
    tierThresholds: { ...DEFAULT_BACKLOG_TIER_THRESHOLDS },
    startLowCollapsed: true,
  }
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
