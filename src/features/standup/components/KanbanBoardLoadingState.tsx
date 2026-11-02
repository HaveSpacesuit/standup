import { Box, CircularProgress, Skeleton, Typography } from '@mui/material'
import { BOARD_COLUMN_DIVIDER as COLUMN_DIVIDER, BOARD_HEADER_HEIGHT, type BoardLayout } from '../utils/boardLayout'
import type { StatusColumn } from '../utils/statusColumnStyles'

type KanbanBoardLoadingStateProps = {
  layout: BoardLayout
  statusColumns: readonly StatusColumn[]
}

export function KanbanBoardLoadingState({ layout, statusColumns }: KanbanBoardLoadingStateProps) {
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
            Loading board data...
          </Typography>
          <Typography variant="body-sm" color="text.secondary">
            Fetching team members, work items, and pull requests.
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

            {statusColumns.map((status, columnIndex) => (
              <Box
                key={`loading-header-${status}`}
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

          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {Array.from({ length: 4 }).map((_, rowIndex) => (
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Skeleton variant="circular" width={28} height={28} />
                    <Skeleton variant="text" width={120} height={20} />
                  </Box>
                </Box>

                {statusColumns.map((status, columnIndex) => (
                  <Box
                    key={`loading-cell-${rowIndex}-${status}`}
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
                      <Skeleton
                        variant="rounded"
                        height={rowIndex % 2 === 0 ? 60 : 42}
                        sx={{ borderRadius: 1 }}
                      />
                      {rowIndex % 2 === 0 ? <Skeleton variant="rounded" height={42} sx={{ borderRadius: 1 }} /> : null}
                    </Box>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
