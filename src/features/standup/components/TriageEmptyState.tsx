import type { ReactNode } from 'react'
import { Box, Card, CardContent, Typography } from '@mui/material'

type TriageEmptyStateProps = {
  heading: string
  message: string
  /** An optional control under the message, such as a button that opens Triage options. */
  action?: ReactNode
}

/** A centered card, like Backlog's "No open bugs", for a Triage queue with nothing to show. */
export function TriageEmptyState({ heading, message, action }: TriageEmptyStateProps) {
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
            {heading}
          </Typography>
          <Typography variant="body-sm" color="text.secondary">
            {message}
          </Typography>
          {action ? <Box sx={{ mt: 2 }}>{action}</Box> : null}
        </CardContent>
      </Card>
    </Box>
  )
}
