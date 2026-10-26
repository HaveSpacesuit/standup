import { useId } from 'react'
import { Box, Card, CardContent, Typography } from '@mui/material'
import { isAdoAuthErrorMessage } from '../hooks/queryErrors'

type AdoErrorNoticeProps = {
  title: string
  message: string
}

export function AdoErrorNotice({ title, message }: AdoErrorNoticeProps) {
  const isAuthError = isAdoAuthErrorMessage(message)
  const titleId = useId()
  const messageId = useId()

  return (
    <Box
      component="section"
      role="alert"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 560,
          border: '1px solid',
          borderColor: isAuthError ? 'warning.outline' : 'divider',
          bgcolor: isAuthError ? 'warning.background' : 'background.paper',
        }}
      >
        <CardContent sx={{ p: 3 }}>
          <Typography id={titleId} variant="body-md" sx={{ fontWeight: 700, mb: 1 }} color={isAuthError ? undefined : 'error.main'}>
            {isAuthError ? 'Azure DevOps PAT: Invalid or expired' : title}
          </Typography>
          <Typography id={messageId} variant="body-sm" color="text.secondary">
            {message}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
