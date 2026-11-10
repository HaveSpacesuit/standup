import type { IdentityRef } from '../../../ado/identity'
import type { TriageEvent, TriageItem } from '../../../ado/types'
import { getTriageAge } from './triageDisplay'
import type { TriageReadinessChecks } from './triageOptions'
import { getTriageReadiness, getTriageReasonDetails, hasTriageChecks } from './triageRules'

/** How the item arrived in triage: filed straight in, tagged later, or moved back into its first state later. */
export type TriageEntry = TriageEvent & { kind: 'filed' | 'tagged' | 'moved'; tag?: string }

const HOUR_MS = 3_600_000

function toTime(at: string | undefined): number | undefined {
  const time = at ? Date.parse(at) : Number.NaN
  return Number.isNaN(time) ? undefined : time
}

/**
 * When the item entered triage: the earliest time a rule it meets now began to apply. A tag rule starts when the tag was
 * last added, and the new-bug rule when the bug last moved into its first state. Within an hour of creation, or without
 * history, the item counts as filed straight into triage.
 */
export function getTriageEntry(item: TriageItem): TriageEntry | undefined {
  const created = toTime(item.createdAt)
  const starts = getTriageReasonDetails(item).flatMap((reason): TriageEntry[] => {
    const event = reason.kind === 'tag' ? item.history?.tagsAdded[reason.tag.toLowerCase()] : item.history?.stateSince
    if (!event || toTime(event.at) === undefined) return []
    return [reason.kind === 'tag' ? { ...event, kind: 'tagged', tag: reason.tag } : { ...event, kind: 'moved' }]
  })
  const earliest = starts.sort((a, b) => toTime(a.at)! - toTime(b.at)!)[0]
  if (created !== undefined && (!earliest || toTime(earliest.at)! - created <= HOUR_MS)) {
    return { at: item.createdAt!, by: item.createdBy, kind: 'filed' }
  }
  return earliest
}

function sameIdentity(a: IdentityRef | undefined, b: IdentityRef | undefined): boolean {
  if (a?.uniqueName && b?.uniqueName) return a.uniqueName.toLowerCase() === b.uniqueName.toLowerCase()
  return Boolean(a?.displayName && a.displayName === b?.displayName)
}

export type TriageWaiting = {
  /** The item's waiting tags, as spelled on the item. */
  tags: string[]
  /** When the first of them was added; missing without history. */
  since?: TriageEvent
  /** The newest comment, when someone other than whoever added the tag wrote it after the tag was added. */
  reply?: TriageEvent & { text: string }
}

/** Whether the item is waiting on someone else, from its waiting tags, and whether they have replied since. */
export function getTriageWaiting(item: TriageItem, waitingTags: readonly string[]): TriageWaiting | undefined {
  const wanted = new Set(waitingTags.map((tag) => tag.toLowerCase()))
  const tags = item.tags.filter((tag) => wanted.has(tag.toLowerCase()))
  if (!tags.length) return undefined
  const since = tags
    .flatMap((tag) => item.history?.tagsAdded[tag.toLowerCase()] ?? [])
    .sort((a, b) => (toTime(a.at) ?? 0) - (toTime(b.at) ?? 0))[0]
  const comment = item.latestComment
  const replied = since && comment && (toTime(comment.at) ?? 0) > (toTime(since.at) ?? Infinity) && !sameIdentity(comment.by, since.by)
  return { tags, since, reply: replied ? comment : undefined }
}

/** The item's age in triage, counted from when it entered; never flagged while it waits on someone else. */
export function getTriageItemAge(item: TriageItem, flagDays: number, waitingTags: readonly string[], now = new Date()) {
  const age = getTriageAge(getTriageEntry(item)?.at, flagDays, now)
  return age && getTriageWaiting(item, waitingTags) ? { ...age, flagged: false } : age
}

export type TriageInboxGroupKey = 'new' | 'todo' | 'waiting'
export type TriageInboxGroup = { key: TriageInboxGroupKey; items: TriageItem[] }

/**
 * The Inbox's groups, each longest in triage first: items that arrived since `lastVisit`, the rest still to triage, then
 * items waiting on others. Empty groups are left out, and with no earlier visit nothing counts as new.
 */
export function groupTriageInbox(items: readonly TriageItem[], waitingTags: readonly string[], lastVisit: number | null): TriageInboxGroup[] {
  const entered = new Map(items.map((item) => [item.id, toTime(getTriageEntry(item)?.at) ?? Infinity]))
  const sorted = [...items].sort((a, b) => (entered.get(a.id)! - entered.get(b.id)!) || a.id - b.id)
  const groups: Record<TriageInboxGroupKey, TriageItem[]> = { new: [], todo: [], waiting: [] }
  for (const item of sorted) {
    const key = getTriageWaiting(item, waitingTags) ? 'waiting'
      : lastVisit !== null && entered.get(item.id)! > lastVisit && entered.get(item.id)! !== Infinity ? 'new' : 'todo'
    groups[key].push(item)
  }
  return (['new', 'todo', 'waiting'] as const).flatMap((key) => groups[key].length ? [{ key, items: groups[key] }] : [])
}

export type TriageInboxSummary = {
  total: number
  newCount: number
  /** Undefined while no type has readiness checks. */
  ready?: number
  waiting: number
  /** Not waiting, and in triage `ageFlagDays` working days or more. */
  stale: number
}

export function summarizeTriageInbox(
  groups: readonly TriageInboxGroup[],
  checks: TriageReadinessChecks,
  ageFlagDays: number,
  waitingTags: readonly string[],
  now = new Date(),
): TriageInboxSummary {
  const items = groups.flatMap((group) => group.items)
  const count = (key: TriageInboxGroupKey) => groups.find((group) => group.key === key)?.items.length ?? 0
  return {
    total: items.length,
    newCount: count('new'),
    ready: hasTriageChecks(checks) ? items.filter((item) => getTriageReadiness(item, checks).ready).length : undefined,
    waiting: count('waiting'),
    stale: items.filter((item) => getTriageItemAge(item, ageFlagDays, waitingTags, now)?.flagged).length,
  }
}

const DAY_MS = 86_400_000
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
const daysBefore = (date: Date, now: Date) => Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
const TIME_FORMAT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const WEEKDAY_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'long' })
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const DATE_YEAR_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const MOMENT_FORMAT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function formatDate(date: Date, now: Date): string {
  return (date.getFullYear() === now.getFullYear() ? DATE_FORMAT : DATE_YEAR_FORMAT).format(date)
}

/** "5m ago" and "3h ago" today, then "yesterday", the weekday within a week, and the date after that. */
export function formatTriageWhen(at: string, now = new Date()): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  const days = daysBefore(date, now)
  if (days <= 0) {
    const minutes = Math.max(Math.floor((now.getTime() - date.getTime()) / 60_000), 0)
    return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`
  }
  if (days === 1) return 'yesterday'
  return days < 7 ? WEEKDAY_FORMAT.format(date) : formatDate(date, now)
}

/** The last visit for a group heading: "9:05 AM", "yesterday 4:12 PM", "Monday 4:12 PM" or "Apr 28, 4:12 PM". */
export function formatTriageVisit(at: number, now = new Date()): string {
  const date = new Date(at)
  const days = daysBefore(date, now)
  const time = TIME_FORMAT.format(date)
  if (days <= 0) return time
  if (days === 1) return `yesterday ${time}`
  return days < 7 ? `${WEEKDAY_FORMAT.format(date)} ${time}` : `${formatDate(date, now)}, ${time}`
}

/** A full moment for tooltips, such as "Tue, Apr 28, 4:12 PM". */
export function formatTriageMoment(at: string): string {
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? '' : MOMENT_FORMAT.format(date)
}

/** The short date an item was created, such as "Apr 28", for the meta line beside a later entry. */
export function formatTriageCreated(at: string, now = new Date()): string {
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? '' : formatDate(date, now)
}
