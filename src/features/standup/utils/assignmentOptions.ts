import type { QaSprintFilter } from './qaOptions'

export type AssignmentSprintFilter = QaSprintFilter

export type AssignmentOptions = {
  /** Allow-list of work item types to query. Empty = query all types. */
  includeWorkItemTypes: string[]
  /** Sprint filter controlling which iterations are queried. */
  sprintFilter: AssignmentSprintFilter
}

export const ASSIGNMENT_OPTIONS_STORAGE_KEY_PREFIX = 'standup:assignment-options'
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

export function parseStoredAssignmentOptions(value: string | null): AssignmentOptions {
  const empty: AssignmentOptions = {
    includeWorkItemTypes: [],
    sprintFilter: { ...DEFAULT_ASSIGNMENT_SPRINT_FILTER },
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
      includeWorkItemTypes: parseStringArray(parsed.includeWorkItemTypes),
      sprintFilter: parseSprintFilter(parsed.sprintFilter),
    }
  } catch {
    return empty
  }
}

export function serializeAssignmentOptions(options: AssignmentOptions): string {
  return JSON.stringify(options)
}
