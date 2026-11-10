import type { TriageItem } from '../../../ado/types'
import { abbreviateState } from '../components/workItemCardDisplay'
import { UNASSIGNED_LABEL } from './backlogFilter'
import type { BacklogSprint, BacklogSprintResolver } from './backlogSprint'
import { formatAssignee, getSeverityDisplay } from './backlogValue'
import { normalizeQuickFilterText } from './boardFilters'
import type { TriageOptions } from './triageOptions'

/** Shown in muted text in place of an unknown creator. */
export const UNKNOWN_CREATOR_LABEL = 'Unknown'

/** The Parent column's text, such as "99: Parent feature". */
export function formatTriageParent(parent: NonNullable<TriageItem['parent']>): string {
  return `${parent.id}: ${parent.title ?? 'Details unavailable'}`
}

function shown(value: string | number | undefined): string {
  return value === undefined ? '' : String(value)
}

/**
 * The text each Triage column shows for an item, like Backlog's visible text: the type (the icon's name), the id, the
 * title, each tag, then the other columns as displayed. The quick filter searches exactly these strings, so it never
 * matches hidden detail such as the iteration path or why the item qualified. Age is left out, as on Backlog: it grows
 * as items get older, so a filter on it would stop matching.
 */
export function getTriageVisibleText(item: TriageItem, sprint: BacklogSprint): string[] {
  const shortState = abbreviateState(item.state)
  return [
    item.workItemType,
    String(item.id),
    item.title,
    ...item.tags,
    getSeverityDisplay(item.severity)?.label ?? '',
    shown(item.priority),
    shown(item.effort),
    sprint.label,
    shortState,
    ...(shortState === item.state ? [] : [item.state]),
    formatAssignee(item.assignedTo) || UNASSIGNED_LABEL,
    formatAssignee(item.createdBy) || UNKNOWN_CREATOR_LABEL,
    ...(item.parent ? [formatTriageParent(item.parent)] : []),
  ]
}

/** Keeps the items whose visible text contains the quick filter text; returns `items` itself when none are excluded. */
export function filterTriageItems(items: TriageItem[], input: string, resolveSprint: BacklogSprintResolver): TriageItem[] {
  const query = normalizeQuickFilterText(input)
  if (!query) return items
  const matches = items.filter((item) => getTriageVisibleText(item, resolveSprint(item.iterationPath))
    .some((text) => text.toLowerCase().includes(query)))
  return matches.length === items.length ? items : matches
}

const TAG_LIST_FORMAT = new Intl.ListFormat('en', { type: 'disjunction' })

/** "1 item", "5 items", or "2 of 5 items" while the quick filter hides some, like Backlog's bug count. */
export function formatTriageCount(shownCount: number, totalCount: number): string {
  const noun = totalCount === 1 ? 'item' : 'items'
  return shownCount === totalCount ? `${totalCount} ${noun}` : `${shownCount} of ${totalCount} ${noun}`
}

/** The empty queue's message, naming each enabled rule that found nothing. */
export function describeEmptyTriage(options: TriageOptions): string {
  const waiting = `waiting in their initial state${options.excludedIterationPaths.length ? ' outside the excluded iteration paths' : ''}`
  if (!options.tags.length) return `No bugs in this team's area are ${waiting}.`
  const tagged = `No unfinished work items in this team's area are tagged ${TAG_LIST_FORMAT.format(options.tags.map((tag) => `“${tag}”`))}`
  return options.includeNewBugs ? `${tagged}, and no bugs are ${waiting}.` : `${tagged}.`
}