import { Box, Card, CardContent, Typography } from '@mui/material'

type TeamConfigurationEmptyStateProps = {
  pageLabel: string
}

export function TeamConfigurationEmptyState({ pageLabel }: TeamConfigurationEmptyStateProps) {
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
      <Card sx={{ width: '100%', maxWidth: 640 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="headline-sm" render={<h1 />} sx={{ fontWeight: 700, mb: 1 }}>
            Configure at least one team
          </Typography>
          <Typography variant="body-sm" color="text.secondary">
            {pageLabel} needs a team profile to load data. Open Settings {'>'} Teams, then add a team or use
            &ldquo;Import team data&rdquo;.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
