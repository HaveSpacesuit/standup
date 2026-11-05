import { abbreviateState } from '../components/workItemCardDisplay'
import { normalizeQuickFilterText } from './boardFilters'
import {
  formatAssignee,
  formatBacklogValue,
  type RankedBacklogBug,
} from './backlogValue'

/** Shown in muted text in place of an assignee. */
export const UNASSIGNED_LABEL = 'Unassigned'

function shown(value: string | number | undefined): string {
  return value === undefined ? '' : String(value)
}

/**
 * The text each Backlog column shows for a bug; the Title column shows the title, then each tag. The quick filter
 * searches exactly these strings, so it matches what is visible in the table (the rounded Value, the sprint label)
 * and never hidden detail such as the iteration path or the Not set placeholder. A long state is shown abbreviated
 * with the full state in its tooltip, so both are listed. Age is left out: it is relative to today, so a filter on it
 * would stop matching as the bugs grow older.
 */
export function getBacklogVisibleText(bug: RankedBacklogBug): string[] {
  const state = shown(bug.state)
  const shortState = abbreviateState(state)
  return [
    String(bug.id),
    formatBacklogValue(bug.value),
    bug.title,
    ...(bug.tags ?? []),
    formatAssignee(bug.assignedTo) || UNASSIGNED_LABEL,
    shortState,
    ...(shortState === state ? [] : [state]),
    bug.sprint.label,
    shown(bug.severity),
    shown(bug.priority),
    shown(bug.effort),
  ]
}

/** "1 bug", "43 bugs", or "12 of 43 bugs" while a filter hides some. */
export function formatBacklogCount(shownCount: number, totalCount: number): string {
  if (shownCount === totalCount) {
    return `${totalCount} ${totalCount === 1 ? 'bug' : 'bugs'}`
  }

  return `${shownCount} of ${totalCount} ${totalCount === 1 ? 'bug' : 'bugs'}`
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
