import { Box, Tooltip, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import type { WorkItemPullRequestSummary } from '../../../ado/queryEngine'
import { getIconUrlWithThemeColorValue } from '../utils/workItemIconColor'
import { getPullRequestReviewIcon } from './workItemCardDisplay'
import { PullRequestChecksRow } from './PullRequestChecksRow'

type PullRequestSectionProps = {
  pullRequest: WorkItemPullRequestSummary
  statusColor: string
  emphasizeTitle?: boolean
}

export function PullRequestSection({ pullRequest, statusColor, emphasizeTitle = false }: PullRequestSectionProps) {
  const reviewIcon = getPullRequestReviewIcon(pullRequest.reviewState)

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        component="a"
        href={pullRequest.url}
        target="_blank"
        rel="noreferrer noopener"
        sx={{
          display: 'block',
          minWidth: 0,
          color: emphasizeTitle ? 'text.primary' : 'text.secondary',
          textDecoration: 'none',
          borderRadius: 1,
          '&:hover': {
            textDecoration: 'underline',
          },
        }}
      >
        {reviewIcon ? (
          <Tooltip
            title={reviewIcon.label}
            arrow
          >
            <Box
              component="span"
              sx={{
                float: 'right',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.2,
                ml: 0.5,
                mt: 0.1,
                lineHeight: 0,
                color: reviewIcon.color,
              }}
              aria-label={reviewIcon.label}
            >
              {Array.from({ length: Math.min(reviewIcon.count ?? 1, 2) }).map((_, index) => (
                <Icon key={`${reviewIcon.label}-${index}`} href={reviewIcon.href} size="regular" />
              ))}
            </Box>
          </Tooltip>
        ) : null}

        <Typography
          variant="body-sm"
          sx={{
            lineHeight: 1.25,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: emphasizeTitle ? 3 : 2,
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {pullRequest.iconUrl ? (
            <Box
              component="img"
              src={getIconUrlWithThemeColorValue(pullRequest.iconUrl, statusColor)}
              alt=""
              sx={{
                width: 14,
                height: 14,
                display: 'inline-block',
                verticalAlign: 'text-bottom',
                mr: 0.5,
              }}
            />
          ) : null}
          <Box
            component="span"
            sx={{
              fontWeight: 400,
              color: statusColor,
              mr: 0.5,
            }}
          >
            {pullRequest.id}
          </Box>
          <Box component="span" sx={{ fontWeight: 400 }}>
            {pullRequest.title}
          </Box>
        </Typography>
      </Box>

      <PullRequestChecksRow pullRequest={pullRequest} />
    </Box>
  )
}
