import type { TriageItem } from '../../../ado/types'
import { abbreviateState } from '../components/workItemCardDisplay'
import { UNASSIGNED_LABEL } from './backlogFilter'
import type { BacklogSprint, BacklogSprintResolver } from './backlogSprint'
import { formatAssignee, formatCreatedDate, getSeverityDisplay } from './backlogValue'
import { normalizeQuickFilterText } from './boardFilters'
import { countWorkingDays, formatDayCount } from './sprintDates'
import type { TriageQueryOptions, TriageReadinessChecks } from './triageOptions'
import { getTriageReadiness, getTriageReasonDetails, hasTriageChecks } from './triageRules'
import { formatTriageMatchLead, type TriageMatch } from './triageSimilar'

/** Shown in muted text in place of an unknown creator. */
export const UNKNOWN_CREATOR_LABEL = 'Unknown'

/** The Readiness column's label for an item whose checks all pass. */
export const READY_TO_CLEAR_LABEL = 'Ready to clear'

/** The Readiness column's text: "Ready to clear", or the checks still missing. Empty while no type has checks. */
export function getTriageReadinessText(item: TriageItem, checks: TriageReadinessChecks): string[] {
  if (!hasTriageChecks(checks)) return []
  const readiness = getTriageReadiness(item, checks)
  return readiness.ready ? [READY_TO_CLEAR_LABEL] : readiness.missing
}

/** The item's tags without the Triage tags it matched, which the Why column names instead. */
export function getTriageTitleTags(item: Pick<TriageItem, 'reasons' | 'tags'>): string[] {
  const matched = new Set(getTriageReasonDetails(item).flatMap((reason) => reason.kind === 'tag' ? [reason.tag.toLowerCase()] : []))
  return matched.size ? item.tags.filter((tag) => !matched.has(tag.toLowerCase())) : item.tags
}

const DAY_MS = 86_400_000
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const isWeekday = (date: Date) => date.getDay() !== 0 && date.getDay() !== 6

export type TriageAge = {
  /** "Today", working days such as "3d" for the first two weeks, then "2w", "3mo" and so on. */
  label: string
  workingDays: number
  /** Whether the item has waited `flagDays` working days or more. */
  flagged: boolean
}

/**
 * How long an item has waited, in working days after the day it arrived: 0 that day, 1 the next weekday. Weekends do
 * not count, so a bug filed on Friday is 1d on Monday. After two weeks the count switches to calendar time, as on
 * Backlog, since exact days stop mattering.
 */
export function getTriageAge(since: string | undefined, flagDays: number, now = new Date()): TriageAge | undefined {
  const time = since ? Date.parse(since) : Number.NaN
  if (Number.isNaN(time)) return undefined
  const start = new Date(time)
  const calendarDays = Math.max(Math.round((startOfDay(now).getTime() - startOfDay(start).getTime()) / DAY_MS), 0)
  const workingDays = Math.max(countWorkingDays(start, now) - (isWeekday(start) ? 1 : 0), 0)
  const label = calendarDays === 0 ? 'Today' : calendarDays < 14 ? `${workingDays}d` : formatDayCount(calendarDays)
  return { label, workingDays, flagged: workingDays >= flagDays }
}

/** "In triage since Feb 2, 2026 · 3 working days". */
export function describeTriageAge(since: string, age: TriageAge): string {
  return `In triage since ${formatCreatedDate(since)} · ${age.workingDays} working ${age.workingDays === 1 ? 'day' : 'days'}`
}

/** The Parent column's text, such as "99: Parent feature". */
export function formatTriageParent(parent: NonNullable<TriageItem['parent']>): string {
  return `${parent.id}: ${parent.title ?? 'Details unavailable'}`
}

function shown(value: string | number | undefined): string {
  return value === undefined ? '' : String(value)
}

/**
 * The text each Triage column shows for an item, like Backlog's visible text: the type (the icon's name), the id, the
 * title, each tag, why the item is listed, its readiness, then the other columns as displayed, and its similar item
 * ("Possible regression of 2160021"). The quick filter searches exactly these strings, so it never matches hidden detail
 * such as the iteration path. Age is left out, as on Backlog: it grows as items get older, so a filter on it would stop
 * matching.
 */
export function getTriageVisibleText(
  item: TriageItem,
  sprint: BacklogSprint,
  checks: TriageReadinessChecks,
  match?: TriageMatch,
): string[] {
  const shortState = abbreviateState(item.state)
  return [
    item.workItemType,
    String(item.id),
    item.title,
    ...item.tags,
    ...getTriageReasonDetails(item).map((reason) => reason.label),
    ...getTriageReadinessText(item, checks),
    getSeverityDisplay(item.severity)?.label ?? '',
    shown(item.priority),
    shown(item.effort),
    sprint.label,
    shortState,
    ...(shortState === item.state ? [] : [item.state]),
    formatAssignee(item.assignedTo) || UNASSIGNED_LABEL,
    formatAssignee(item.createdBy) || UNKNOWN_CREATOR_LABEL,
    ...(item.parent ? [formatTriageParent(item.parent)] : []),
    ...(match ? [formatTriageMatchLead(match)] : []),
  ]
}

/** Keeps the items whose visible text contains the quick filter text; returns `items` itself when none are excluded. */
export function filterTriageItems(
  items: TriageItem[],
  input: string,
  resolveSprint: BacklogSprintResolver,
  checks: TriageReadinessChecks,
  similar: ReadonlyMap<number, TriageMatch> = new Map(),
): TriageItem[] {
  const query = normalizeQuickFilterText(input)
  if (!query) return items
  const kept = items.filter((item) => getTriageVisibleText(item, resolveSprint(item.iterationPath), checks, similar.get(item.id))
    .some((text) => text.toLowerCase().includes(query)))
  return kept.length === items.length ? items : kept
}

const TAG_LIST_FORMAT = new Intl.ListFormat('en', { type: 'disjunction' })

/** "1 item", "5 items", or "2 of 5 items" while the quick filter hides some, like Backlog's bug count. */
export function formatTriageCount(shownCount: number, totalCount: number): string {
  const noun = totalCount === 1 ? 'item' : 'items'
  return shownCount === totalCount ? `${totalCount} ${noun}` : `${shownCount} of ${totalCount} ${noun}`
}

/** The empty queue's message, naming each enabled rule that found nothing. */
export function describeEmptyTriage(options: TriageQueryOptions): string {
  const waiting = `waiting in their initial state${options.excludedIterationPaths.length ? ' outside the excluded iteration paths' : ''}`
  if (!options.tags.length) return `No bugs in this team's area are ${waiting}.`
  const tagged = `No unfinished work items in this team's area are tagged ${TAG_LIST_FORMAT.format(options.tags.map((tag) => `“${tag}”`))}`
  return options.includeNewBugs ? `${tagged}, and no bugs are ${waiting}.` : `${tagged}.`
}