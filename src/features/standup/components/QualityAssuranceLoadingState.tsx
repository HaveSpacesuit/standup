import { Box, Card, CardContent, CircularProgress, Skeleton, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  getQaBucketAccentColor,
  getQaColumnBackground,
  getQaColumnBorderColor,
  getQaHeaderBackground,
  QUALITY_ASSURANCE_BUCKET_ORDER,
} from '../utils/qualityAssuranceColumnStyles'

type QualityAssuranceLoadingStateProps = {
  colorScheme: 'light' | 'dark'
}

const LOADING_COLUMN_LAYOUT: ReadonlyArray<{ titleWidth: number; cardCount: number }> = [
  { titleWidth: 96, cardCount: 4 },
  { titleWidth: 84, cardCount: 3 },
  { titleWidth: 108, cardCount: 2 },
  { titleWidth: 132, cardCount: 3 },
]

export function QualityAssuranceLoadingState({ colorScheme }: QualityAssuranceLoadingStateProps) {
  const theme = useTheme()

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
            Loading QA activity...
          </Typography>
          <Typography variant="body-sm" color="text.secondary">
            Fetching newly added, ready for QA, needs follow-up, and recently completed items.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
        <Box
          sx={{
            maxWidth: 1600,
            mx: 'auto',
            display: 'grid',
            gap: 1.5,
            alignContent: 'start',
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(2, minmax(0, 1fr))',
              xl: 'repeat(4, minmax(0, 1fr))',
            },
          }}
        >
          {QUALITY_ASSURANCE_BUCKET_ORDER.map((bucketId, columnIndex) => {
            const layout = LOADING_COLUMN_LAYOUT[columnIndex]
            const accentColor = getQaBucketAccentColor(bucketId, theme.palette)

            return (
              <Card
                key={`qa-loading-column-${bucketId}`}
                sx={{
                  minWidth: 0,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px solid',
                  borderColor: getQaColumnBorderColor(accentColor, colorScheme),
                }}
              >
                <CardContent
                  sx={{
                    p: 1.5,
                    pb: 1.25,
                    flex: '0 0 auto',
                    borderBottom: '1px solid',
                    borderColor: getQaColumnBorderColor(accentColor, colorScheme),
                    bgcolor: getQaHeaderBackground(accentColor, colorScheme),
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 4,
                        alignSelf: 'stretch',
                        minHeight: 18,
                        borderRadius: 999,
                        bgcolor: accentColor,
                        flex: '0 0 auto',
                      }}
                    />
                    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, flex: 1, minWidth: 0 }}>
                      <Skeleton variant="text" width={layout.titleWidth} height={22} />
                      <Skeleton variant="rounded" width={18} height={16} />
                    </Box>
                  </Box>
                </CardContent>

                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    p: 1.25,
                    display: 'grid',
                    gap: 1,
                    alignContent: 'start',
                    bgcolor: getQaColumnBackground(accentColor, colorScheme),
                  }}
                >
                  {Array.from({ length: layout.cardCount }).map((_, cardIndex) => (
                    <Box
                      key={`qa-loading-card-${bucketId}-${cardIndex}`}
                      sx={{
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        p: 1,
                        bgcolor: 'background.paper',
                        display: 'grid',
                        gap: 0.6,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Skeleton variant="rounded" width={14} height={14} />
                        <Skeleton variant="text" width="72%" height={16} />
                      </Box>
                      <Skeleton variant="text" width="88%" height={16} />
                      {cardIndex % 2 === 0 ? (
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
                          <Skeleton variant="rounded" width={44} height={16} />
                          <Skeleton variant="rounded" width={32} height={16} />
                        </Box>
                      ) : null}
                    </Box>
                  ))}
                </Box>
              </Card>
            )
          })}
        </Box>
      </Box>
    </Box>
  )
}
