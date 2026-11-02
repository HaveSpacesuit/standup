import { Box, Button, IconButton, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgCheckmark from '@stratakit/icons/checkmark.svg'
import svgCollapseRowsAll from '@stratakit/icons/collapse-rows-all.svg'
import svgExpandRowsAll from '@stratakit/icons/expand-rows-all.svg'
import { useEffect, useMemo, useRef } from 'react'
import type { IdentityRef } from '../../../ado/identity'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { CardChangeDetail } from '../hooks/useAdoHistoryHighlights'
import { getStatusColumnColor, STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
import {
  BOARD_COLUMN_DIVIDER as COLUMN_DIVIDER,
  BOARD_HEADER_HEIGHT,
  getCollapsedCellCardLimit,
  isCompactStatusColumn,
  type BoardLayout,
} from '../utils/boardLayout'
import { formatEffortPoints } from '../utils/sprintEffortTotals'
import { DevelopmentCard } from './DevelopmentCard'
import type { WorkItemCardHighlightState } from './WorkItemCard'
import { AppTooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'
import { partitionHighlighted, type AttentionFacetKey } from './boardAttention'
import { BoardLaneHead, CollapsedLaneSummary } from './BoardLane'
import { getLaneSummary, presentingFrameShadow, type LaneSummary } from './laneSummary'

const NO_SIGNALS: ReadonlyMap<number, ReadonlySet<AttentionFacetKey>> = new Map()
const NO_COLLAPSED_ROWS: ReadonlySet<string> = new Set()

export type BoardRowData = {
  key: string
  label: string
  avatarDescriptor?: string
  avatarUrl?: string
  /** Set on team member rows; absent on the Unassigned and Assignee unavailable rows. */
  memberIdentity?: IdentityRef
  isUnassigned?: boolean
}

type KanbanBoardGridProps = {
  layout: BoardLayout
  rows: BoardRowData[]
  cardsByCell: Record<string, WorkItemSummary[]>
  expandedCells: Record<string, boolean>
  currentIterationName: string | null
  statusItemCounts: Record<StatusColumn, number>
  statusEffortTotals: Record<StatusColumn, number>
  onSetCellExpanded: (cellKey: string, expanded: boolean) => void
  changeHighlightsByItemId: Record<number, WorkItemCardHighlightState>
  changeDetailsByItemId?: Record<number, CardChangeDetail>
  compactCards?: boolean
  rolledOverItemIds: Record<number, boolean>
  /** Cards matching the selected Needs attention facet, or null while none is selected. */
  highlightedItemIds?: ReadonlySet<number> | null
  statusMatchCounts?: Record<StatusColumn, number> | null
  /** Each card's Needs attention signals, for the lane summaries. */
  signalsByItemId?: ReadonlyMap<number, ReadonlySet<AttentionFacetKey>>
  collapsedRowKeys?: ReadonlySet<string>
  /** Lanes can only be collapsed when these are provided. */
  onToggleRowCollapsed?: (rowKey: string) => void
  onSetAllRowsCollapsed?: (collapsed: boolean) => void
  /** In standup, the speaker's lane shows every card and every other lane collapses. */
  presentingRowKey?: string | null
}

export function KanbanBoardGrid({
  layout,
  rows,
  cardsByCell,
  expandedCells,
  currentIterationName,
  statusItemCounts,
  statusEffortTotals,
  onSetCellExpanded,
  changeHighlightsByItemId,
  changeDetailsByItemId,
  compactCards = false,
  rolledOverItemIds,
  highlightedItemIds = null,
  statusMatchCounts = null,
  signalsByItemId = NO_SIGNALS,
  collapsedRowKeys = NO_COLLAPSED_ROWS,
  onToggleRowCollapsed,
  onSetAllRowsCollapsed,
  presentingRowKey = null,
}: KanbanBoardGridProps) {
  const theme = useTheme()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const { gridTemplate, minWidth, blockedRail } = layout
  // Blocked is the only tinted column, and only while it holds cards.
  const blockedTint = `color-mix(in srgb, ${getStatusColumnColor('Blocked', theme.palette)} 8%, transparent)`
  const isRail = (status: StatusColumn) => status === 'Blocked' && blockedRail
  const laneSummaries = useMemo(
    () => new Map<string, LaneSummary>(rows.map((row) => [row.key, getLaneSummary(row.key, cardsByCell, signalsByItemId)])),
    [cardsByCell, rows, signalsByItemId],
  )

  useEffect(() => {
    const scroller = scrollerRef.current
    const lane = presentingRowKey && scroller
      ? [...scroller.querySelectorAll<HTMLElement>('[data-lane]')].find((head) => head.dataset.lane === presentingRowKey)
      : undefined
    if (!scroller || !lane) {
      return
    }

    const top = scroller.scrollTop + lane.getBoundingClientRect().top - scroller.getBoundingClientRect().top - BOARD_HEADER_HEIGHT
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    scroller.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [presentingRowKey])

  return (
    <Box sx={{ height: '100%' }}>
      <Box
        ref={scrollerRef}
        sx={{
          height: '100%',
          overflow: 'auto',
          scrollbarGutter: 'stable',
          bgcolor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            minWidth,
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 3,
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: gridTemplate,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Box
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 4,
                  pl: 2,
                  pr: 1,
                  height: BOARD_HEADER_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.25,
                  borderRight: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                }}
              >
                <Typography variant="body-sm" sx={{ fontWeight: 700, mr: 'auto' }}>
                  Team member
                </Typography>
                {onSetAllRowsCollapsed ? (
                  <>
                    <IconButton size="small" label="Collapse all lanes" onClick={() => onSetAllRowsCollapsed(true)}>
                      <Icon href={svgCollapseRowsAll} />
                    </IconButton>
                    <IconButton size="small" label="Expand all lanes" onClick={() => onSetAllRowsCollapsed(false)}>
                      <Icon href={svgExpandRowsAll} />
                    </IconButton>
                  </>
                ) : null}
              </Box>

              {STATUS_COLUMNS.map((status, columnIndex) => isRail(status) ? (
                <AppTooltip key={status} title="No blocked cards" placement="bottom">
                  <Box
                    tabIndex={0}
                    data-blocked-rail=""
                    sx={{
                      position: 'relative',
                      height: BOARD_HEADER_HEIGHT,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0.5,
                      boxShadow: columnIndex > 0 ? COLUMN_DIVIDER : undefined,
                    }}
                  >
                    <Box sx={{ width: 22, height: 4, borderRadius: 999, bgcolor: getStatusColumnColor(status, theme.palette) }} />
                    <Typography render={<h2 />} variant="body-sm" sx={visuallyHiddenSx}>
                      {status}
                    </Typography>
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        color: 'var(--stratakit-color-text-positive-base)',
                        fontSize: 11,
                        fontWeight: 700,
                        '& svg': { color: 'var(--stratakit-color-icon-positive-base)' },
                      }}
                    >
                      <Icon href={svgCheckmark} />
                      {statusItemCounts[status]}
                      <Box component="span" sx={visuallyHiddenSx}> cards, none blocked</Box>
                    </Box>
                  </Box>
                </AppTooltip>
              ) : (
                <Box
                  key={status}
                  sx={{
                    px: 1.5,
                    height: BOARD_HEADER_HEIGHT,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minWidth: 0,
                    boxShadow: columnIndex > 0 ? COLUMN_DIVIDER : undefined,
                  }}
                >
                  <Box
                    sx={{
                      width: 4,
                      height: 16,
                      borderRadius: 999,
                      bgcolor: getStatusColumnColor(status, theme.palette),
                      flex: '0 0 auto',
                    }}
                  />
                  <Typography render={<h2 />} variant="body-sm" sx={{ fontWeight: 700 }}>
                    {status}
                  </Typography>
                  <Box
                    component="span"
                    sx={{
                      minWidth: 20,
                      height: 18,
                      px: 0.75,
                      borderRadius: 999,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)',
                      color: 'text.secondary',
                      fontSize: 11,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      flex: '0 0 auto',
                    }}
                  >
                    {statusMatchCounts ? (
                      <>
                        <Box component="span" aria-hidden="true">
                          {statusMatchCounts[status]}
                          <Box component="span" sx={{ fontWeight: 500, color: TERTIARY_TEXT_COLOR }}>/{statusItemCounts[status]}</Box>
                        </Box>
                        <Box component="span" sx={visuallyHiddenSx}>
                          {statusMatchCounts[status]} of {statusItemCounts[status]} highlighted
                        </Box>
                      </>
                    ) : statusItemCounts[status]}
                  </Box>

                  <AppTooltip
                    title={
                      currentIterationName
                        ? `Effort total includes visible items from ${currentIterationName} only.`
                        : 'Effort total includes visible items from the current sprint only.'
                    }
                  >
                    <Typography
                      component="span"
                      variant="caption-md"
                      tabIndex={0}
                      sx={{ ml: 'auto', color: 'text.secondary', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                    >
                      <Box component="span" sx={visuallyHiddenSx}>Current sprint effort: </Box>
                      {formatEffortPoints(statusEffortTotals[status])}
                    </Typography>
                  </AppTooltip>
                </Box>
              ))}
            </Box>
          </Box>

          <Box
            sx={{
              position: 'relative',
              flex: '1 1 auto',
              minHeight: 0,
              minWidth,
              bgcolor: 'background.default',
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute',
                inset: 0,
                minWidth,
                display: 'grid',
                gridTemplateColumns: gridTemplate,
                pointerEvents: 'none',
              }}
            >
              <Box
                sx={{
                  bgcolor: 'background.paper',
                  position: 'sticky',
                  left: 0,
                  zIndex: 1,
                  borderRight: '1px solid',
                  borderColor: 'divider',
                }}
              />
              {STATUS_COLUMNS.map((status, columnIndex) => (
                <Box
                  key={`background-${status}`}
                  sx={{
                    boxShadow: columnIndex > 0 ? COLUMN_DIVIDER : undefined,
                    bgcolor: status === 'Blocked' && !blockedRail ? blockedTint : undefined,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                  }}
                >
                  {isRail(status) ? (
                    <Box
                      component="span"
                      sx={{
                        position: 'sticky',
                        top: BOARD_HEADER_HEIGHT + 12,
                        mt: 1.5,
                        writingMode: 'vertical-rl',
                        transform: 'rotate(180deg)',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        color: TERTIARY_TEXT_COLOR,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Blocked · none
                    </Box>
                  ) : null}
                </Box>
              ))}
            </Box>

            <Box
              sx={{
                position: 'relative',
                zIndex: 1,
                display: 'grid',
                gridTemplateColumns: gridTemplate,
                gridAutoRows: 'max-content',
                minWidth,
              }}
            >
              {rows.map((row) => {
                const presenting = row.key === presentingRowKey
                const collapsed = presentingRowKey ? !presenting : collapsedRowKeys.has(row.key)
                const toggleCollapsed = onToggleRowCollapsed ? () => onToggleRowCollapsed(row.key) : undefined

                return (
                <Box key={row.key} sx={{ display: 'contents' }}>
                <BoardLaneHead
                  row={row}
                  summary={laneSummaries.get(row.key) ?? getLaneSummary(row.key, cardsByCell, signalsByItemId)}
                  collapsed={collapsed}
                  onToggleCollapsed={toggleCollapsed}
                  presenting={presenting}
                />

                {STATUS_COLUMNS.map((status, columnIndex) => {
                  const cellKey = `${row.key}:${status}`
                  const frame = presenting ? presentingFrameShadow({ right: columnIndex === STATUS_COLUMNS.length - 1 }) : undefined
                  if (isRail(status)) {
                    return <Box key={cellKey} sx={{ borderBottom: '1px solid', borderColor: 'divider', boxShadow: frame }} />
                  }

                  if (collapsed) {
                    const items = cardsByCell[cellKey] ?? []
                    const highlightedCount = highlightedItemIds
                      ? items.filter((item) => highlightedItemIds.has(item.id)).length
                      : null

                    return (
                      <Box
                        key={cellKey}
                        data-collapsed-cell=""
                        // The chevron is the keyboard path; a click anywhere in the summary is a mouse shortcut.
                        onClick={toggleCollapsed}
                        sx={{
                          position: 'relative',
                          px: 1.25,
                          py: 0.75,
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                          minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          cursor: toggleCollapsed ? 'pointer' : undefined,
                          opacity: highlightedCount === 0 ? 0.35 : undefined,
                        }}
                      >
                        <CollapsedLaneSummary
                          status={status}
                          items={items}
                          signalsByItemId={signalsByItemId}
                          highlightedCount={highlightedCount}
                        />
                      </Box>
                    )
                  }

                  const { items: cellItems, matchCount } = partitionHighlighted(cardsByCell[cellKey] ?? [], highlightedItemIds)
                  const compact = isCompactStatusColumn(status, compactCards)
                  // Matching cards are never tucked behind Show more, and the speaker's lane shows everything.
                  const cardLimit = presenting ? Infinity : Math.max(getCollapsedCellCardLimit(compact), matchCount)
                  const isExpanded = expandedCells[cellKey] === true
                  const visibleItems = isExpanded
                    ? cellItems
                    : cellItems.slice(0, cardLimit)
                  const hiddenCount = Math.max(cellItems.length - visibleItems.length, 0)

                  return (
                    <Box
                      key={cellKey}
                      sx={{
                        px: 1.25,
                        py: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        boxShadow: frame,
                        minHeight: 92,
                        minWidth: 0,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignContent: 'flex-start',
                          gap: 0.75,
                        }}
                      >
                        {visibleItems.map((item) => (
                          <DevelopmentCard
                            key={item.id}
                            item={item}
                            highlightState={changeHighlightsByItemId[item.id] ?? 'none'}
                            changeDetail={changeDetailsByItemId?.[item.id]}
                            currentIterationName={currentIterationName}
                            rowMember={row.memberIdentity}
                            showRolloverIndicator={rolledOverItemIds[item.id] === true}
                            compact={compact}
                            emphasis={highlightedItemIds ? (highlightedItemIds.has(item.id) ? 'match' : 'dim') : undefined}
                          />
                        ))}
                      </Box>

                      {hiddenCount > 0 ? (
                        <Button
                          size="small"
                          variant="text"
                          sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}
                          onClick={() => onSetCellExpanded(cellKey, true)}
                        >
                          Show {hiddenCount} more
                        </Button>
                      ) : null}

                      {isExpanded && cellItems.length > cardLimit ? (
                        <Button
                          size="small"
                          variant="text"
                          sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}
                          onClick={() => onSetCellExpanded(cellKey, false)}
                        >
                          Show less
                        </Button>
                      ) : null}
                    </Box>
                  )
                })}
                </Box>
                )
              })}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}