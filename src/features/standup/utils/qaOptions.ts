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

export type QaOptions = {
  generalFilters: QaFilterRule[]
  /** Allow-list of work item types to display. Empty = show all types. */
  includeWorkItemTypes: string[]
  /** When set, overrides the built-in project state group defaults */
  stateGroups: QaStateGroupOverrides | null
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

export function parseStoredQaOptions(value: string | null): QaOptions {
  const empty: QaOptions = { generalFilters: [], includeWorkItemTypes: [], stateGroups: null }

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
      stateGroups: parseStateGroups(parsed.stateGroups),
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

