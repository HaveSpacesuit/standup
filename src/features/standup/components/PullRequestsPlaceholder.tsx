import { Box, Card, CardContent, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgGitBranch from '@stratakit/icons/git-branch.svg'

export function PullRequestsPlaceholder() {
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
            <Icon href={svgGitBranch} size="large" />
            <Typography variant="headline-sm" render={<h1 />} sx={{ fontWeight: 700 }}>
              Pull Requests
            </Typography>
          </Box>

          <Typography variant="body-md" sx={{ mb: 0.75 }}>
            This view is ready for the open pull request experience, but the page content has not been built yet.
          </Typography>
          <Typography variant="body-sm" color="text.secondary">
            Team selection and navigation are now shared with the Standup page, so the next step can focus on PR-specific data and layout.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
