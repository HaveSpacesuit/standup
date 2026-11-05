import type { SxProps, Theme } from '@mui/material/styles'
import svgError from '@stratakit/icons/error.svg'
import svgGitMerge from '@stratakit/icons/git-merge.svg'
import svgInspection from '@stratakit/icons/inspection.svg'
import svgLock from '@stratakit/icons/lock.svg'
import svgStatusRejected from '@stratakit/icons/status-rejected.svg'
import svgStopwatch from '@stratakit/icons/stopwatch.svg'
import svgUserEdit from '@stratakit/icons/user-edit.svg'
import svgUsers from '@stratakit/icons/users.svg'
import svgValidate from '@stratakit/icons/validate.svg'
import { toIdentityKeys, type IdentityRef } from '../../../ado/identity'
import type { WorkItemPullRequestSummary, WorkItemSummary } from '../../../ado/queryEngine'
import type { CardChangeDetail } from '../hooks/useAdoHistoryHighlights'
import { getJourneyCaption, type JourneyCaption, type SprintJourney } from '../utils/sprintJourney'
import { formatDayCount } from '../utils/sprintDates'
import { getChecksPresentation } from './pullRequestChecksPresentation'
import { abbreviateState } from './workItemCardDisplay'
import type { WorkItemCardHighlightState } from './WorkItemCard'

export const REQUIRED_APPROVALS = 2
export const TERTIARY_TEXT_COLOR = 'var(--stratakit-color-text-neutral-tertiary)'

// MUI's sx reads a bare 1 as 100%, so the 1px sizes must be strings.
export const visuallyHiddenSx: SxProps<Theme> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}

export type CardTone = 'critical' | 'attention' | 'positive' | 'neutral'

const DEFAULT_COLUMN_STATES: Record<WorkItemSummary['status'], ReadonlySet<string>> = {
  Blocked: new Set(['on hold', 'inactive', 'design', 'in planning']),
  New: new Set(['new']),
  Active: new Set(['in progress', 'active', 'committed']),
  Review: new Set(['in code review']),
  Done: new Set(['done', 'closed', 'completed']),
}

export function normalizeStateName(state: string | undefined): string {
  return (state ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** True when the state is what the card's column already implies, so the card need not repeat it. */
export function isDefaultColumnState(status: WorkItemSummary['status'], state: string | undefined): boolean {
  const normalized = normalizeStateName(state)
  return !normalized || DEFAULT_COLUMN_STATES[status].has(normalized)
}

/** Outlined badge color for a state that differs from its column default. */
export function getStateBadgeColor(state: string | undefined): 'error' | 'info' | 'secondary' {
  switch (normalizeStateName(state)) {
    case 'failed testing':
      return 'error'
    case 'available for testing':
      return 'info'
    default:
      return 'secondary'
  }
}

/** The sprint is only worth showing when it is not the current sprint (or the current sprint is unknown). */
export function shouldShowSprint(sprintName: string | undefined, currentIterationName: string | null | undefined): boolean {
  if (!sprintName) {
    return false
  }

  return !currentIterationName || sprintName !== currentIterationName
}

export function getToneColor(tone: CardTone): string {
  switch (tone) {
    case 'critical':
      return 'error.main'
    case 'attention':
      return 'warning.main'
    case 'positive':
      return 'success.main'
    case 'neutral':
      return 'text.secondary'
  }
}

function formatCheckNames(checks: NonNullable<WorkItemPullRequestSummary['checks']>['checks']): string {
  return checks.map((check) => (check.expired ? `${check.name} (expired)` : check.name)).join(', ')
}

export type QuietChecksSummary = {
  tone: CardTone
  iconHref: string
  /** Full checks description, including optional checks, for the tooltip. */
  label: string
  /** Short line shown under the PR only when a required check needs attention. */
  detail?: string
}

export function getQuietChecksSummary(checks: WorkItemPullRequestSummary['checks']): QuietChecksSummary {
  const presentation = getChecksPresentation(checks)
  const label = [presentation.text ?? 'Required checks passing', ...presentation.optionalItems.map((item) => item.text)].join(' · ')

  if (!checks || checks.state === 'unavailable') {
    return { tone: 'attention', iconHref: svgError, label, detail: presentation.text }
  }

  const required = checks.checks.filter((check) => !check.optional)
  const failing = required.filter((check) => check.state === 'failing')
  if (failing.length > 0) {
    return { tone: 'critical', iconHref: svgError, label, detail: `${formatCheckNames(failing)} failing` }
  }

  const pending = required.filter((check) => check.state === 'pending')
  if (pending.length > 0) {
    return { tone: 'attention', iconHref: svgStopwatch, label, detail: `${formatCheckNames(pending)} pending` }
  }

  const hasApplicableChecks = checks.state !== 'none' && checks.checks.some((check) => check.state !== 'skipped')
  return { tone: hasApplicableChecks ? 'positive' : 'neutral', iconHref: svgValidate, label }
}

export type ApprovalSummary = {
  tone: CardTone
  text: string
  label: string
  showUsersIcon: boolean
}

export function getApprovalSummary(pullRequest: Pick<WorkItemPullRequestSummary, 'approvalCount' | 'reviewState'>): ApprovalSummary {
  if (pullRequest.reviewState === 'rejected') {
    return { tone: 'critical', text: 'Rejected', label: 'Rejected', showUsersIcon: false }
  }

  if (pullRequest.reviewState === 'waiting-for-author') {
    return { tone: 'attention', text: 'Waiting', label: 'Reviewer is waiting on the author', showUsersIcon: false }
  }

  const approvals = pullRequest.approvalCount ?? 0
  return {
    tone: approvals >= REQUIRED_APPROVALS ? 'positive' : 'neutral',
    text: `${Math.min(approvals, 9)}/${REQUIRED_APPROVALS}`,
    label: `${approvals} of ${REQUIRED_APPROVALS} approvals`,
    showUsersIcon: true,
  }
}

/** Compact age such as "3h" or "2d"; empty when the timestamp is missing or invalid. */
export function formatShortAge(value: string | undefined, now = Date.now()): string {
  const at = value ? Date.parse(value) : Number.NaN
  if (Number.isNaN(at)) {
    return ''
  }

  const hours = Math.floor(Math.max(now - at, 0) / (60 * 60 * 1000))
  if (hours === 0) {
    return 'now'
  }

  if (hours < 24) {
    return `${hours}h`
  }

  const days = Math.floor(hours / 24)
  return formatDayCount(days)
}

export type StepOwner =
  | { kind: 'pipeline' }
  | { kind: 'reviewers' }
  | { kind: 'person'; identity: IdentityRef }

export type NextStep = {
  tone: CardTone
  iconHref: string
  text: string
  /** Extra detail for the step's tooltip, e.g. the full checks description. */
  tooltip?: string
  /** Who the card is waiting on, when that is someone other than the row's developer. */
  owner?: StepOwner
  /** True when the step already says what the state badge would, so the badge can be dropped. */
  coversState?: boolean
}

export function isPullRequestClosed(pullRequest: Pick<WorkItemPullRequestSummary, 'status'>): boolean {
  const status = pullRequest.status?.trim().toLowerCase()
  return status === 'completed' || status === 'abandoned'
}

/** The single most important thing that has to happen before the PR can complete, or null once it is closed. */
export function getPullRequestNextStep(pullRequest: WorkItemPullRequestSummary): NextStep | null {
  if (isPullRequestClosed(pullRequest)) {
    return null
  }

  const { checks } = pullRequest
  const checksLabel = getQuietChecksSummary(checks).label
  const required = checks?.checks.filter((check) => !check.optional) ?? []
  const failing = required.filter((check) => check.state === 'failing')
  if (failing.length > 0) {
    return {
      tone: 'critical',
      iconHref: svgError,
      text: `Fix failing check${failing.length > 1 ? 's' : ''}: ${formatCheckNames(failing)}`,
      tooltip: checksLabel,
    }
  }

  if (pullRequest.reviewState === 'rejected') {
    return { tone: 'critical', iconHref: svgStatusRejected, text: 'Rejected — rework needed' }
  }

  if (pullRequest.reviewState === 'waiting-for-author') {
    return { tone: 'attention', iconHref: svgUserEdit, text: 'Respond to review feedback' }
  }

  if (!checks || checks.state === 'unavailable') {
    return { tone: 'attention', iconHref: svgError, text: 'Checks unavailable', tooltip: checksLabel }
  }

  const pending = required.filter((check) => check.state === 'pending')
  if (pending.length > 0) {
    return {
      tone: 'neutral',
      iconHref: svgStopwatch,
      text: `Waiting on ${formatCheckNames(pending)}`,
      tooltip: checksLabel,
      owner: { kind: 'pipeline' },
    }
  }

  const needed = REQUIRED_APPROVALS - (pullRequest.approvalCount ?? 0)
  if (needed > 0) {
    return {
      tone: 'neutral',
      iconHref: svgUsers,
      text: needed === 1 ? 'Needs 1 more approval' : `Needs ${needed} approvals`,
      owner: { kind: 'reviewers' },
    }
  }

  return { tone: 'positive', iconHref: svgGitMerge, text: 'Ready to complete', tooltip: checksLabel }
}

export function findBlockedTag(tags: readonly string[] | undefined): string | undefined {
  return tags?.find((tag) => /blocked/i.test(tag))
}

const LEADING_SEPARATORS = /^[\s:;,.|/\\()[\]{}\-–—]+/
const TRAILING_SEPARATORS = /[\s:;,.|/\\\-–—]+$/
const BRACKET_PAIRS = [['(', ')'], ['[', ']'], ['{', '}']] as const

/** "Blocked - waiting on IMS" becomes "waiting on IMS"; a bare "Blocked" tag has no reason. */
export function getBlockedReason(tag: string): string {
  let reason = tag.replace(/blocked/i, ' ').replace(LEADING_SEPARATORS, '').replace(TRAILING_SEPARATORS, '')
  // "Blocked (waiting on IMS)" leaves a closing bracket whose opener was stripped.
  for (const [open, close] of BRACKET_PAIRS) {
    if (reason.endsWith(close) && !reason.includes(open)) {
      reason = reason.slice(0, -1).replace(TRAILING_SEPARATORS, '')
    }
  }

  return reason.trim()
}

function isSamePerson(left: IdentityRef, right: IdentityRef): boolean {
  const leftKeys = new Set(toIdentityKeys(left))
  return toIdentityKeys(right).some((key) => leftKeys.has(key))
}

const IN_TESTING_STEP = 'In testing'
const ASSIGNMENT_CHANGES = new Set(['Assigned', 'Reassigned'])

/**
 * The card's last change in its row's terms: a tester taking a card that stays in its developer's
 * row reads "Tester assigned", not as though the card moved between developers.
 */
export function getCardChangeForStep(detail: CardChangeDetail | undefined, cardStep: NextStep | null): CardChangeDetail | undefined {
  if (cardStep?.text !== IN_TESTING_STEP || !detail?.reason || !ASSIGNMENT_CHANGES.has(detail.reason)) {
    return detail
  }

  return { ...detail, reason: 'Tester assigned' }
}

/** A card-level step for work items whose next move does not depend on a PR. */
export function getCardNextStep(item: WorkItemSummary, rowMember?: IdentityRef | null): NextStep | null {
  if (item.kind === 'pull-request') {
    return null
  }

  if (item.status === 'Blocked') {
    const tagReason = getBlockedReason(findBlockedTag(item.tags) ?? '')
    const stateReason = item.state && isDefaultColumnState('Blocked', item.state) ? item.state.trim() : ''
    return { tone: 'critical', iconHref: svgLock, text: `Blocked · ${tagReason || stateReason || 'no reason given'}` }
  }

  const state = normalizeStateName(item.state)
  if (state === 'failed testing') {
    return { tone: 'critical', iconHref: svgStatusRejected, text: 'Failed testing', coversState: true }
  }

  if (item.status === 'Review' && rowMember && item.assignedTo && !isSamePerson(item.assignedTo, rowMember)) {
    const inTesting = state.includes('test')
    return {
      tone: 'neutral',
      iconHref: svgInspection,
      text: inTesting ? IN_TESTING_STEP : 'Handed off',
      coversState: inTesting,
      owner: { kind: 'person', identity: item.assignedTo },
    }
  }

  return null
}

export type ProgressSegmentState = 'empty' | 'critical' | 'attention' | 'pending' | 'positive'

export type PullRequestProgress = {
  checks: { state: ProgressSegmentState; label: string }
  /** Fill is 0-1 of the required approvals; rejected and waiting fill the whole segment. */
  review: { state: ProgressSegmentState; fill: number; label: string }
  ready: boolean
  label: string
}

/** Three-segment summary of a PR's path to completion: checks, review, then ready to complete. */
export function getPullRequestProgress(pullRequest: WorkItemPullRequestSummary): PullRequestProgress {
  const { checks } = pullRequest
  const checksSummary = getQuietChecksSummary(checks)
  const required = checks?.checks.filter((check) => !check.optional) ?? []
  const checksUnavailable = !checks || checks.state === 'unavailable'
  const checksState: ProgressSegmentState = checksUnavailable
    ? 'empty'
    : required.some((check) => check.state === 'failing')
      ? 'critical'
      : required.some((check) => check.state === 'pending')
        ? 'pending'
        : checksSummary.tone === 'positive'
          ? 'positive'
          : 'empty'

  const approvals = getApprovalSummary(pullRequest)
  const approvalCount = pullRequest.approvalCount ?? 0
  const review = pullRequest.reviewState === 'rejected'
    ? { state: 'critical' as const, fill: 1, label: approvals.label }
    : pullRequest.reviewState === 'waiting-for-author'
      ? { state: 'attention' as const, fill: 1, label: approvals.label }
      : { state: 'positive' as const, fill: Math.min(approvalCount, REQUIRED_APPROVALS) / REQUIRED_APPROVALS, label: approvals.label }

  const ready = !isPullRequestClosed(pullRequest)
    && !checksUnavailable
    && checksState !== 'critical'
    && checksState !== 'pending'
    && review.state === 'positive'
    && approvalCount >= REQUIRED_APPROVALS

  return {
    checks: { state: checksState, label: checksSummary.label },
    review,
    ready,
    label: `PR ${pullRequest.id}. ${checksSummary.label}. ${approvals.label}. ${ready ? 'Ready to complete' : 'Not ready to complete'}.`,
  }
}

const AGING_COLUMNS: ReadonlySet<string> = new Set(['Blocked', 'Active', 'Review'])

export type AgingDots = {
  count: number
  tone: CardTone
  label: string
}

/** Aging dots belong to in-flight columns only; New and Done cards are expected to sit still. */
export function getAgingDots(status: string, detail: CardChangeDetail | undefined): AgingDots | null {
  if (!detail || !AGING_COLUMNS.has(status) || detail.agingLevel <= 0) {
    return null
  }

  const count = Math.min(detail.agingLevel, 4)
  const days = `${detail.idleDays} ${detail.idleDays === 1 ? 'day' : 'days'}`
  return {
    count,
    tone: count >= 4 ? 'critical' : count === 3 ? 'attention' : 'neutral',
    label: count >= 4 ? `Stale: unchanged for ${days}` : `Unchanged for ${days}`,
  }
}

/** "Moved to Done · 3h" for a recently changed card; null when the change is unknown. */
export function getChangeBadgeText(detail: CardChangeDetail | undefined, now = Date.now(), abbreviate = true): string | null {
  if (!detail?.reason) {
    return null
  }

  const statePrefix = 'Moved to '
  const reason = abbreviate && detail.reason.startsWith(statePrefix)
    ? `${statePrefix}${abbreviateState(detail.reason.slice(statePrefix.length))}`
    : detail.reason
  const age = formatShortAge(detail.changedAt, now)
  if (!age) {
    return reason
  }
  return `${reason} · ${age === 'now' ? 'just now' : age}`
}

/** "Completed" or "Abandoned" for a closed PR; empty while it is open. */
export function getClosedPullRequestLabel(pullRequest: Pick<WorkItemPullRequestSummary, 'status'>): string {
  if (!isPullRequestClosed(pullRequest) || !pullRequest.status) {
    return ''
  }

  const status = pullRequest.status.trim().toLowerCase()
  return status.charAt(0).toUpperCase() + status.slice(1)
}

/** Where a PR stands in one phrase: its next step while open, or how it closed. */
export function getPullRequestStatusText(pullRequest: WorkItemPullRequestSummary): string {
  return getPullRequestNextStep(pullRequest)?.text ?? getClosedPullRequestLabel(pullRequest)
}

const TONE_URGENCY: Record<CardTone, number> = { critical: 0, attention: 1, neutral: 2, positive: 3 }

/** The compact card's one step: the card's own step, else the most urgent next step of its open PRs. */
export function getCompactCardStep(
  model: Pick<DevelopmentCardModel, 'cardStep' | 'pullRequestOnly' | 'linkedPullRequests'>,
): NextStep | null {
  if (model.cardStep) {
    return model.cardStep
  }

  let urgent: NextStep | null = null
  for (const pullRequest of model.pullRequestOnly ? [model.pullRequestOnly] : model.linkedPullRequests) {
    const step = getPullRequestNextStep(pullRequest)
    if (step && (!urgent || TONE_URGENCY[step.tone] < TONE_URGENCY[urgent.tone])) {
      urgent = step
    }
  }

  return urgent
}

/** "Moved to Review · 3 days ago" for a card's hover details; null when its history is unknown. */
export function getLastChangeText(detail: CardChangeDetail | undefined, now = Date.now()): string | null {
  if (!detail) {
    return null
  }

  let when: string
  if (detail.idleDays >= 1) {
    when = detail.idleDays === 1 ? '1 day ago' : `${detail.idleDays} days ago`
  } else {
    const age = formatShortAge(detail.changedAt, now)
    when = !age ? 'today' : age === 'now' ? 'just now' : `${age} ago`
  }

  return detail.reason ? `${detail.reason} · ${when}` : when.charAt(0).toUpperCase() + when.slice(1)
}

export type DevelopmentCardModelInput = {
  item: WorkItemSummary
  highlightState: WorkItemCardHighlightState
  changeDetail?: CardChangeDetail
  currentIterationName: string | null
  rowMember: IdentityRef | null
  showRolloverIndicator: boolean
  expectedStateNames?: readonly string[]
  /** The card's sprint journey; when set, its caption replaces the aging dots. */
  journey?: SprintJourney
  /**
   * Shows the card as it stood at this moment, for replaying the sprint: its journey caption is
   * measured from then, and live details the card had no history for (pull requests, next step,
   * state, tags, changes, sprint) are left out.
   */
  asOf?: number
}

/** What a Development card shows, shared by its regular, compact, and hover-card layouts. */
export type DevelopmentCardModel = {
  /** Set when the card is a pull request with no linked work item. */
  pullRequestOnly?: WorkItemPullRequestSummary
  /** PRs linked to the work item; empty for PR-only cards. */
  linkedPullRequests: WorkItemPullRequestSummary[]
  spansRepositories: boolean
  cardStep: NextStep | null
  tags: string[]
  isNew: boolean
  isFaded: boolean
  showEffort: boolean
  showStateBadge: boolean
  showSprint: boolean
  showRollover: boolean
  /** The card's last change, worded for its row; see getCardChangeForStep. */
  changeDetail?: CardChangeDetail
  changeBadgeText: string | null
  changeBadgeFullText: string | null
  agingDots: AgingDots | null
  journeyCaption: JourneyCaption | null
  titleUrl?: string
  titleText: string
  displayId: number
}

export function getDevelopmentCardModel({
  item,
  highlightState,
  changeDetail,
  currentIterationName,
  rowMember,
  showRolloverIndicator,
  expectedStateNames,
  journey,
  asOf,
}: DevelopmentCardModelInput): DevelopmentCardModel {
  const historical = asOf !== undefined
  const pullRequestOnly = item.kind === 'pull-request' ? item.pullRequest : undefined
  const linkedPullRequests = pullRequestOnly || historical ? [] : (item.activePullRequests ?? [])
  const cardStep = historical ? null : getCardNextStep(item, rowMember)
  const shownChange = getCardChangeForStep(changeDetail, cardStep)
  // A blocked card's step line already carries the reason from its blocked tag.
  const hiddenTag = item.status === 'Blocked' && cardStep ? findBlockedTag(item.tags) : undefined
  const isNew = !historical && highlightState === 'new'
  const now = asOf ?? Date.now()
  const journeyCaption = journey && !pullRequestOnly
    // A rejected step already says the card was sent back.
    ? getJourneyCaption(journey, now, { skipBack: cardStep?.iconHref === svgStatusRejected })
    : null

  return {
    pullRequestOnly,
    linkedPullRequests,
    spansRepositories: new Set(linkedPullRequests.map((pullRequest) => pullRequest.repositoryName)).size > 1,
    cardStep,
    tags: historical ? [] : (item.tags ?? [])
      .filter((tag) => tag !== hiddenTag)
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
    isNew,
    // Done cards are expected to sit still, so only they fade; in-flight cards show aging dots instead.
    isFaded: !historical && highlightState === 'stale' && item.status === 'Done',
    showEffort: !pullRequestOnly && typeof item.effort === 'number',
    showStateBadge: !historical
      && !pullRequestOnly
      && !expectedStateNames?.some((state) => normalizeStateName(state) === normalizeStateName(item.state))
      && !isDefaultColumnState(item.status, item.state)
      && !cardStep?.coversState,
    showSprint: !historical && !pullRequestOnly && shouldShowSprint(item.sprintName, currentIterationName),
    showRollover: !historical && !pullRequestOnly && showRolloverIndicator,
    changeDetail: shownChange,
    changeBadgeText: isNew ? getChangeBadgeText(shownChange, now) : null,
    changeBadgeFullText: isNew ? getChangeBadgeText(shownChange, now, false) : null,
    agingDots: journeyCaption || historical ? null : getAgingDots(item.status, shownChange),
    journeyCaption,
    titleUrl: pullRequestOnly ? pullRequestOnly.url : item.workItemUrl,
    titleText: pullRequestOnly ? pullRequestOnly.title : item.title,
    displayId: pullRequestOnly ? pullRequestOnly.id : item.id,
  }
}
