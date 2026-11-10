import type { ReactNode } from 'react'
import { Box, Card, CardContent, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'

type TriageEmptyStateProps = {
  heading: string
  message: string
  /** Muted text under the message, such as the rules a clear queue was checked against. */
  detail?: string
  /** A large icon beside the heading, colored by `iconColor`. */
  iconHref?: string
  iconColor?: string
  /** An optional control under the message, such as a button that opens Triage options. */
  action?: ReactNode
}

/** A centered card, like Backlog's "No open bugs", for a Triage queue with nothing to show. */
export function TriageEmptyState({ heading, message, detail, iconHref, iconColor, action }: TriageEmptyStateProps) {
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
        <CardContent sx={{ p: 3, display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          {iconHref ? <Icon href={`${iconHref}#icon-large`} size="large" style={{ color: iconColor, flexShrink: 0 }} /> : null}
          <div>
            <Typography variant="headline-sm" render={<h2 />} sx={{ fontWeight: 700, mb: 1 }}>
              {heading}
            </Typography>
            <Typography variant="body-sm" color="text.secondary">
              {message}
            </Typography>
            {detail ? (
              <Typography variant="body-sm" sx={{ mt: 1, color: 'var(--stratakit-color-text-neutral-tertiary)' }}>{detail}</Typography>
            ) : null}
            {action ? <Box sx={{ mt: 2 }}>{action}</Box> : null}
          </div>
        </CardContent>
      </Card>
    </Box>
  )
}
