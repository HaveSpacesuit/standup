import type { WorkItemSummary } from '../../../ado/queryEngine'
import { STATUS_COLUMNS } from '../utils/statusColumnStyles'
import type { AttentionFacetKey } from './boardAttention'
import type { BoardRowData } from './KanbanBoardGrid'

export type StandupOrderMode = 'alphabetical' | 'attention'

export const STANDUP_ORDER_OPTIONS: readonly { value: StandupOrderMode; label: string }[] = [
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'attention', label: 'Most attention first' },
]

/** How strongly each signal moves a person up in Most attention first. Recent changes are routine, so they don't count. */
export const STANDUP_ATTENTION_WEIGHTS: Readonly<Record<AttentionFacetKey, number>> = {
  blocked: 5,
  failing: 4,
  idle: 3,
  approval: 2,
  qa: 1,
  ready: 1,
  changed: 0,
}

/** A turn's timer turns amber once it runs this long. */
export const STANDUP_TURN_SECONDS = 120

const NON_MEMBER_ROW_KEYS: ReadonlySet<string> = new Set(['__unassigned__', '__assignee_history_unavailable__'])

/** Team member lanes take a turn; the Unassigned and Assignee unavailable lanes don't. */
export function isStandupSpeakerRow(row: BoardRowData): boolean {
  return !row.isUnassigned && !NON_MEMBER_ROW_KEYS.has(row.key)
}

export function getStandupAttentionScore(
  rowKey: string,
  cardsByCell: Record<string, readonly WorkItemSummary[]>,
  signalsByItemId: ReadonlyMap<number, ReadonlySet<AttentionFacetKey>>,
): number {
  let score = 0
  for (const status of STATUS_COLUMNS) {
    for (const item of cardsByCell[`${rowKey}:${status}`] ?? []) {
      for (const signal of signalsByItemId.get(item.id) ?? []) {
        score += STANDUP_ATTENTION_WEIGHTS[signal]
      }
    }
  }
  return score
}

function compareLabels(a: BoardRowData, b: BoardRowData): number {
  return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
}

/** Row keys of everyone who takes a turn, in speaking order. */
export function getStandupOrder(
  rows: readonly BoardRowData[],
  mode: StandupOrderMode,
  cardsByCell: Record<string, readonly WorkItemSummary[]>,
  signalsByItemId: ReadonlyMap<number, ReadonlySet<AttentionFacetKey>>,
): string[] {
  const speakers = rows.filter(isStandupSpeakerRow)
  if (mode === 'alphabetical') {
    return speakers.sort(compareLabels).map((row) => row.key)
  }

  const scores = new Map(speakers.map((row) => [row.key, getStandupAttentionScore(row.key, cardsByCell, signalsByItemId)]))
  return speakers
    .sort((a, b) => (scores.get(b.key) ?? 0) - (scores.get(a.key) ?? 0) || compareLabels(a, b))
    .map((row) => row.key)
}

/**
 * Keeps a running standup's order steady while board data refreshes:
 * people who left the board drop out, and newcomers queue at the end.
 */
export function resolveStandupSpeakers(orderKeys: readonly string[], rows: readonly BoardRowData[]): BoardRowData[] {
  const speakers = rows.filter(isStandupSpeakerRow)
  const speakersByKey = new Map(speakers.map((row) => [row.key, row]))
  const queued = new Set(orderKeys)

  return [
    ...orderKeys.flatMap((key) => speakersByKey.get(key) ?? []),
    ...speakers.filter((row) => !queued.has(row.key)).sort(compareLabels),
  ]
}

export function formatStandupTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** "Ada Lovelace" and "Lovelace, Ada" both give "Ada". */
export function getFirstName(displayName: string): string {
  const [surname, given] = displayName.split(',', 2)
  const name = (given ?? surname).trim()
  return name.split(/\s+/)[0] || displayName.trim()
}
