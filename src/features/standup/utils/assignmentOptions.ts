import type { QaSprintFilter } from './qaOptions'

export type AssignmentSprintFilter = QaSprintFilter

export type AssignmentOptions = {
  hideUsersWithNoActivity: boolean
  /** Stricter form of hideUsersWithNoActivity: also hides users whose cards are all Done and stale. Ignored unless hideUsersWithNoActivity is on. */
  hideUsersWithOnlyStaleDoneWork: boolean
  /** Allow-list of work item types to query. Empty = query all types. */
  includeWorkItemTypes: string[]
  /** Sprint filter controlling which iterations are queried. */
  sprintFilter: AssignmentSprintFilter
  /** Show Development cards as a title and one status line, with full details on hover or focus. */
  compactCards: boolean
  /** Add QA tester lanes after developer lanes during a Developers view standup. */
  includeQaTestersInStandup: boolean
  /** The Effort values offered as one-click choices when editing a work item's effort, in ascending order. */
  effortSuggestions: number[]
}

export const ASSIGNMENT_OPTIONS_STORAGE_KEY_PREFIX = 'standup:assignment-options'
export const DEFAULT_EFFORT_SUGGESTIONS: readonly number[] = [4, 8, 16, 24, 40]
export const MAX_EFFORT_SUGGESTIONS = 10
export const DEFAULT_ASSIGNMENT_SPRINT_FILTER: AssignmentSprintFilter = {
  current: true,
  next: true,
  nextNext: false,
  iterationPaths: [],
}

export function assignmentOptionsStorageKey(teamId: string): string {
  return `${ASSIGNMENT_OPTIONS_STORAGE_KEY_PREFIX}:${teamId}`
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === 'string')
}

function parseSprintFilter(value: unknown): AssignmentSprintFilter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_ASSIGNMENT_SPRINT_FILTER }
  }

  const candidate = value as Record<string, unknown>
  return {
    current: candidate.current === true,
    next: candidate.next === true,
    nextNext: candidate.nextNext === true,
    iterationPaths: parseStringArray(candidate.iterationPaths),
  }
}

/**
 * A team's effort suggestions: positive values, without repeats, ascending, at most MAX_EFFORT_SUGGESTIONS of them.
 * A missing, invalid or empty list gives the defaults.
 */
export function parseEffortSuggestions(value: unknown): number[] {
  const values = Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry) && entry > 0)
    : []
  const unique = [...new Set(values)].sort((a, b) => a - b).slice(0, MAX_EFFORT_SUGGESTIONS)
  return unique.length > 0 ? unique : [...DEFAULT_EFFORT_SUGGESTIONS]
}

export function parseStoredAssignmentOptions(value: string | null): AssignmentOptions {
  const empty: AssignmentOptions = {
    hideUsersWithNoActivity: false,
    hideUsersWithOnlyStaleDoneWork: false,
    includeWorkItemTypes: [],
    sprintFilter: { ...DEFAULT_ASSIGNMENT_SPRINT_FILTER },
    compactCards: false,
    includeQaTestersInStandup: false,
    effortSuggestions: [...DEFAULT_EFFORT_SUGGESTIONS],
  }
  if (!value) {
    return empty
  }

  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return empty
    }

    return {
      hideUsersWithNoActivity: parsed.hideUsersWithNoActivity === true,
      hideUsersWithOnlyStaleDoneWork: parsed.hideUsersWithOnlyStaleDoneWork === true,
      includeWorkItemTypes: parseStringArray(parsed.includeWorkItemTypes),
      sprintFilter: parseSprintFilter(parsed.sprintFilter),
      compactCards: parsed.compactCards === true,
      includeQaTestersInStandup: parsed.includeQaTestersInStandup === true,
      effortSuggestions: parseEffortSuggestions(parsed.effortSuggestions),
    }
  } catch {
    return empty
  }
}

export function serializeAssignmentOptions(options: AssignmentOptions): string {
  return JSON.stringify(options)
}
