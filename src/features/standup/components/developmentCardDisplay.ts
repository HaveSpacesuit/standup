import type { SxProps, Theme } from '@mui/material/styles'
import svgError from '@stratakit/icons/error.svg'
import svgStopwatch from '@stratakit/icons/stopwatch.svg'
import svgValidate from '@stratakit/icons/validate.svg'
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
