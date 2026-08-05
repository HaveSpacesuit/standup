import { Box, CircularProgress, Skeleton, Typography } from '@mui/material'
import type { StatusColumn } from '../utils/statusColumnStyles'

type KanbanBoardLoadingStateProps = {
  boardGridTemplate: string
  statusColumns: readonly StatusColumn[]
  getStatusColumnBackground: (status: StatusColumn, columnIndex: number) => string
}

export function KanbanBoardLoadingState({
  boardGridTemplate,
  statusColumns,
  getStatusColumnBackground,
}: KanbanBoardLoadingStateProps) {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        borderTop: '1px solid',
        borderColor: 'divider',
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

      <Box sx={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
        <Box sx={{ minWidth: 1220, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: boardGridTemplate,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ px: 2, py: 1.5 }}>
              <Skeleton variant="text" width={110} height={20} />
            </Box>

            {statusColumns.map((status, columnIndex) => (
              <Box
                key={`loading-header-${status}`}
                sx={{
                  px: 2,
                  py: 1.5,
                  backgroundImage: getStatusColumnBackground(status, columnIndex),
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Skeleton variant="text" width={58} height={20} />
                  <Skeleton variant="rounded" width={30} height={18} />
                </Box>
              </Box>
            ))}
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {Array.from({ length: 4 }).map((_, rowIndex) => (
              <Box
                key={`loading-row-${rowIndex}`}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: boardGridTemplate,
                  flex: 1,
                  minHeight: 98,
                }}
              >
                <Box
                  sx={{
                    px: 1.5,
                    py: 1.25,
                    borderBottom: '1px solid',
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
                      pl: 1,
                      pr: 2,
                      py: 1,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      minHeight: 92,
                      height: '100%',
                      backgroundImage: getStatusColumnBackground(status, columnIndex),
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
