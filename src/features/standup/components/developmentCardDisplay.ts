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
import { getChecksPresentation } from './pullRequestChecksPresentation'

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
  return days < 14 ? `${days}d` : `${Math.floor(days / 7)}w`
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
      text: inTesting ? 'In testing' : 'Handed off',
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
