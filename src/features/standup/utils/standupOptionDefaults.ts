import type { AssignmentOptions } from './assignmentOptions'
import { DEFAULT_ASSIGNMENT_SPRINT_FILTER } from './assignmentOptions'
import type { QaOptions } from './qaOptions'
import { DEFAULT_QA_LOOKBACK_DAYS, EMPTY_SPRINT_FILTER } from './qaOptions'

export function createDefaultQaOptions(): QaOptions {
  return {
    generalFilters: [],
    includeWorkItemTypes: [],
    lookbackDays: DEFAULT_QA_LOOKBACK_DAYS,
    sprintFilter: { ...EMPTY_SPRINT_FILTER },
    stateGroups: null,
    tagGroups: null,
  }
}

export function createDefaultAssignmentOptions(): AssignmentOptions {
  return {
    includeWorkItemTypes: [],
    sprintFilter: { ...DEFAULT_ASSIGNMENT_SPRINT_FILTER },
  }
}
