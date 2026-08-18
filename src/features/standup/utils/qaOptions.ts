import type { TeamIterationOption } from '../../../ado/types'

export type QaFilterRuleType = 'work-item-type' | 'tag'

export type QaWorkItemTypeFilterRule = {
  id: string
  type: 'work-item-type'
  /** Case-insensitive exact match against workItemType */
  workItemType: string
}

export type QaTagFilterRule = {
  id: string
  type: 'tag'
  /** Case-insensitive partial match against any tag on the item */
  tagMatch: string
}

export type QaFilterRule = QaWorkItemTypeFilterRule | QaTagFilterRule

/**
 * State/tag classifiers that override the built-in project defaults.
 * Each group is a list of state names or tag partial-match strings.
 * Items are classified into the first group that matches (testing → done → development → new).
 */
export type QaStateGroupOverrides = {
  /** States/tags that mean "ready for QA" (maps to Ready for QA column) */
  testing: string[]
  /** States/tags that mean "done/completed" (maps to Recently completed column) */
  done: string[]
  /** States/tags that mean "back in development" (maps to Needs follow-up column) */
  development: string[]
  /** States/tags that mean "newly added / triage" (maps to Newly added column) */
  new: string[]
}

/**
 * Per-column tag classifiers. A work item carrying any of these tags is routed to the matching
 * column, taking precedence over state-based classification. Precedence between columns follows
 * the field order below (testing → done → development → new); the first matching column wins.
 */
export type QaTagGroups = {
  /** Tags that route an item to the Ready for QA column. */
  testing: string[]
  /** Tags that route an item to the Recently completed column. */
  done: string[]
  /** Tags that route an item to the Needs follow-up column. */
  development: string[]
  /** Tags that route an item to the Newly added column. */
  new: string[]
}

/**
 * Built-in default tag classifiers. "Triage" routes to Newly added out of the box.
 * Used when QaOptions.tagGroups is null (the user has not customized the tag groups).
 */
export const DEFAULT_QA_TAG_GROUPS: QaTagGroups = {
  testing: [],
  done: [],
  development: [],
  new: ['Triage'],
}

/**
 * Sprint (iteration) filter. Relative flags resolve against the live iteration list at query
 * time (so "current" always tracks the team's current sprint). Explicit iterationPaths come from
 * the registered-sprints dropdown. When nothing is selected, all sprints are shown.
 */
export type QaSprintFilter = {
  /** Include the team's current sprint. */
  current: boolean
  /** Include the sprint after current (current + 1). */
  next: boolean
  /** Include the sprint two after current (current + 2). */
  nextNext: boolean
  /** Explicit iteration paths selected from the registered-sprints dropdown. */
  iterationPaths: string[]
}

export type QaOptions = {
  generalFilters: QaFilterRule[]
  /** Allow-list of work item types to display. Empty = show all types. */
  includeWorkItemTypes: string[]
  /** Sprint filter. When no relative flags and no explicit paths, all sprints are shown. */
  sprintFilter: QaSprintFilter
  /** When set, overrides the built-in project state group defaults */
  stateGroups: QaStateGroupOverrides | null
  /** Per-column tag classifiers. null = use DEFAULT_QA_TAG_GROUPS (Triage → Newly added). */
  tagGroups: QaTagGroups | null
}

export const EMPTY_SPRINT_FILTER: QaSprintFilter = {
  current: false,
  next: false,
  nextNext: false,
  iterationPaths: [],
}

export function hasActiveSprintFilter(sprintFilter: QaSprintFilter): boolean {
  return (
    sprintFilter.current ||
    sprintFilter.next ||
    sprintFilter.nextNext ||
    sprintFilter.iterationPaths.length > 0
  )
}

export const QA_OPTIONS_STORAGE_KEY_PREFIX = 'standup:qa-options'

export function qaOptionsStorageKey(teamId: string): string {
  return `${QA_OPTIONS_STORAGE_KEY_PREFIX}:${teamId}`
}

// Keep the legacy key for migration
export const QA_OPTIONS_STORAGE_KEY = QA_OPTIONS_STORAGE_KEY_PREFIX

export function createQaFilterRule(type: QaFilterRuleType): QaFilterRule {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  if (type === 'work-item-type') {
    return { id, type: 'work-item-type', workItemType: '' }
  }
  return { id, type: 'tag', tagMatch: '' }
}

export function createTagFilterRule(tagMatch: string): QaTagFilterRule {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return { id, type: 'tag', tagMatch }
}

function isQaFilterRuleType(value: unknown): value is QaFilterRuleType {
  return value === 'work-item-type' || value === 'tag'
}

function parseRule(entry: unknown): QaFilterRule | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null
  }

  const candidate = entry as Record<string, unknown>
  const id = typeof candidate.id === 'string' && candidate.id
    ? candidate.id
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  if (!isQaFilterRuleType(candidate.type)) {
    return null
  }

  if (candidate.type === 'work-item-type') {
    return {
      id,
      type: 'work-item-type',
      workItemType: typeof candidate.workItemType === 'string' ? candidate.workItemType : '',
    }
  }

  return {
    id,
    type: 'tag',
    tagMatch: typeof candidate.tagMatch === 'string' ? candidate.tagMatch : '',
  }
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function parseStateGroups(value: unknown): QaStateGroupOverrides | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  return {
    testing: parseStringArray(obj.testing),
    done: parseStringArray(obj.done),
    development: parseStringArray(obj.development),
    new: parseStringArray(obj.new),
  }
}

function parseSprintFilter(value: unknown): QaSprintFilter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...EMPTY_SPRINT_FILTER }
  }
  const obj = value as Record<string, unknown>
  return {
    current: obj.current === true,
    next: obj.next === true,
    nextNext: obj.nextNext === true,
    iterationPaths: parseStringArray(obj.iterationPaths),
  }
}

function parseTagGroups(value: unknown): QaTagGroups | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const obj = value as Record<string, unknown>
  return {
    testing: parseStringArray(obj.testing),
    done: parseStringArray(obj.done),
    development: parseStringArray(obj.development),
    new: parseStringArray(obj.new),
  }
}

export function parseStoredQaOptions(value: string | null): QaOptions {
  const empty: QaOptions = {
    generalFilters: [],
    includeWorkItemTypes: [],
    sprintFilter: { ...EMPTY_SPRINT_FILTER },
    stateGroups: null,
    tagGroups: null,
  }

  if (!value) {
    return empty
  }

  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return empty
    }

    // General filters are now tag-only; drop any legacy work-item-type exclusion rules,
    // which have been superseded by the includeWorkItemTypes allow-list.
    const generalFilters: QaFilterRule[] = Array.isArray(parsed.generalFilters)
      ? parsed.generalFilters.flatMap((entry: unknown) => {
          const rule = parseRule(entry)
          return rule && rule.type === 'tag' ? [rule] : []
        })
      : []

    return {
      generalFilters,
      includeWorkItemTypes: parseStringArray(parsed.includeWorkItemTypes),
      sprintFilter: parseSprintFilter(parsed.sprintFilter),
      stateGroups: parseStateGroups(parsed.stateGroups),
      tagGroups: parseTagGroups(parsed.tagGroups),
    }
  } catch {
    return empty
  }
}

export function serializeQaOptions(options: QaOptions): string {
  return JSON.stringify(options)
}

export function applyQaGeneralFilters<T extends { workItemType?: string; tags?: string[] }>(
  items: T[],
  rules: QaFilterRule[],
): T[] {
  if (rules.length === 0) {
    return items
  }

  return items.filter((item) => {
    for (const rule of rules) {
      if (rule.type === 'work-item-type') {
        const ruleValue = rule.workItemType.trim().toLowerCase()
        if (ruleValue && item.workItemType?.toLowerCase() === ruleValue) {
          return false
        }
      } else {
        const ruleValue = rule.tagMatch.trim().toLowerCase()
        if (ruleValue && (item.tags ?? []).some((tag) => tag.toLowerCase().includes(ruleValue))) {
          return false
        }
      }
    }
    return true
  })
}

/**
 * Resolves a sprint filter into the concrete set of iteration paths to query.
 * Relative flags (current / +1 / +2) are resolved against the live, chronologically-ordered
 * iteration list by locating the current sprint (falling back to the first future sprint).
 * Explicit selections are unioned in. Returns an empty array when no filter is active or when
 * nothing resolves (caller treats empty as "show all sprints").
 */
export function resolveSelectedIterationPaths(
  sprintFilter: QaSprintFilter,
  iterations: TeamIterationOption[],
): string[] {
  if (!hasActiveSprintFilter(sprintFilter)) {
    return []
  }

  const selected = new Set<string>()

  if (sprintFilter.current || sprintFilter.next || sprintFilter.nextNext) {
    let currentIndex = iterations.findIndex((iteration) => iteration.timeFrame === 'current')
    if (currentIndex === -1) {
      currentIndex = iterations.findIndex((iteration) => iteration.timeFrame === 'future')
    }

    if (currentIndex !== -1) {
      if (sprintFilter.current && iterations[currentIndex]) {
        selected.add(iterations[currentIndex].path)
      }
      if (sprintFilter.next && iterations[currentIndex + 1]) {
        selected.add(iterations[currentIndex + 1].path)
      }
      if (sprintFilter.nextNext && iterations[currentIndex + 2]) {
        selected.add(iterations[currentIndex + 2].path)
      }
    }
  }

  const knownPaths = new Set(iterations.map((iteration) => iteration.path))
  for (const path of sprintFilter.iterationPaths) {
    if (knownPaths.has(path)) {
      selected.add(path)
    }
  }

  return Array.from(selected)
}

