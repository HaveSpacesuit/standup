import { Card, CardContent, Typography } from '@mui/material'

export function PatMissingNotice() {
  return (
    <Card
      sx={{
        mb: 2,
        border: '1px solid',
        borderColor: 'warning.outline',
        bgcolor: 'warning.background',
      }}
    >
      <CardContent>
        <Typography variant="body-md" sx={{ fontWeight: 700 }}>
          Azure DevOps PAT: Missing
        </Typography>
        <Typography variant="body-sm" color="text.secondary">
          Open Settings and add your Azure DevOps PAT to load dashboard data.
        </Typography>
      </CardContent>
    </Card>
  )
}
