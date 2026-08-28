import svgStatusPending from '@stratakit/icons/status-pending.svg'
import svgStatusRejected from '@stratakit/icons/status-rejected.svg'
import svgStatusSuccess from '@stratakit/icons/status-success.svg'
import type { WorkItemSummary } from '../../../ado/queryEngine'

export type StatusPaletteKey = 'error' | 'info' | 'primary' | 'warning' | 'success'

export type PullRequestReviewIcon = {
  href: string
  color: string
  label: string
  count?: number
}

/**
 * Compacts a work item state for display on the QA state chip: states of three or more words are
 * abbreviated to their initials (e.g. "Available for Testing" → "AFT"). Shorter states are left
 * as-is. The full state should still be shown in a tooltip.
 */
export function abbreviateState(state: string): string {
  const words = state.trim().split(/\s+/).filter(Boolean)
  if (words.length < 3) {
    return state
  }
  return words.map((word) => word.charAt(0).toUpperCase()).join('')
}

export function getStatusPaletteKey(status: WorkItemSummary['status']): StatusPaletteKey {
  switch (status) {
    case 'Blocked':
      return 'error'
    case 'New':
      return 'info'
    case 'Active':
      return 'primary'
    case 'Review':
      return 'warning'
    case 'Done':
      return 'success'
  }
}

export function getPullRequestReviewIcon(
  reviewState: 'rejected' | 'waiting-for-author' | 'partially-approved' | 'fully-approved' | undefined,
): PullRequestReviewIcon | undefined {
  switch (reviewState) {
    case 'rejected':
      return {
        href: svgStatusRejected,
        color: 'error.main',
        label: 'Rejected',
        count: 1,
      }
    case 'waiting-for-author':
      return {
        href: svgStatusPending,
        color: 'warning.main',
        label: 'Waiting on author',
        count: 1,
      }
    case 'partially-approved':
      return {
        href: svgStatusSuccess,
        color: 'success.main',
        label: '1 approved',
        count: 1,
      }
    case 'fully-approved':
      return {
        href: svgStatusSuccess,
        color: 'success.main',
        label: '2+ approved',
        count: 2,
      }
    default:
      return undefined
  }
}
