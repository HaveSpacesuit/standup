import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { Theme } from '@mui/material/styles'

export type WorkItemCardHighlightState = 'new' | 'stale' | 'none'

/**
 * Compacts a work item state for display on a card: states of three or more words use the first
 * three words' initials (e.g. "Available for Testing" → "AFT"). Shorter states are left
 * as-is. The full state should still be shown in a tooltip.
 */
export function abbreviateState(state: string): string {
  const words = state.trim().split(/\s+/).filter(Boolean)
  if (words.length < 3) {
    return state
  }
  return words.slice(0, 3).map((word) => word.charAt(0).toUpperCase()).join('')
}

export function getQaColumnColor(status: WorkItemSummary['status'], palette: Theme['palette']): string {
  switch (status) {
    case 'Blocked':
      return palette.error.main
    case 'New':
      return palette.info.main
    case 'Active':
      return palette.primary.main
    case 'Review':
      return palette.warning.main
    case 'Done':
      return palette.success.main
  }
}
