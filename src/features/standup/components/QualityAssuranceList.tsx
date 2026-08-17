import { Box, Card, CardContent, Typography } from '@mui/material'
import { CardListLoadingState } from './CardListLoadingState'
import { WorkItemCard } from './WorkItemCard'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'

type QualityAssuranceListProps = {
  isLoading: boolean
  error: string | null
  buckets: QualityAssuranceBucket[]
}

export function QualityAssuranceList({ isLoading, error, buckets }: QualityAssuranceListProps) {
  if (isLoading) {
    return <CardListLoadingState />
  }

  if (error) {
    return (
      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          bgcolor: 'background.paper',
        }}
      >
        <Card sx={{ width: '100%', maxWidth: 560 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="headline-sm" render={<h1 />} sx={{ fontWeight: 700, mb: 1 }}>
              Unable to load QA activity
            </Typography>
            <Typography variant="body-sm" color="text.secondary">
              {error}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    )
  }

  const totalItems = buckets.reduce((count, bucket) => count + bucket.items.length, 0)

  if (totalItems === 0) {
    return (
      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          bgcolor: 'background.paper',
        }}
      >
        <Card sx={{ width: '100%', maxWidth: 560 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="headline-sm" render={<h1 />} sx={{ fontWeight: 700, mb: 1 }}>
              No QA items
            </Typography>
            <Typography variant="body-sm" color="text.secondary">
              No recently discovered items matched the QA buckets for this team.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    )
  }

  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        p: 2,
        bgcolor: 'background.default',
      }}
    >
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
        {buckets.map((bucket) => (
          <Card
            key={bucket.id}
            sx={{
              minWidth: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <CardContent
              sx={{
                p: 1.5,
                pb: 1.25,
                flex: '0 0 auto',
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="body-md" sx={{ fontWeight: 700 }}>
                  {bucket.title}
                </Typography>
                <Typography variant="body-sm" color="text.secondary" sx={{ fontWeight: 700, flex: '0 0 auto' }}>
                  {bucket.items.length}
                </Typography>
              </Box>
            </CardContent>

            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                p: 1.25,
                display: 'grid',
                gap: 1,
                alignContent: 'start',
                bgcolor: 'background.default',
              }}
            >
              {bucket.items.map((item) => (
                <Box key={item.id}>
                  <WorkItemCard item={item} />
                </Box>
              ))}
            </Box>
          </Card>
        ))}
      </Box>
    </Box>
  )
}
