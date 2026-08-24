import { Box, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import type { WorkItemPullRequestSummary } from '../../../ado/queryEngine'
import { getChecksPresentation } from './pullRequestChecksPresentation'

type PullRequestChecksRowProps = {
  pullRequest: WorkItemPullRequestSummary
}

function formatAge(value: string | undefined): string {
  if (!value) {
    return ''
  }

  const openedAt = Date.parse(value)
  if (Number.isNaN(openedAt)) {
    return ''
  }

  const elapsedHours = Math.floor(Math.max(Date.now() - openedAt, 0) / (1000 * 60 * 60))
  if (elapsedHours === 0) {
    return 'Just now'
  }

  if (elapsedHours < 24) {
    return `${elapsedHours}h old`
  }

  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 14) {
    return `${elapsedDays}d old`
  }

  return `${Math.floor(elapsedDays / 7)}w old`
}

export function PullRequestChecksRow({ pullRequest }: PullRequestChecksRowProps) {
  const checks = getChecksPresentation(pullRequest.checks)
  const age = pullRequest.status === 'completed' ? '' : formatAge(pullRequest.recentActivityAt)

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, minWidth: 0, mt: 0.7 }}>
      <Box sx={{ display: 'grid', gap: 0.35, minWidth: 0, flex: '1 1 auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: checks.color, minWidth: 0 }}>
          <Icon href={checks.iconHref} size="regular" />
          {checks.text ? (
            <Typography
              variant="body-sm"
              color="inherit"
              sx={{
                fontSize: 11,
                fontWeight: 400,
                lineHeight: 1.2,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {checks.text}
            </Typography>
          ) : (
            <Typography
              variant="body-sm"
              color="inherit"
              sx={{ fontSize: 11, fontWeight: 400, lineHeight: 1.2 }}
            >
              Required checks passing
            </Typography>
          )}
        </Box>
        {checks.optionalItems.map((optionalItem) => (
          <Box
            key={`${pullRequest.id}:${optionalItem.text}`}
            sx={{
              minWidth: 0,
              pl: 2.4,
            }}
          >
            <Typography
              variant="body-sm"
              color={optionalItem.color}
              sx={{
                fontSize: 11,
                lineHeight: 1.2,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {optionalItem.text}
            </Typography>
          </Box>
        ))}
      </Box>
      {age ? (
        <Typography
          variant="body-sm"
          sx={{
            flex: '0 0 auto',
            fontSize: 10,
            lineHeight: 1.1,
            color: 'text.secondary',
            opacity: 0.85,
            whiteSpace: 'nowrap',
            alignSelf: 'center',
          }}
        >
          {age}
        </Typography>
      ) : null}
    </Box>
  )
}
