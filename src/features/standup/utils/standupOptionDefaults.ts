import type { AssignmentOptions } from './assignmentOptions'
import { DEFAULT_ASSIGNMENT_SPRINT_FILTER, DEFAULT_EFFORT_SUGGESTIONS } from './assignmentOptions'
import type { QaOptions } from './qaOptions'
import { DEFAULT_QA_LOOKBACK_DAYS, EMPTY_SPRINT_FILTER } from './qaOptions'
import { DEFAULT_ATTENTION_TAGS } from './attentionTags'

export function createDefaultQaOptions(): QaOptions {
  return {
    attentionTags: [...DEFAULT_ATTENTION_TAGS],
    generalFilters: [],
    includeWorkItemTypes: [],
    testers: [],
    lookbackDays: DEFAULT_QA_LOOKBACK_DAYS,
    sprintFilter: { ...EMPTY_SPRINT_FILTER },
    stateGroups: null,
    tagGroups: null,
  }
}

export function createDefaultAssignmentOptions(): AssignmentOptions {
  return {
    hideUsersWithNoActivity: false,
    hideUsersWithOnlyStaleDoneWork: false,
    includeWorkItemTypes: [],
    sprintFilter: { ...DEFAULT_ASSIGNMENT_SPRINT_FILTER },
    compactCards: false,
    includeQaTestersInStandup: false,
    effortSuggestions: [...DEFAULT_EFFORT_SUGGESTIONS],
  }
}
