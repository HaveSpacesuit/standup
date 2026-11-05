import { useTheme } from '@mui/material'
import type { TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import { getCardChangeDetail, getHighlightState, type CardChangeDetail } from '../hooks/useAdoHistoryHighlights'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import { getStatusColumnColor } from '../utils/statusColumnStyles'
import { DevelopmentCard } from './DevelopmentCard'
import { COLUMN_META, columnCaption, normalizeState, personForColumn, type ItemHistory, type QaColumnId } from './qaBoardModel'

export function QaCard({ item, column, history, compact, currentIterationName, highlightOptions, emphasis, testers }: {
  item: WorkItemSummary
  column: QaColumnId
  history: ItemHistory
  compact: boolean
  currentIterationName: string | null
  highlightOptions: CardHighlightOptions
  emphasis?: 'match' | 'dim'
  testers: TeamMember[]
}) {
  const theme = useTheme()
  const meta = COLUMN_META[column]
  const owner = personForColumn(item, column, history, testers) ?? null
  const ownerLabel = column === 'new' ? 'Filed by'
    : column === 'needs-testing' ? (owner ? 'Tester' : 'Needs a tester')
      : column === 'needs-development' ? 'Sent back by'
        : column === 'done' ? 'Verified by' : 'Owner'
  const now = Date.now()
  const cardItem = column === 'done' && normalizeState(item.state) === 'removed'
    ? { ...item, state: 'Removed' }
    : item
  const highlightState = getHighlightState(history.changedAt, item.createdAt, now, highlightOptions)
  const normalizedHighlight = highlightState === 'stale' ? 'none' : highlightState
  const changeDetail: CardChangeDetail = getCardChangeDetail({
    trackedAt: history.changedAt,
    baselineAt: item.createdAt,
    reason: history.reason,
  }, now, highlightOptions)

  return (
    <DevelopmentCard
      item={cardItem}
      highlightState={normalizedHighlight}
      changeDetail={changeDetail}
      currentIterationName={currentIterationName}
      compact={compact || column === 'done'}
      emphasis={emphasis}
      owner={owner}
      ownerLabel={ownerLabel}
      caption={columnCaption(item, column, history, now)}
      columnColor={getStatusColumnColor(meta.status, theme.palette)}
      expectedStateNames={meta.expectedStates}
      showNoSprintBadge
      cancelled={column === 'done' && normalizeState(item.state) === 'removed'}
    />
  )
}
