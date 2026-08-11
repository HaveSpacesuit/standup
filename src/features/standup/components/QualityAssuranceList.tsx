import { Box, Card, CardContent, Typography } from '@mui/material'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { PullRequestsLoadingState } from './PullRequestsLoadingState'
import { WorkItemCard } from './WorkItemCard'

type QualityAssuranceListProps = {
  isLoading: boolean
  error: string | null
  newItems: WorkItemSummary[]
}

export function QualityAssuranceList({ isLoading, error, newItems }: QualityAssuranceListProps) {
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

  if (newItems.length === 0) {
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
              No new QA items
            </Typography>
            <Typography variant="body-sm" color="text.secondary">
              No recently added work items matched the New, Approved, or Triage criteria for this team.
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
      <Box sx={{ maxWidth: 640, mx: 'auto', display: 'grid', gap: 3, alignContent: 'start' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
            <Typography variant="body-md" sx={{ fontWeight: 700 }}>
              New
            </Typography>
            <Typography variant="body-sm" color="text.secondary" sx={{ fontWeight: 700, flex: '0 0 auto' }}>
              {newItems.length}
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gap: 1 }}>
            {newItems.map((item) => (
              <Box key={item.id}>
                <WorkItemCard item={item} />
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
