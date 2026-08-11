import { Badge, Card, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import type { ReactNode } from 'react'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import {
  getIconUrlWithThemeColorValue,
  getWorkItemIconUrlWithThemeColor,
} from '../utils/workItemIconColor'
import { PullRequestMetaRow } from './PullRequestMetaRow'
import { WorkItemTags } from './WorkItemTags'
import {
  buildTagLayout,
  getPullRequestReviewIcon,
  getStatusPaletteKey,
  getTagBudget,
} from './workItemCardDisplay'

type WorkItemCardProps = {
  item: WorkItemSummary
  highlightState?: WorkItemCardHighlightState
  footer?: ReactNode
}

export type WorkItemCardHighlightState = 'new' | 'stale' | 'none'

export function WorkItemCard({ item, highlightState = 'none', footer }: WorkItemCardProps) {
  const theme = useTheme()
  const statusPaletteKey = getStatusPaletteKey(item.status)
  const statusColor = theme.palette[statusPaletteKey].main
  const isNew = highlightState === 'new'
  const isStale = highlightState === 'stale'
  const newGlow = `0 0 0 1px color-mix(in srgb, ${statusColor} 72%, transparent), 0 0 14px color-mix(in srgb, ${statusColor} 42%, transparent)`
  const newBackground = `color-mix(in srgb, ${statusColor} 8%, ${theme.palette.background.paper})`
  const cardShadow = isNew ? newGlow : undefined
  const hoverShadow = isNew
    ? `0 0 0 1px color-mix(in srgb, ${statusColor} 82%, transparent), 0 0 18px color-mix(in srgb, ${statusColor} 52%, transparent)`
    : undefined
  const pullRequest = item.kind === 'pull-request' ? item.pullRequest : undefined
  const isPullRequestOnly = Boolean(pullRequest)
  const primaryLinkUrl = pullRequest?.url ?? item.workItemUrl
  const primaryLinkLabel = pullRequest?.title ?? item.title
  const primaryLinkNumber = pullRequest?.id ?? item.id
  const primaryIconUrl = pullRequest?.iconUrl ?? item.workItemIconUrl
  const primaryReviewIcon = pullRequest
    ? getPullRequestReviewIcon(pullRequest.reviewState)
    : undefined
  const sortedTags = [...(item.tags ?? [])].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  )
  const tagBudget = getTagBudget(item.sprintName)
  const tagLayout = buildTagLayout(sortedTags, tagBudget)

  return (
    <Card
      elevation={2}
      sx={{
        position: 'relative',
        p: 1,
        border: '1px solid',
        borderColor: statusColor,
        borderRadius: 1,
        bgcolor: isNew ? newBackground : 'background.paper',
        overflow: 'visible',
        transition: 'box-shadow 120ms ease, border-color 120ms ease, opacity 120ms ease, filter 120ms ease',
        boxShadow: cardShadow,
        opacity: isStale ? 0.68 : 1,
        filter: isStale ? 'saturate(0.78)' : 'none',
        '&:hover': {
          boxShadow: hoverShadow ?? 4,
          borderColor: statusColor,
          opacity: 1,
          filter: 'none',
        },
        '&:focus-within': {
          boxShadow: hoverShadow ?? 4,
          borderColor: statusColor,
          opacity: 1,
          filter: 'none',
        },
        width: '100%',
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
        }}
      >
        {typeof item.effort === 'number' ? (
          <Box
            component="span"
            sx={{
              float: 'right',
              ml: 0.75,
              mt: 0.125,
              lineHeight: 0,
            }}
          >
            <Badge
              badgeContent={item.effort}
              color={statusPaletteKey}
              max={999}
              inline
              size="small"
              showZero
            >
              <Box sx={{ width: 0, height: 0 }} />
            </Badge>
          </Box>
        ) : null}

        <Box
          component="a"
          href={primaryLinkUrl}
          target="_blank"
          rel="noreferrer noopener"
          sx={{
            display: 'block',
            minWidth: 0,
            mb: 'calc(1.2 * var(--stratakit-mui-spacing))',
            color: 'text.primary',
            textDecoration: 'none',
            '&:hover': {
              textDecoration: 'underline',
            },
          }}
        >
          {primaryReviewIcon ? (
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
                color: primaryReviewIcon.color,
              }}
              aria-label={primaryReviewIcon.label}
            >
              {Array.from({ length: Math.min(primaryReviewIcon.count ?? 1, 2) }).map((_, index) => (
                <Icon key={`${primaryReviewIcon.label}-${index}`} href={primaryReviewIcon.href} size="regular" />
              ))}
            </Box>
          ) : null}

          <Typography
            variant="body-sm"
            sx={{
              lineHeight: 1.25,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {primaryIconUrl ? (
              <Box
                component="img"
                src={
                  isPullRequestOnly
                    ? getIconUrlWithThemeColorValue(primaryIconUrl, statusColor)
                    : getWorkItemIconUrlWithThemeColor(
                        primaryIconUrl,
                        item.workItemType,
                        theme.palette,
                      )
                }
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
                fontWeight: 700,
                color: statusColor,
                mr: 0.5,
              }}
            >
              {primaryLinkNumber}
            </Box>
            <Box component="span" sx={{ fontWeight: 400 }}>
              {primaryLinkLabel}
            </Box>
          </Typography>
        </Box>

        {!isPullRequestOnly && (item.activePullRequests?.length ?? 0) > 0 ? (
          <Box sx={{ clear: 'both' }}>
            {item.activePullRequests?.map((pullRequest) => {
              const reviewIcon = getPullRequestReviewIcon(pullRequest.reviewState)

              return (
                <Box
                  key={pullRequest.id}
                  component="a"
                  href={pullRequest.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  sx={{
                    display: 'block',
                    mt: 0.2,
                    color: 'text.secondary',
                    textDecoration: 'none',
                    '&:hover': {
                      textDecoration: 'underline',
                    },
                  }}
                >
                  {reviewIcon ? (
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
                  ) : null}

                  <Typography
                    component="span"
                    variant="body-sm"
                    sx={{
                      fontSize: 10,
                      lineHeight: 1.2,
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                    }}
                  >
                    {pullRequest.iconUrl ? (
                      <Box
                        component="img"
                        src={getIconUrlWithThemeColorValue(pullRequest.iconUrl, statusColor)}
                        alt="PR"
                        sx={{
                          width: 12,
                          height: 12,
                          display: 'inline-block',
                          verticalAlign: 'text-bottom',
                          mr: 0.5,
                        }}
                      />
                    ) : null}
                    {pullRequest.id} {pullRequest.title}
                  </Typography>
                </Box>
              )
            })}
          </Box>
        ) : null}

        {isPullRequestOnly ? <PullRequestMetaRow item={item} /> : null}

        <WorkItemTags tagLayout={tagLayout} sprintName={item.sprintName} />

        {footer ? (
          <Box
            sx={{
              mt: 0.7,
              pt: 0.6,
              borderTop: '1px solid',
              borderColor: 'divider',
              clear: 'both',
            }}
          >
            {footer}
          </Box>
        ) : null}
      </Box>
    </Card>
  )
}
