import { Box, CircularProgress, Skeleton, Typography } from '@mui/material'
import { BOARD_COLUMN_DIVIDER as COLUMN_DIVIDER, BOARD_HEADER_HEIGHT, type BoardLayout } from '../utils/boardLayout'

type KanbanBoardLoadingStateProps = {
  layout: Pick<BoardLayout, 'gridTemplate' | 'minWidth'>
  /** The board's column keys, in order. */
  columns: readonly string[]
  message: string
  detail: string
  /** The board starts with a column of lanes; without one, each column is a single stack of cards. */
  lanes?: boolean
}

const LANE_COUNT = 4
/** Cards per column on a board without lanes, uneven like a real board's columns. */
const COLUMN_CARD_COUNTS = [3, 2, 4, 3, 2]

function CardSkeleton({ tall }: { tall: boolean }) {
  return <Skeleton variant="rounded" height={tall ? 60 : 42} sx={{ borderRadius: 1 }} />
}

export function KanbanBoardLoadingState({ layout, columns, message, detail, lanes = true }: KanbanBoardLoadingStateProps) {
  const { gridTemplate, minWidth } = layout
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <CircularProgress size={18} />
        <Box>
          <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
            {message}
          </Typography>
          <Typography variant="body-sm" color="text.secondary">
            {detail}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', scrollbarGutter: 'stable' }}>
        <Box sx={{ minWidth, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 3,
              display: 'grid',
              gridTemplateColumns: gridTemplate,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            {lanes ? (
              <Box
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 4,
                  px: 2,
                  height: BOARD_HEADER_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  borderRight: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                }}
              >
                <Skeleton variant="text" width={110} height={20} />
              </Box>
            ) : null}

            {columns.map((column, columnIndex) => (
              <Box
                key={`loading-header-${column}`}
                sx={{
                  px: 1.5,
                  height: BOARD_HEADER_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  boxShadow: columnIndex > 0 ? COLUMN_DIVIDER : undefined,
                }}
              >
                <Skeleton variant="rounded" width={4} height={16} />
                <Skeleton variant="text" width={58} height={20} />
                <Skeleton variant="rounded" width={22} height={18} sx={{ borderRadius: 999 }} />
                <Skeleton variant="text" width={40} height={18} sx={{ ml: 'auto' }} />
              </Box>
            ))}
          </Box>

          {lanes ? (
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {Array.from({ length: LANE_COUNT }).map((_, rowIndex) => (
                <Box
                  key={`loading-row-${rowIndex}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: gridTemplate,
                    flex: 1,
                    minHeight: 98,
                  }}
                >
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
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Skeleton variant="circular" width={28} height={28} />
                        <Skeleton variant="text" width={120} height={20} />
                      </Box>
                      <Skeleton variant="rounded" height={5} sx={{ borderRadius: 999 }} />
                      <Skeleton variant="text" width={84} height={16} />
                    </Box>
                  </Box>

                  {columns.map((column, columnIndex) => (
                    <Box
                      key={`loading-cell-${rowIndex}-${column}`}
                      sx={{
                        px: 1.25,
                        py: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        minHeight: 92,
                        height: '100%',
                        boxShadow: columnIndex > 0 ? COLUMN_DIVIDER : undefined,
                      }}
                    >
                      <Box sx={{ display: 'grid', gap: 0.75 }}>
                        <CardSkeleton tall={rowIndex % 2 === 0} />
                        {rowIndex % 2 === 0 ? <CardSkeleton tall={false} /> : null}
                      </Box>
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: gridTemplate }}>
              {columns.map((column, columnIndex) => (
                <Box
                  key={`loading-column-${column}`}
                  sx={{
                    p: 1,
                    display: 'grid',
                    alignContent: 'start',
                    gap: 1,
                    boxShadow: columnIndex > 0 ? COLUMN_DIVIDER : undefined,
                  }}
                >
                  {Array.from({ length: COLUMN_CARD_COUNTS[columnIndex % COLUMN_CARD_COUNTS.length] }).map((_, cardIndex) => (
                    <CardSkeleton key={`loading-card-${column}-${cardIndex}`} tall={(columnIndex + cardIndex) % 2 === 0} />
                  ))}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}
