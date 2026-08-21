import type { TeamIterationOption } from '../../../ado/types'

/**
 * A general QA filter rule. General filters are tag-based: any item carrying a tag that
 * partially matches (case-insensitive) is hidden from all columns.
 */
export type QaTagFilterRule = {
  id: string
  type: 'tag'
  /** Case-insensitive partial match against any tag on the item */
  tagMatch: string
}

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

export const DEFAULT_QA_LOOKBACK_DAYS = 21

export function normalizeQaLookbackDays(value: number | undefined | null): number {
  if (value == null || !Number.isFinite(value)) {
    return DEFAULT_QA_LOOKBACK_DAYS
  }

  const rounded = Math.round(value)
  return Math.min(365, Math.max(1, rounded))
}

export type QaOptions = {
  /** Tag-based filters: items with a matching tag are hidden from all columns. */
  generalFilters: QaTagFilterRule[]
  /** Allow-list of work item types to display. Empty = show all types. */
  includeWorkItemTypes: string[]
  /** How many days of recent activity to include in QA freshness and query windows. */
  lookbackDays: number
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

export function createTagFilterRule(tagMatch: string): QaTagFilterRule {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return { id, type: 'tag', tagMatch }
}

function parseTagRule(entry: unknown): QaTagFilterRule | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null
  }

  const candidate = entry as Record<string, unknown>
  if (candidate.type !== 'tag') {
    return null
  }

  const id = typeof candidate.id === 'string' && candidate.id
    ? candidate.id
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

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

function normalizeIterationPath(path: string): string {
  return path.trim()
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

function parseLookbackDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_QA_LOOKBACK_DAYS
  }

  return normalizeQaLookbackDays(value)
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
    lookbackDays: DEFAULT_QA_LOOKBACK_DAYS,
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

    // General filters are tag-only; parseTagRule drops any legacy work-item-type rules from
    // older stored data (those were superseded by the includeWorkItemTypes allow-list).
    const generalFilters: QaTagFilterRule[] = Array.isArray(parsed.generalFilters)
      ? parsed.generalFilters.flatMap((entry: unknown) => {
          const rule = parseTagRule(entry)
          return rule ? [rule] : []
        })
      : []

    return {
      generalFilters,
      includeWorkItemTypes: parseStringArray(parsed.includeWorkItemTypes),
      lookbackDays: parseLookbackDays(parsed.lookbackDays),
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

export function applyQaGeneralFilters<T extends { tags?: string[] }>(
  items: T[],
  rules: QaTagFilterRule[],
): T[] {
  if (rules.length === 0) {
    return items
  }

  return items.filter((item) => {
    for (const rule of rules) {
      const ruleValue = rule.tagMatch.trim().toLowerCase()
      if (ruleValue && (item.tags ?? []).some((tag) => tag.toLowerCase().includes(ruleValue))) {
        return false
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

  for (const path of sprintFilter.iterationPaths) {
    const normalizedPath = normalizeIterationPath(path)
    if (normalizedPath) {
      selected.add(normalizedPath)
    }
  }

  return Array.from(selected)
}
