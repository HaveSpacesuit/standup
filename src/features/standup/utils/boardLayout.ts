import { STATUS_COLUMNS, type StatusColumn } from './statusColumnStyles'

/** Wide enough for a lane summary: name, load bar, open work, and two attention flags. */
export const LANE_COLUMN_WIDTH = 208
export const BLOCKED_RAIL_WIDTH = 44
/** Column headers are a single line, so their height is fixed and sticky content below can clear them. */
export const BOARD_HEADER_HEIGHT = 40
/** Sprint view headers add a flow line (sparkline, change since the start, oldest card) under the title. */
export const BOARD_FLOW_HEADER_HEIGHT = 60

/** Faint enough to separate columns without competing with the cards' colored edges. */
export const BOARD_COLUMN_DIVIDER = 'inset 1px 0 0 var(--stratakit-color-border-glow-base-default)'

const FULL_CARD_LIMIT = 3
const COMPACT_CARD_LIMIT = 5

type ElasticTrack = { min: number; fr: number }

/** In-flight columns get the most room, and Done, whose cards are expected to sit still, the least. */
const STATUS_TRACKS: Record<StatusColumn, ElasticTrack> = {
  Blocked: { min: 220, fr: 1 },
  New: { min: 210, fr: 0.95 },
  Active: { min: 250, fr: 1.2 },
  Review: { min: 250, fr: 1.2 },
  Done: { min: 200, fr: 0.75 },
}

/** Columns whose cards are always compact, so the in-flight columns stand out. */
const FOCUS_COMPACT_COLUMNS: ReadonlySet<StatusColumn> = new Set(['New', 'Done'])

export type BoardLayout = {
  gridTemplate: string
  /** Sum of the minimum track widths; every layer of the board shares it so the columns stay aligned. */
  minWidth: number
  /** An empty Blocked column shrinks to a narrow rail. */
  blockedRail: boolean
}

export function getBoardLayout(hasBlockedCards: boolean, laneColumnWidth = LANE_COLUMN_WIDTH): BoardLayout {
  const blockedRail = !hasBlockedCards
  const tracks = STATUS_COLUMNS.map((status) => {
    if (status === 'Blocked' && blockedRail) {
      return { template: `${BLOCKED_RAIL_WIDTH}px`, min: BLOCKED_RAIL_WIDTH }
    }

    const { min, fr } = STATUS_TRACKS[status]
    return { template: `minmax(${min}px, ${fr}fr)`, min }
  })

  return {
    gridTemplate: [`${laneColumnWidth}px`, ...tracks.map((track) => track.template)].join(' '),
    minWidth: laneColumnWidth + tracks.reduce((sum, track) => sum + track.min, 0),
    blockedRail,
  }
}

/** New and Done cards are always compact; the Compact cards option makes every column compact. */
export function isCompactStatusColumn(status: StatusColumn, compactCards: boolean): boolean {
  return compactCards || FOCUS_COMPACT_COLUMNS.has(status)
}

/** Compact cards are short, so a cell shows more of them before "Show more". */
export function getCollapsedCellCardLimit(compact: boolean): number {
  return compact ? COMPACT_CARD_LIMIT : FULL_CARD_LIMIT
}
