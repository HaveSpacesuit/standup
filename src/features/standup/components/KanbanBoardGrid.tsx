import { Avatar, Badge, Box, Button, Tooltip, Typography } from '@mui/material'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { getStatusBadgeColor, STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
import { WorkItemCard } from './WorkItemCard'
import type { WorkItemCardHighlightState } from './WorkItemCard'

export type BoardRowData = {
  key: string
  label: string
  avatarUrl?: string
  isUnassigned?: boolean
}

type KanbanBoardGridProps = {
  boardGridTemplate: string
  collapsedCellCardLimit: number
  rows: BoardRowData[]
  cardsByCell: Record<string, WorkItemSummary[]>
  expandedCells: Record<string, boolean>
  currentIterationName: string | null
  statusEffortTotals: Record<StatusColumn, number>
  renderStatusColumnBackground: (status: StatusColumn, columnIndex: number) => string
  onSetCellExpanded: (cellKey: string, expanded: boolean) => void
  changeHighlightsByItemId: Record<number, WorkItemCardHighlightState>
}

export function KanbanBoardGrid({
  boardGridTemplate,
  collapsedCellCardLimit,
  rows,
  cardsByCell,
  expandedCells,
  currentIterationName,
  statusEffortTotals,
  renderStatusColumnBackground,
  onSetCellExpanded,
  changeHighlightsByItemId,
}: KanbanBoardGridProps) {
  return (
    <Box sx={{ height: '100%' }}>
      <Box
        sx={{
          height: '100%',
          overflowX: 'auto',
        }}
      >
        <Box
          sx={{
            minWidth: 1220,
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarGutter: 'stable',
            bgcolor: 'background.default',
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
                gridTemplateColumns: boardGridTemplate,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                }}
              >
                <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
                  Team member
                </Typography>
              </Box>

              {STATUS_COLUMNS.map((status, columnIndex) => (
                <Box
                  key={status}
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    backgroundImage: renderStatusColumnBackground(status, columnIndex),
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75 }}>
                    <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
                      {status}
                    </Typography>

                    <Tooltip
                      title={
                        currentIterationName
                          ? `Effort total includes visible items from ${currentIterationName} only.`
                          : 'Effort total includes visible items from the current sprint only.'
                      }
                    >
                      <Box component="span">
                        <Badge
                          badgeContent={statusEffortTotals[status]}
                          color={getStatusBadgeColor(status)}
                          max={999}
                          inline
                          size="small"
                          showZero
                        >
                          <Box sx={{ width: 0, height: 0 }} />
                        </Badge>
                      </Box>
                    </Tooltip>
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
              minWidth: 1220,
              bgcolor: 'background.default',
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute',
                inset: 0,
                minWidth: 1220,
                display: 'grid',
                gridTemplateColumns: boardGridTemplate,
                pointerEvents: 'none',
              }}
            >
              <Box sx={{ bgcolor: 'background.paper' }} />
              {STATUS_COLUMNS.map((status, columnIndex) => (
                <Box
                  key={`background-${status}`}
                  sx={{ backgroundImage: renderStatusColumnBackground(status, columnIndex) }}
                />
              ))}
            </Box>

            <Box
              sx={{
                position: 'relative',
                zIndex: 1,
                display: 'grid',
                gridTemplateColumns: boardGridTemplate,
                gridAutoRows: 'max-content',
                minWidth: 1220,
              }}
            >
              {rows.map((row) => (
                <Box key={row.key} sx={{ display: 'contents' }}>
                <Box
                  sx={{
                    px: 1.5,
                    py: 1.25,
                    borderBottom: '1px solid',
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
                      <Avatar alt={row.label} src={row.avatarUrl} sx={{ width: 28, height: 28 }} />
                    )}
                    <Typography variant="body-sm" sx={{ fontWeight: 500 }}>
                      {row.label}
                    </Typography>
                  </Box>
                </Box>

                {STATUS_COLUMNS.map((status, columnIndex) => {
                  const cellKey = `${row.key}:${status}`
                  const cellItems = cardsByCell[cellKey] ?? []
                  const isExpanded = expandedCells[cellKey] === true
                  const visibleItems = isExpanded
                    ? cellItems
                    : cellItems.slice(0, collapsedCellCardLimit)
                  const hiddenCount = Math.max(cellItems.length - visibleItems.length, 0)

                  return (
                    <Box
                      key={cellKey}
                      sx={{
                        pl: 1,
                        pr: 2,
                        py: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        backgroundImage: renderStatusColumnBackground(status, columnIndex),
                        minHeight: 92,
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
                          <WorkItemCard
                            key={item.id}
                            item={item}
                            highlightState={changeHighlightsByItemId[item.id] ?? 'none'}
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

                      {isExpanded && cellItems.length > collapsedCellCardLimit ? (
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
