import { Badge, Card, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { getWorkItemIconUrlWithThemeColor } from '../utils/workItemIconColor'
import { WorkItemTags } from './WorkItemTags'
import { PullRequestSection } from './PullRequestSection'
import {
  buildTagLayout,
  getStatusPaletteKey,
  getTagBudget,
} from './workItemCardDisplay'

type WorkItemCardProps = {
  item: WorkItemSummary
  highlightState?: WorkItemCardHighlightState
}

export type WorkItemCardHighlightState = 'new' | 'stale' | 'none'

export function WorkItemCard({ item, highlightState = 'none' }: WorkItemCardProps) {
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

  const pullRequestOnly = item.kind === 'pull-request' ? item.pullRequest : undefined
  const isPullRequestOnly = Boolean(pullRequestOnly)
  const linkedPullRequests = isPullRequestOnly ? [] : (item.activePullRequests ?? [])
  const hasLinkedPullRequests = linkedPullRequests.length > 0

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
        {typeof item.effort === 'number' && !isPullRequestOnly ? (
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

        {isPullRequestOnly && pullRequestOnly ? (
          <PullRequestSection pullRequest={pullRequestOnly} statusColor={statusColor} emphasizeTitle />
        ) : (
          <>
            <Box
              component="a"
              href={item.workItemUrl}
              target="_blank"
              rel="noreferrer noopener"
              sx={{
                display: 'block',
                minWidth: 0,
                color: 'text.primary',
                textDecoration: 'none',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
            >
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
                {item.workItemIconUrl ? (
                  <Box
                    component="img"
                    src={getWorkItemIconUrlWithThemeColor(
                      item.workItemIconUrl,
                      item.workItemType,
                      theme.palette,
                    )}
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
                  {item.id}
                </Box>
                <Box component="span" sx={{ fontWeight: 400 }}>
                  {item.title}
                </Box>
              </Typography>
            </Box>

            {hasLinkedPullRequests ? (
              <Box
                sx={{
                  clear: 'both',
                  mt: 0.7,
                  pt: 0.6,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'grid',
                  gap: 0.8,
                }}
              >
                {linkedPullRequests.map((pullRequest) => (
                  <PullRequestSection
                    key={pullRequest.id}
                    pullRequest={pullRequest}
                    statusColor={statusColor}
                  />
                ))}
              </Box>
            ) : null}

            <WorkItemTags tagLayout={tagLayout} sprintName={item.sprintName} />
          </>
        )}
      </Box>
    </Card>
  )
}
