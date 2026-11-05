import type { TeamIterationOption, TeamMember, WorkItemSummary, WorkItemUpdate } from '../../../ado/queryEngine'
import { toIdentityKeys } from '../../../ado/identity'
import { BLOCKED_RAIL_WIDTH } from '../utils/boardLayout'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import { countWorkingDays, formatDayCount, formatSprintDate } from '../utils/sprintDates'
import type { AttentionTone } from './boardAttention'

export type QaColumnId = 'new' | 'coming' | 'needs-testing' | 'needs-development' | 'done' | 'history-unavailable'
export type QaView = 'flow' | 'testers'
export type QaFacet = 'failed' | 'bounced' | 'unassigned' | 'waiting' | 'untriaged' | 'late' | 'changed'

export type ItemHistory = {
  changedAt?: string
  stateEnteredAt?: string
  reason?: string
  bounceCount: number
  sentBackBy?: WorkItemUpdate['revisedBy']
  verifiedBy?: WorkItemUpdate['revisedBy']
  readyAt?: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const TESTING_STATES = new Set(['available for testing', 'ready for testing', 'aft', 'rft'])
const DEVELOPMENT_STATES = new Set(['active', 'committed', 'failed testing', 'in progress'])
const DONE_STATES = new Set(['done', 'closed', 'completed', 'removed'])

export const COLUMN_META: Record<QaColumnId, { title: string; expectedStates: readonly string[]; status: WorkItemSummary['status'] }> = {
  new: { title: 'Newly added', expectedStates: ['New', 'Proposed'], status: 'New' },
  coming: { title: 'Coming up', expectedStates: ['In Code Review'], status: 'Review' },
  'needs-testing': { title: 'Ready for QA', expectedStates: ['Available for Testing', 'Ready for Testing', 'AFT', 'RFT'], status: 'Review' },
  'needs-development': { title: 'Back in development', expectedStates: ['Active', 'Committed', 'In Progress', 'Failed Testing'], status: 'Active' },
  done: { title: 'Recently completed', expectedStates: ['Done', 'Closed', 'Completed', 'Removed'], status: 'Done' },
  'history-unavailable': { title: 'History unavailable', expectedStates: [], status: 'Blocked' },
}

export const QA_ATTENTION_FACETS: readonly { key: QaFacet; label: string; tone: AttentionTone; description: string }[] = [
  { key: 'failed', label: 'Failed testing', tone: 'critical', description: 'Items whose current state is Failed Testing.' },
  { key: 'bounced', label: 'Bounced 2+ times', tone: 'critical', description: 'Items sent back from QA at least twice.' },
  { key: 'unassigned', label: 'Needs a tester', tone: 'attention', description: 'Ready-for-QA items without an assigned tester.' },
  { key: 'waiting', label: 'Waiting 3+ days', tone: 'attention', description: 'Items waiting in Ready for QA for three or more days.' },
  { key: 'untriaged', label: 'Untriaged 3+ days', tone: 'attention', description: 'New items without a sprint that are at least three days old.' },
  { key: 'late', label: 'Arrived late', tone: 'attention', description: 'Items that reached QA with three or fewer working days left in the sprint.' },
  { key: 'changed', label: 'Recently changed', tone: 'info', description: 'Items with a tracked QA-relevant change in the freshness window.' },
]

export function normalizeState(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : ''
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function ageDays(value: string | undefined, now: number): number | null {
  const timestamp = parseTimestamp(value)
  return timestamp === null ? null : Math.floor(Math.max(now - timestamp, 0) / DAY_MS)
}

export function getItemHistory(item: WorkItemSummary, updates: WorkItemUpdate[]): ItemHistory {
  const states: Array<{ oldState: string; newState: string; update: WorkItemUpdate }> = []
  let latestTrackedUpdate: WorkItemUpdate | undefined
  let reason: string | undefined

  for (const update of updates) {
    const fields = update.fields ?? {}
    const stateField = fields['System.State']
    if (stateField) {
      const oldState = normalizeState(stateField.oldValue)
      const newState = normalizeState(stateField.newValue)
      if (newState) states.push({ oldState, newState, update })
    }

    if (
      fields['System.State']
      || fields['System.AssignedTo']
      || fields['System.Tags']
    ) {
      latestTrackedUpdate = update
      reason = fields['System.State']
        ? `Moved to ${String(fields['System.State'].newValue ?? item.state ?? 'a new state')}`
        : fields['System.AssignedTo']
          ? 'Reassigned'
          : 'Tags changed'
    }
  }

  const currentState = normalizeState(item.state)
  const lastCurrentState = [...states].reverse().find((entry) => entry.newState === currentState)
  const readyState = [...states].reverse().find((entry) => TESTING_STATES.has(entry.newState))
  const bounces = states.filter(({ oldState, newState }) => TESTING_STATES.has(oldState) && DEVELOPMENT_STATES.has(newState))
  const latestBounce = bounces.at(-1)?.update
  const latestDone = [...states].reverse().find(({ oldState, newState }) =>
    TESTING_STATES.has(oldState) && DONE_STATES.has(newState))

  return {
    changedAt: latestTrackedUpdate?.revisedDate ?? item.recentActivityAt,
    stateEnteredAt: lastCurrentState?.update.revisedDate ?? item.recentActivityAt,
    reason,
    bounceCount: bounces.length,
    sentBackBy: latestBounce?.revisedBy,
    verifiedBy: latestDone?.update.revisedBy,
    readyAt: readyState?.update.revisedDate,
  }
}

export function matchesTester(identity: WorkItemSummary['assignedTo'] | undefined, testers: TeamMember[]): TeamMember | undefined {
  const keys = new Set(toIdentityKeys(identity))
  return testers.find((member) => toIdentityKeys(member).some((key) => keys.has(key)))
}

export function personForColumn(item: WorkItemSummary, column: QaColumnId, history: ItemHistory, testers: TeamMember[]): TeamMember | WorkItemSummary['assignedTo'] | undefined {
  if (column === 'new') return item.createdBy
  if (column === 'needs-testing') {
    const tester = matchesTester(item.assignedTo, testers)
    return tester ?? undefined
  }
  if (column === 'needs-development') return history.sentBackBy ?? item.assignedTo
  if (column === 'done') return history.verifiedBy ?? item.assignedTo
  return item.assignedTo
}

export function columnCaption(item: WorkItemSummary, column: QaColumnId, history: ItemHistory, now: number): string | undefined {
  if (column === 'new') {
    const days = ageDays(item.createdAt, now)
    return days === null ? 'Recently filed' : `Filed ${formatDayCount(days)} ago`
  }
  if (column === 'needs-testing') {
    const days = ageDays(history.stateEnteredAt, now)
    return days === null ? undefined : `${formatDayCount(days)} in ${normalizeState(item.state) === 'ready for testing' ? 'RFT' : 'AFT'}`
  }
  if (column === 'needs-development') {
    const days = ageDays(history.stateEnteredAt, now)
    return `${normalizeState(item.state) === 'failed testing' ? 'Failed testing' : 'Sent back'}${days === null ? '' : ` · ${formatDayCount(days)}`}`
  }
  if (column === 'done') {
    const timestamp = parseTimestamp(history.stateEnteredAt)
    if (normalizeState(item.state) === 'removed') {
      return timestamp === null ? 'Removed' : `Removed · ${formatSprintDate(new Date(timestamp))}`
    }
    return timestamp === null ? undefined : `Verified ${formatSprintDate(new Date(timestamp))}`
  }
  if (column === 'coming' && isLikelyToday(item)) return 'Likely today'
  return undefined
}

function isLikelyToday(item: WorkItemSummary): boolean {
  return (item.activePullRequests ?? []).some((pullRequest) => {
    if ((pullRequest.approvalCount ?? 0) < 2 || pullRequest.checks?.state !== 'passing') {
      return false
    }
    const requiredChecks = pullRequest.checks.checks.filter((check) => !check.optional)
    return requiredChecks.length > 0 && requiredChecks.every((check) => check.state === 'passing')
  })
}

export function getSignalSet(
  item: WorkItemSummary,
  column: QaColumnId,
  history: ItemHistory,
  testerMembers: TeamMember[],
  iterations: TeamIterationOption[],
  freshDays: number,
  now: number,
): Set<QaFacet> {
  const signals = new Set<QaFacet>()
  if (normalizeState(item.state) === 'failed testing') signals.add('failed')
  if (history.bounceCount >= 2) signals.add('bounced')
  if ((column === 'needs-testing' || column === 'coming') && !matchesTester(item.assignedTo, testerMembers)) signals.add('unassigned')
  if (column === 'needs-testing' && (ageDays(history.stateEnteredAt, now) ?? 0) >= 3) signals.add('waiting')
  if (column === 'new' && !item.sprintName && (ageDays(item.createdAt, now) ?? 0) >= 3) signals.add('untriaged')
  const iteration = iterations.find((candidate) => candidate.name === item.sprintName)
  const readyAt = parseTimestamp(history.readyAt)
  if (iteration?.finishDate && readyAt !== null) {
    const finish = new Date(`${iteration.finishDate}T00:00:00`)
    const readyDate = new Date(readyAt)
    if (Number.isFinite(finish.getTime()) && countWorkingDays(readyDate, finish) <= 3) signals.add('late')
  }
  const changeAge = ageDays(history.changedAt, now)
  if (changeAge !== null && changeAge <= freshDays) signals.add('changed')
  return signals
}

export function getColumnItems(buckets: QualityAssuranceBucket[], id: QaColumnId): WorkItemSummary[] {
  return buckets.find((bucket) => bucket.id === id)?.items ?? []
}

export type QaColumnState = {
  id: QaColumnId
  count: number
  /** The column is collapsed to a narrow rail. */
  rail: boolean
  /** An open column offers a Collapse button. */
  collapsible: boolean
}

/** Empty columns start as rails and Coming up can always collapse; a column someone toggled keeps that choice. */
export function getQaColumnStates(
  columnIds: readonly QaColumnId[],
  counts: Partial<Record<QaColumnId, number>>,
  open: Partial<Record<QaColumnId, boolean>>,
): QaColumnState[] {
  return columnIds.map((id) => {
    const count = counts[id] ?? 0
    return { id, count, rail: !(open[id] ?? count > 0), collapsible: id === 'coming' || count === 0 }
  })
}

type QaColumnTrack = { min: number; fr: number }

/** Ready for QA holds the work testers act on, so it gets the most room, and Recently completed the least. */
const QA_COLUMN_TRACKS: Partial<Record<QaColumnId, QaColumnTrack>> = {
  'needs-testing': { min: 320, fr: 1.45 },
  done: { min: 200, fr: 0.9 },
}
const DEFAULT_QA_COLUMN_TRACK: QaColumnTrack = { min: 220, fr: 1 }

export type QaBoardLayout = {
  gridTemplate: string
  /** Sum of the minimum track widths, so every layer of the board stays aligned. */
  minWidth: number
}

/** Grid tracks for the QA columns, after the lane column when the board has lanes. */
export function getQaBoardLayout(columns: readonly Pick<QaColumnState, 'id' | 'rail'>[], laneColumnWidth = 0): QaBoardLayout {
  const tracks = columns.map(({ id, rail }) => {
    if (rail) {
      return { template: `${BLOCKED_RAIL_WIDTH}px`, min: BLOCKED_RAIL_WIDTH }
    }
    const { min, fr } = QA_COLUMN_TRACKS[id] ?? DEFAULT_QA_COLUMN_TRACK
    return { template: `minmax(${min}px, ${fr}fr)`, min }
  })

  return {
    gridTemplate: [...(laneColumnWidth > 0 ? [`${laneColumnWidth}px`] : []), ...tracks.map((track) => track.template)].join(' '),
    minWidth: laneColumnWidth + tracks.reduce((sum, track) => sum + track.min, 0),
  }
}

function getLaneKey(identity: WorkItemSummary['assignedTo'] | undefined, testers: TeamMember[]): string {
  return matchesTester(identity, testers)?.displayName ?? (identity ? 'other' : 'none')
}

export function getItemForLane(item: WorkItemSummary, column: QaColumnId, history: ItemHistory, testers: TeamMember[]): string {
  if (column === 'coming') return matchesTester(item.assignedTo, testers)?.displayName ?? 'none'
  if (column === 'new') return getLaneKey(item.createdBy, testers)
  if (column === 'needs-testing') return getLaneKey(item.assignedTo, testers)
  if (column === 'needs-development') return getLaneKey(history.sentBackBy ?? item.assignedTo, testers)
  if (column === 'done') return getLaneKey(history.verifiedBy ?? item.assignedTo, testers)
  return getLaneKey(item.assignedTo, testers)
}
