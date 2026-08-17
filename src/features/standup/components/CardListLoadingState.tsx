import { Box, Card, CardContent, CircularProgress, Skeleton, Typography } from '@mui/material'

export function CardListLoadingState() {
  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        minHeight: 0,
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
            Loading...
          </Typography>
          <Typography variant="body-sm" color="text.secondary">
            Fetching the latest items.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
        <Box sx={{ maxWidth: 640, mx: 'auto', display: 'grid', gap: 3, alignContent: 'start' }}>
          {Array.from({ length: 4 }).map((_, sectionIndex) => (
            <Box key={`loading-section-${sectionIndex}`}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                <Skeleton variant="text" width={140} height={22} />
                <Skeleton variant="rounded" width={18} height={16} />
              </Box>

              <Box sx={{ display: 'grid', gap: 1 }}>
                {Array.from({ length: 1 }).map((_, rowIndex) => (
                  <Card key={`loading-card-${sectionIndex}-${rowIndex}`} sx={{ borderRadius: 2 }}>
                    <CardContent sx={{ p: 1.5 }}>
                      <Box sx={{ display: 'grid', gap: 0.9 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Skeleton variant="text" width="66%" height={22} />
                          <Skeleton variant="rounded" width={54} height={18} />
                        </Box>
                        <Skeleton variant="text" width="92%" height={16} />
                        <Skeleton variant="text" width="40%" height={16} />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
                          <Skeleton variant="circular" width={16} height={16} />
                          <Skeleton variant="text" width={120} height={16} />
                        </Box>
                      </Box>
                    </CardContent>
                    <Box
                      sx={{
                        px: 1.5,
                        py: 0.9,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Skeleton variant="text" width="55%" height={14} />
                      <Skeleton variant="text" width={52} height={14} />
                    </Box>
                  </Card>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
