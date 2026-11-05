import { Box, Button, IconButton, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgCollapseRowsAll from '@stratakit/icons/collapse-rows-all.svg'
import svgExpandRowsAll from '@stratakit/icons/expand-rows-all.svg'
import svgInfo from '@stratakit/icons/info.svg'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { BOARD_COLUMN_DIVIDER, BOARD_HEADER_HEIGHT, getCollapsedCellCardLimit, LANE_COLUMN_WIDTH } from '../utils/boardLayout'
import { getStatusColumnColor } from '../utils/statusColumnStyles'
import { partitionHighlighted } from './boardAttention'
import { CollapsedCellSummary, LaneHead } from './BoardLane'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'
import type { BoardRowData } from './KanbanBoardGrid'
import { presentingFrameShadow } from './laneSummary'
import { QaColumnHeader } from './QaColumnHeader'
import { COLUMN_META, getQaBoardLayout, getQaLaneFlags, type QaColumnId, type QaColumnState, type QaFacet } from './qaBoardModel'

const NO_ITEMS: readonly WorkItemSummary[] = []

type QaTesterLanesProps = {
  columns: readonly QaColumnState[]
  rows: readonly BoardRowData[]
  /** Cards by `${laneKey}:${columnId}`. */
  itemsByCell: ReadonlyMap<string, readonly WorkItemSummary[]>
  /** Cards matching the selected Needs attention facet, or null while none is selected. */
  highlightedIds: ReadonlySet<number> | null
  signalsById: ReadonlyMap<number, ReadonlySet<QaFacet>>
  compactCards: boolean
  testerCount: number
  /** Set while the testers are inferred from QA activity, so the corner can offer to choose them. */
  onChooseInferredTesters?: () => void
  collapsedRowKeys: ReadonlySet<string>
  /** Lanes can only be collapsed when these are provided. */
  onToggleRowCollapsed?: (rowKey: string) => void
  onSetAllRowsCollapsed?: (collapsed: boolean) => void
  onToggleColumn: (column: QaColumnState) => void
  /** In standup, the speaker's lane shows every card and every other lane collapses. */
  presentingRowKey: string | null
  renderCard: (item: WorkItemSummary, column: QaColumnId, compact: boolean) => ReactNode
}

/** The QA Testers view: a lane per tester, laid out like the Development board. */
export function QaTesterLanes({
  columns,
  rows,
  itemsByCell,
  highlightedIds,
  signalsById,
  compactCards,
  testerCount,
  onChooseInferredTesters,
  collapsedRowKeys,
  onToggleRowCollapsed,
  onSetAllRowsCollapsed,
  onToggleColumn,
  presentingRowKey,
  renderCard,
}: QaTesterLanesProps) {
  const theme = useTheme()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({})
  const { gridTemplate, minWidth } = getQaBoardLayout(columns, LANE_COLUMN_WIDTH)
  const cellItems = (rowKey: string, id: QaColumnId) => itemsByCell.get(`${rowKey}:${id}`) ?? NO_ITEMS
  const columnColor = (id: QaColumnId) => getStatusColumnColor(COLUMN_META[id].status, theme.palette)
  const setCellExpanded = (cellKey: string, expanded: boolean) => setExpandedCells((current) => ({ ...current, [cellKey]: expanded }))

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
    <Box
      ref={scrollerRef}
      data-qa-scroll-container=""
      sx={{
        flex: '1 1 auto',
        minHeight: 0,
        overflow: 'auto',
        scrollbarGutter: 'stable',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ minWidth, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ position: 'sticky', top: 0, zIndex: 3 }}>
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
              <Box sx={{ mr: 'auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <Typography variant="body-sm" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  Testers
                  <Box component="span" aria-hidden="true" sx={{ fontWeight: 500, color: TERTIARY_TEXT_COLOR }}>
                    {` · ${testerCount}`}
                  </Box>
                  <Box component="span" sx={visuallyHiddenSx}>
                    {` (${testerCount} ${testerCount === 1 ? 'tester' : 'testers'})`}
                  </Box>
                </Typography>
                {onChooseInferredTesters ? (
                  <IconButton size="small" label="Testers are inferred from recent QA activity. Choose testers" onClick={onChooseInferredTesters}>
                    <Icon href={svgInfo} />
                  </IconButton>
                ) : null}
              </Box>
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

            {columns.map((column, index) => (
              <QaColumnHeader
                key={column.id}
                id={column.id}
                count={column.count}
                matchCount={highlightedIds
                  ? rows.reduce((sum, row) => sum + cellItems(row.key, column.id).filter((item) => highlightedIds.has(item.id)).length, 0)
                  : null}
                rail={column.rail}
                onToggle={column.rail || column.collapsible ? () => onToggleColumn(column) : undefined}
                divider={index > 0}
              />
            ))}
          </Box>
        </Box>

        <Box sx={{ position: 'relative', flex: '1 1 auto', minHeight: 0, minWidth, bgcolor: 'background.default' }}>
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
            {columns.map((column, index) => (
              <Box
                key={`background-${column.id}`}
                data-qa-board-column={column.id}
                // The header's Expand button is the keyboard path; a click anywhere on a rail is a mouse shortcut.
                onClick={column.rail ? () => onToggleColumn(column) : undefined}
                sx={{
                  boxShadow: index > 0 ? BOARD_COLUMN_DIVIDER : undefined,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  pointerEvents: column.rail ? 'auto' : undefined,
                  cursor: column.rail ? 'pointer' : undefined,
                }}
              >
                {column.rail ? (
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
                    {COLUMN_META[column.id].title} · {column.count > 0 ? column.count : 'none'}
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
              const laneItems = columns.flatMap(({ id }) => cellItems(row.key, id))
              const doneCount = cellItems(row.key, 'done').length
              const openCount = laneItems.length - doneCount
              const loadParts = columns
                .filter(({ id }) => cellItems(row.key, id).length > 0)
                .map(({ id }) => `${COLUMN_META[id].title} ${cellItems(row.key, id).length}`)

              return (
                <Box key={row.key} sx={{ display: 'contents' }}>
                  <LaneHead
                    row={row}
                    collapsed={collapsed}
                    onToggleCollapsed={toggleCollapsed}
                    presenting={presenting}
                    load={columns.map(({ id }) => ({ key: id, count: cellItems(row.key, id).length, color: columnColor(id) }))}
                    loadLabel={loadParts.length > 0 ? `Cards by column: ${loadParts.join(', ')}` : 'No cards'}
                    caption={laneItems.length === 0 ? 'No cards' : (
                      <>
                        <span aria-hidden="true">
                          {openCount} open{doneCount > 0 ? ` · ${doneCount} done` : ''}
                        </span>
                        <Box component="span" sx={visuallyHiddenSx}>
                          {openCount} open {openCount === 1 ? 'card' : 'cards'}{doneCount > 0 ? `, ${doneCount} recently completed` : ''}
                        </Box>
                      </>
                    )}
                    flags={getQaLaneFlags(laneItems, signalsById)}
                  />

                  {columns.map((column, index) => {
                    const { id } = column
                    const cellKey = `${row.key}:${id}`
                    const items = cellItems(row.key, id)
                    const frame = presenting ? presentingFrameShadow({ right: index === columns.length - 1 }) : undefined

                    if (column.rail) {
                      return (
                        <Box
                          key={cellKey}
                          onClick={() => onToggleColumn(column)}
                          sx={{ borderBottom: '1px solid', borderColor: 'divider', boxShadow: frame, cursor: 'pointer' }}
                        />
                      )
                    }

                    if (collapsed) {
                      const highlightedCount = highlightedIds ? items.filter((item) => highlightedIds.has(item.id)).length : null
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
                          <CollapsedCellSummary
                            label={COLUMN_META[id].title}
                            count={items.length}
                            color={columnColor(id)}
                            flags={getQaLaneFlags(items, signalsById)}
                            highlightedCount={highlightedCount}
                          />
                        </Box>
                      )
                    }

                    const { items: shownItems, matchCount } = partitionHighlighted(items, highlightedIds)
                    const compact = compactCards || id === 'done'
                    // Matching cards are never tucked behind Show more, and the speaker's lane shows everything.
                    const cardLimit = presenting ? Infinity : Math.max(getCollapsedCellCardLimit(compact), matchCount)
                    const isExpanded = expandedCells[cellKey] === true
                    const visibleItems = isExpanded ? shownItems : shownItems.slice(0, cardLimit)
                    const hiddenCount = Math.max(shownItems.length - visibleItems.length, 0)

                    return (
                      <Box
                        key={cellKey}
                        data-qa-cell={cellKey}
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
                        <Box sx={{ display: 'grid', alignContent: 'start', gap: 0.75 }}>
                          {visibleItems.map((item) => <Fragment key={item.id}>{renderCard(item, id, compact)}</Fragment>)}
                        </Box>

                        {hiddenCount > 0 ? (
                          <Button
                            size="small"
                            variant="text"
                            sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}
                            onClick={() => setCellExpanded(cellKey, true)}
                          >
                            Show {hiddenCount} more
                          </Button>
                        ) : null}

                        {isExpanded && shownItems.length > cardLimit ? (
                          <Button
                            size="small"
                            variant="text"
                            sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}
                            onClick={() => setCellExpanded(cellKey, false)}
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
  )
}
