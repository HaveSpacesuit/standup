import { Box, CircularProgress, Skeleton, Typography } from '@mui/material'

const SKELETON_ROW_COUNT = 8
const MAP_SKELETON_ROW_COUNT = 6
const RIBBON_SKELETON_WIDTHS = [96, 120, 260, 220, 150]
const CHIP_SKELETON_WIDTHS = [150, 130, 190, 90, 140]

const stripSx = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  px: 2,
  borderBottom: '1px solid',
  borderColor: 'divider',
} as const

/** The summary ribbon and Needs attention bar, as placeholders, so the page keeps its shape while the bugs load. */
function SummarySkeleton() {
  return (
    <Box aria-hidden="true" data-backlog-summary-skeleton="">
      <Box sx={{ ...stripSx, height: 44, gap: 2 }}>
        {RIBBON_SKELETON_WIDTHS.map((width, index) => (
          <Skeleton key={`ribbon-${index}`} variant="text" width={width} />
        ))}
      </Box>
      <Box sx={{ ...stripSx, py: 0.75, gap: 0.75 }}>
        <Skeleton variant="text" width={110} sx={{ mr: 0.5 }} />
        {CHIP_SKELETON_WIDTHS.map((width, index) => (
          <Skeleton key={`chip-${index}`} variant="rounded" width={width} height={24} sx={{ borderRadius: 999 }} />
        ))}
      </Box>
    </Box>
  )
}

/** The Value map's plot and side panel, as placeholders. */
function MapSkeleton() {
  return (
    <Box
      aria-hidden="true"
      data-backlog-map-skeleton=""
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 340px',
      }}
    >
      <Box sx={{ p: 2, pl: 7, pb: 6, minWidth: 0, display: 'flex' }}>
        <Skeleton variant="rounded" sx={{ flex: 1, height: 'auto' }} />
      </Box>
      <Box sx={{ borderLeft: '1px solid', borderColor: 'divider', p: 1.5, display: 'grid', gap: 1, alignContent: 'start' }}>
        <Skeleton variant="text" width={140} />
        <Skeleton variant="text" width="90%" />
        <Skeleton variant="text" width="70%" sx={{ mb: 1 }} />
        {Array.from({ length: MAP_SKELETON_ROW_COUNT }).map((_, index) => (
          <Skeleton key={`backlog-map-loading-row-${index}`} variant="rounded" height={52} />
        ))}
      </Box>
    </Box>
  )
}

/** Shaped like the view it stands in for: rows for the list, or the plot and side panel for the Value map. */
export function BacklogLoadingState({ view = 'list' }: { view?: 'list' | 'map' }) {
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
      <SummarySkeleton />
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

      {view === 'map' ? <MapSkeleton /> : (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2, display: 'grid', gap: 1, alignContent: 'start' }}>
          {Array.from({ length: SKELETON_ROW_COUNT }).map((_, index) => (
            <Skeleton key={`backlog-loading-row-${index}`} variant="rounded" height={28} />
          ))}
        </Box>
      )}
    </Box>
  )
}
