import { Box, Card, CardContent, Typography } from '@mui/material'
import { PullRequestsLoadingState } from './PullRequestsLoadingState'
import { WorkItemCard } from './WorkItemCard'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'

type QualityAssuranceListProps = {
  isLoading: boolean
  error: string | null
  buckets: QualityAssuranceBucket[]
}

export function QualityAssuranceList({ isLoading, error, buckets }: QualityAssuranceListProps) {
  if (isLoading) {
    return <PullRequestsLoadingState />
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
      <Box sx={{ maxWidth: 760, mx: 'auto', display: 'grid', gap: 3, alignContent: 'start' }}>
        {buckets.map((bucket) => (
          <Box key={bucket.id}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
              <Typography variant="body-md" sx={{ fontWeight: 700 }}>
                {bucket.title}
              </Typography>
              <Typography variant="body-sm" color="text.secondary" sx={{ fontWeight: 700, flex: '0 0 auto' }}>
                {bucket.items.length}
              </Typography>
            </Box>

            <Box sx={{ display: 'grid', gap: 1 }}>
              {bucket.items.map((item) => (
                <Box key={item.id}>
                  <WorkItemCard item={item} />
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
