import type { WorkItemSummary } from '../../../ado/queryEngine'
import { STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
import { getLaneFlags, type AttentionFacetKey, type LaneFlag } from './boardAttention'

export type LaneSummary = {
  statusCounts: Record<StatusColumn, number>
  itemCount: number
  /** Effort of every card in the lane. */
  totalEffort: number
  /** Cards outside Done. */
  openCount: number
  /** Effort of the open cards, across every sprint on the board. */
  openEffort: number
  /** Every lane flag with at least one card, most urgent first. */
  flags: LaneFlag[]
}

/** Lane heads show this many flags; the cards themselves carry the rest. */
export const LANE_HEAD_FLAG_LIMIT = 2

const PRESENTING_EDGE = 'var(--stratakit-color-border-accent-base)'

/** Draws the speaking lane's outline one grid cell at a time, since a lane is a row of separate grid cells. */
export function presentingFrameShadow({ left = false, right = false }: { left?: boolean; right?: boolean } = {}): string {
  return [
    `inset 0 2px 0 ${PRESENTING_EDGE}`,
    `inset 0 -2px 0 ${PRESENTING_EDGE}`,
    ...(left ? [`inset 2px 0 0 ${PRESENTING_EDGE}`] : []),
    ...(right ? [`inset -2px 0 0 ${PRESENTING_EDGE}`] : []),
  ].join(', ')
}

export function getLaneSummary(
  rowKey: string,
  cardsByCell: Record<string, readonly WorkItemSummary[]>,
  signalsByItemId: ReadonlyMap<number, ReadonlySet<AttentionFacetKey>>,
): LaneSummary {
  const statusCounts: Record<StatusColumn, number> = { Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 }
  const laneItems: WorkItemSummary[] = []
  let openCount = 0
  let openEffort = 0
  let totalEffort = 0

  for (const status of STATUS_COLUMNS) {
    const cellItems = cardsByCell[`${rowKey}:${status}`] ?? []
    statusCounts[status] = cellItems.length
    laneItems.push(...cellItems)
    const cellEffort = cellItems.reduce((sum, item) => sum + (typeof item.effort === 'number' ? item.effort : 0), 0)
    totalEffort += cellEffort

    if (status === 'Done') {
      continue
    }

    openCount += cellItems.length
    openEffort += cellEffort
  }

  return {
    statusCounts,
    itemCount: laneItems.length,
    totalEffort,
    openCount,
    openEffort,
    flags: getLaneFlags(laneItems, signalsByItemId),
  }
}

/** "Cards by column: Active 3, Review 2" */
export function describeLaneLoad(statusCounts: Record<StatusColumn, number>): string {
  const parts = STATUS_COLUMNS.filter((status) => statusCounts[status] > 0).map((status) => `${status} ${statusCounts[status]}`)
  return parts.length > 0 ? `Cards by column: ${parts.join(', ')}` : 'No cards'
}
