import { normalizeQuickFilterText } from './boardFilters'
import {
  formatAssignee,
  formatBacklogValue,
  formatCreatedDate,
  formatIterationPath,
  type RankedBacklogBug,
} from './backlogValue'

function shown(value: string | number | undefined): string {
  return value === undefined ? '' : String(value)
}

/**
 * The text each Backlog column shows for a bug. The quick filter searches exactly these strings, so it matches
 * what is visible in the table (a shortened iteration path, the rounded Value) and never hidden detail such as the
 * full path or the Not set placeholder.
 */
export function getBacklogVisibleText(bug: RankedBacklogBug): string[] {
  return [
    String(bug.id),
    bug.title,
    formatCreatedDate(bug.createdAt),
    formatAssignee(bug.assignedTo),
    shown(bug.state),
    formatIterationPath(bug.iterationPath),
    shown(bug.severity),
    shown(bug.priority),
    shown(bug.effort),
    formatBacklogValue(bug.value),
  ]
}

/** `filterText` must already be normalized (trimmed and lower-cased). */
export function matchesBacklogQuickFilter(bug: RankedBacklogBug, filterText: string): boolean {
  if (!filterText) {
    return true
  }

  return getBacklogVisibleText(bug).some((text) => text.toLowerCase().includes(filterText))
}

/**
 * Keeps the bugs whose visible text contains the quick filter text, in their ranked order. Returns `bugs` itself
 * when nothing is excluded, so the memoized table does not re-render for a filter that changes nothing.
 */
export function filterBacklogBugs(bugs: RankedBacklogBug[], quickFilterInput: string): RankedBacklogBug[] {
  const filterText = normalizeQuickFilterText(quickFilterInput)
  if (!filterText) {
    return bugs
  }

  const matches = bugs.filter((bug) => matchesBacklogQuickFilter(bug, filterText))
  return matches.length === bugs.length ? bugs : matches
}
