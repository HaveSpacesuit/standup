import type { WorkItemSummary } from '../../../ado/queryEngine'
import { STATUS_COLUMNS } from './statusColumnStyles'

export type BoardRowVisibilityOptions = {
  hideUsersWithNoActivity: boolean
  hideUsersWithOnlyStaleDoneWork: boolean
}

/**
 * Hiding users with only stale, done work is a stricter form of hiding users with no activity, so
 * it has no effect unless hideUsersWithNoActivity is also on. A card is stale only when its change
 * highlight says so; a card whose highlight has not been computed yet is not stale, which keeps
 * the row visible until the data is known.
 */
export function getVisibleBoardRows<Row extends { key: string }>(
  rows: Row[],
  cardsByCell: Record<string, WorkItemSummary[]>,
  changeHighlightsByItemId: Record<number, string>,
  { hideUsersWithNoActivity, hideUsersWithOnlyStaleDoneWork }: BoardRowVisibilityOptions,
): Row[] {
  if (!hideUsersWithNoActivity) {
    return rows
  }

  return rows.filter((row) => {
    const cards = STATUS_COLUMNS.flatMap((status) => cardsByCell[`${row.key}:${status}`] ?? [])
    if (cards.length === 0) {
      return false
    }

    return !hideUsersWithOnlyStaleDoneWork
      || cards.some((card) => card.status !== 'Done' || changeHighlightsByItemId[card.id] !== 'stale')
  })
}
