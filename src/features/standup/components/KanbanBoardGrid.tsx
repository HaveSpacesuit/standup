import { Avatar, Box, Button, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgCheckmark from '@stratakit/icons/checkmark.svg'
import type { IdentityRef } from '../../../ado/identity'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { CardChangeDetail } from '../hooks/useAdoHistoryHighlights'
import { getStatusColumnColor, STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
import {
  BOARD_COLUMN_DIVIDER as COLUMN_DIVIDER,
  getCollapsedCellCardLimit,
  isCompactStatusColumn,
  type BoardLayout,
} from '../utils/boardLayout'
import { DevelopmentCard } from './DevelopmentCard'
import type { WorkItemCardHighlightState } from './WorkItemCard'
import { AdoAvatar } from './AdoAvatar'
import { AppTooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'

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
}: KanbanBoardGridProps) {
  const theme = useTheme()
  const { gridTemplate, minWidth, blockedRail } = layout
  // Blocked is the only tinted column, and only while it holds cards.
  const blockedTint = `color-mix(in srgb, ${getStatusColumnColor('Blocked', theme.palette)} 8%, transparent)`
  const isRail = (status: StatusColumn) => status === 'Blocked' && blockedRail

  return (
    <Box sx={{ height: '100%' }}>
      <Box
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
                  px: 2,
                  py: 1.5,
                  borderBottom: '1px solid',
                  borderRight: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                }}
              >
                <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
                  Team member
                </Typography>
              </Box>

              {STATUS_COLUMNS.map((status, columnIndex) => isRail(status) ? (
                <AppTooltip key={status} title="No blocked cards" placement="bottom">
                  <Box
                    tabIndex={0}
                    data-blocked-rail=""
                    sx={{
                      position: 'relative',
                      py: 1.5,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 0.75,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
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
                    px: 2,
                    py: 1.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    boxShadow: columnIndex > 0 ? COLUMN_DIVIDER : undefined,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1, minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 4,
                        minHeight: 34,
                        borderRadius: 999,
                        bgcolor: getStatusColumnColor(status, theme.palette),
                        flex: '0 0 auto',
                        alignSelf: 'stretch',
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75 }}>
                        <Typography render={<h2 />} variant="body-sm" sx={{ fontWeight: 700 }}>
                          {status}
                        </Typography>

                        <Box
                          component="span"
                          sx={{
                            color: getStatusColumnColor(status, theme.palette),
                            fontSize: 14,
                            lineHeight: 1.25,
                            fontWeight: 700,
                            textAlign: 'center',
                            flex: '0 0 auto',
                          }}
                        >
                          {statusItemCounts[status]}
                        </Box>
                      </Box>

                      <AppTooltip
                        title={
                          currentIterationName
                            ? `Effort total includes visible items from ${currentIterationName} only.`
                            : 'Effort total includes visible items from the current sprint only.'
                        }
                      >
                        <Typography
                          variant="caption-md"
                          sx={{ mt: 0.25, color: 'text.secondary' }}
                          tabIndex={0}
                        >
                          Current sprint effort: {statusEffortTotals[status]}
                        </Typography>
                      </AppTooltip>
                    </Box>
                  </Box>
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
                        top: 72,
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
              {rows.map((row) => (
                <Box key={row.key} sx={{ display: 'contents' }}>
                <Box
                  sx={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 3,
                    px: 1.5,
                    py: 1.25,
                    borderBottom: '1px solid',
                    borderRight: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    display: 'flex',
                    alignItems: 'flex-start',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {row.isUnassigned ? (
                      <Avatar sx={{ width: 28, height: 28 }} />
                    ) : (
                      <AdoAvatar
                        alt={row.label}
                        descriptor={row.avatarDescriptor}
                        src={row.avatarUrl}
                        sx={{ width: 28, height: 28 }}
                      />
                    )}
                    <Typography render={<h2 />} variant="body-sm" sx={{ fontWeight: 500 }}>
                      {row.label}
                    </Typography>
                  </Box>
                </Box>

                {STATUS_COLUMNS.map((status) => {
                  const cellKey = `${row.key}:${status}`
                  if (isRail(status)) {
                    return <Box key={cellKey} sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />
                  }

                  const cellItems = cardsByCell[cellKey] ?? []
                  const compact = isCompactStatusColumn(status, compactCards)
                  const cardLimit = getCollapsedCellCardLimit(compact)
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
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}