import { Box, Card, CardContent, Typography } from '@mui/material'
import { AdoErrorNotice } from './AdoErrorNotice'
import { BacklogLoadingState } from './BacklogLoadingState'
import { BacklogTable } from './BacklogTable'
import type { RankedBacklogBug } from '../utils/backlogValue'

type BacklogListProps = {
  isLoading: boolean
  error: string | null
  /** The bugs to list, already narrowed by the quick filter. */
  bugs: RankedBacklogBug[]
  /** The number of open bugs before the quick filter. */
  totalBugCount: number
}

export function BacklogList({ isLoading, error, bugs, totalBugCount }: BacklogListProps) {
  if (isLoading) {
    return <BacklogLoadingState />
  }

  if (error) {
    return (
      <Box component="main" sx={{ flex: 1, minHeight: 0, bgcolor: 'background.paper' }}>
        <AdoErrorNotice title="Unable to load backlog" message={error} />
      </Box>
    )
  }

  if (bugs.length === 0 && totalBugCount > 0) {
    return (
      <Box component="main" sx={{ flex: 1, minHeight: 0, bgcolor: 'background.paper' }}>
        <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
          No bugs match the quick filter. Clear it to see all open bugs.
        </Typography>
      </Box>
    )
  }

  if (bugs.length === 0) {
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
            <Typography variant="headline-sm" render={<h2 />} sx={{ fontWeight: 700, mb: 1 }}>
              No open bugs
            </Typography>
            <Typography variant="body-sm" color="text.secondary">
              No bugs outside a closed, done, or removed state were found for this team.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    )
  }

  return <BacklogTable bugs={bugs} />
}
