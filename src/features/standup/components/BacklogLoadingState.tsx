import { Box, CircularProgress, Skeleton, Typography } from '@mui/material'

const SKELETON_ROW_COUNT = 8

export function BacklogLoadingState() {
  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        role="status"
        sx={{
          px: 2,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <CircularProgress size={18} />
        <Box>
          <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
            Loading backlog...
          </Typography>
          <Typography variant="body-sm" color="text.secondary">
            Fetching open bugs and ranking them by value.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2, display: 'grid', gap: 1, alignContent: 'start' }}>
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
          <Skeleton key={`backlog-loading-row-${index}`} variant="rounded" height={28} />
        ))}
      </Box>
    </Box>
  )
}
