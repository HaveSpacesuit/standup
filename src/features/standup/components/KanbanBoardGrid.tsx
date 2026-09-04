import { Avatar, Box, Button, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { getStatusColumnColor, STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
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
  statusItemCounts: Record<StatusColumn, number>
  statusEffortTotals: Record<StatusColumn, number>
  renderStatusColumnBackground: (status: StatusColumn, columnIndex: number) => string
  onSetCellExpanded: (cellKey: string, expanded: boolean) => void
  changeHighlightsByItemId: Record<number, WorkItemCardHighlightState>
  rolledOverItemIds: Record<number, boolean>
}

export function KanbanBoardGrid({
  boardGridTemplate,
  collapsedCellCardLimit,
  rows,
  cardsByCell,
  expandedCells,
  currentIterationName,
  statusItemCounts,
  statusEffortTotals,
  renderStatusColumnBackground,
  onSetCellExpanded,
  changeHighlightsByItemId,
  rolledOverItemIds,
}: KanbanBoardGridProps) {
  const theme = useTheme()

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
            minWidth: 1175,
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
                gridTemplateColumns: boardGridTemplate,
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
                        <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
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

                      <Typography
                        variant="caption-md"
                        sx={{ mt: 0.25, color: 'text.secondary' }}
                        title={
                          currentIterationName
                            ? `Effort total includes visible items from ${currentIterationName} only.`
                            : 'Effort total includes visible items from the current sprint only.'
                        }
                      >
                        Current sprint effort: {statusEffortTotals[status]}
                      </Typography>
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
              minWidth: 1175,
              bgcolor: 'background.default',
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute',
                inset: 0,
                minWidth: 1175,
                display: 'grid',
                gridTemplateColumns: boardGridTemplate,
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
                minWidth: 1175,
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
                            showRolloverIndicator={rolledOverItemIds[item.id] === true}
                            showState
                            effortPlacement="footer"
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
