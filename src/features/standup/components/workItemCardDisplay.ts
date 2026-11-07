import type { WorkItemSummary } from '../../../ado/queryEngine'

export type StatusPaletteKey = 'error' | 'info' | 'primary' | 'warning' | 'success'

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
