import svgStatusPending from '@stratakit/icons/status-pending.svg'
import svgStatusRejected from '@stratakit/icons/status-rejected.svg'
import svgStatusSuccess from '@stratakit/icons/status-success.svg'
import type { WorkItemSummary } from '../../../ado/queryEngine'

export type StatusPaletteKey = 'error' | 'info' | 'primary' | 'warning' | 'success'

export type TagLayout = {
  visibleTags: string[]
  hiddenCount: number
}

export type PullRequestReviewIcon = {
  href: string
  color: string
  label: string
  count?: number
}

const TAG_ROW_UNIT_BUDGET = 34
const TAG_BASE_UNITS = 5
const TAG_PER_CHAR_UNITS = 1
const TAG_MIN_VISIBLE = 1

export function getTagBudget(sprintName?: string): number {
  return Math.max(TAG_ROW_UNIT_BUDGET - (sprintName ? 10 : 0), 16)
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

export function buildTagLayout(tags: string[], budget: number): TagLayout {
  if (tags.length === 0) {
    return { visibleTags: [], hiddenCount: 0 }
  }

  const visibleTags: string[] = []
  let usedUnits = 0

  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index]
    const tagUnits = TAG_BASE_UNITS + Math.min(tag.length, 20) * TAG_PER_CHAR_UNITS
    const remainingCount = tags.length - (index + 1)
    const reservedOverflowUnits = remainingCount > 0 ? 8 : 0
    const canFit = usedUnits + tagUnits + reservedOverflowUnits <= budget

    if (canFit || visibleTags.length < TAG_MIN_VISIBLE) {
      visibleTags.push(tag)
      usedUnits += tagUnits
      continue
    }

    break
  }

  return {
    visibleTags,
    hiddenCount: Math.max(tags.length - visibleTags.length, 0),
  }
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
        label: 'Waiting for author',
        count: 1,
      }
    case 'partially-approved':
      return {
        href: svgStatusSuccess,
        color: 'success.main',
        label: 'Partially approved',
        count: 1,
      }
    case 'fully-approved':
      return {
        href: svgStatusSuccess,
        color: 'success.main',
        label: 'Fully approved',
        count: 2,
      }
    default:
      return undefined
  }
}
