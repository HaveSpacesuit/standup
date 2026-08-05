import { Badge, Card, Chip, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgStatusPending from '@stratakit/icons/status-pending.svg'
import svgStatusRejected from '@stratakit/icons/status-rejected.svg'
import svgStatusSuccess from '@stratakit/icons/status-success.svg'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import {
  getIconUrlWithThemeColorValue,
  getWorkItemIconUrlWithThemeColor,
} from '../utils/workItemIconColor'

type WorkItemCardProps = {
  item: WorkItemSummary
}

type StatusPaletteKey = 'error' | 'info' | 'primary' | 'warning' | 'success'

type TagLayout = {
  visibleTags: string[]
  hiddenCount: number
}

const TAG_ROW_UNIT_BUDGET = 34
const TAG_BASE_UNITS = 5
const TAG_PER_CHAR_UNITS = 1
const TAG_MIN_VISIBLE = 1

function buildTagLayout(tags: string[], budget: number): TagLayout {
  if (tags.length === 0) {
    return { visibleTags: [], hiddenCount: 0 }
  }

  const visibleTags: string[] = []
  let usedUnits = 0

  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index]
    const chipUnits = TAG_BASE_UNITS + Math.min(tag.length, 20) * TAG_PER_CHAR_UNITS
    const remainingCount = tags.length - (index + 1)
    const reservedOverflowUnits = remainingCount > 0 ? 8 : 0
    const canFit = usedUnits + chipUnits + reservedOverflowUnits <= budget

    if (canFit || visibleTags.length < TAG_MIN_VISIBLE) {
      visibleTags.push(tag)
      usedUnits += chipUnits
      continue
    }

    break
  }

  return {
    visibleTags,
    hiddenCount: Math.max(tags.length - visibleTags.length, 0),
  }
}

function getStatusPaletteKey(status: WorkItemSummary['status']): StatusPaletteKey {
  switch (status) {
    case 'Blocked':
      return 'error'
    case 'New':
      return 'info'
    case 'Active':
      return 'primary'
    case 'Review':
      return 'warning'
    case 'Done':
      return 'success'
  }
}

function getPullRequestReviewIcon(
  reviewState: 'rejected' | 'waiting-for-author' | 'partially-approved' | 'fully-approved' | undefined,
): { href: string; color: string; label: string; count?: number } | undefined {
  switch (reviewState) {
    case 'rejected':
      return {
        href: svgStatusRejected,
        color: 'error.main',
        label: 'Rejected',
        count: 1,
      }
    case 'waiting-for-author':
      return {
        href: svgStatusPending,
        color: 'warning.main',
        label: 'Waiting for author',
        count: 1,
      }
    case 'partially-approved':
      return {
        href: svgStatusSuccess,
        color: 'success.main',
        label: 'Partially approved',
        count: 1,
      }
    case 'fully-approved':
      return {
        href: svgStatusSuccess,
        color: 'success.main',
        label: 'Fully approved',
        count: 2,
      }
    default:
      return undefined
  }
}

export function WorkItemCard({ item }: WorkItemCardProps) {
  const theme = useTheme()
  const statusPaletteKey = getStatusPaletteKey(item.status)
  const statusColor = theme.palette[statusPaletteKey].main
  const sortedTags = [...(item.tags ?? [])].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  )
  const tagBudget = Math.max(TAG_ROW_UNIT_BUDGET - (item.sprintName ? 10 : 0), 16)
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
        bgcolor: 'background.paper',
        overflow: 'visible',
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
        '&:hover': {
          boxShadow: 4,
          borderColor: statusColor,
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
          href={item.workItemUrl}
          target="_blank"
          rel="noreferrer noopener"
          sx={{
            display: 'block',
            minWidth: 0,
            mb: 1.2,
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

        {(item.activePullRequests?.length ?? 0) > 0 ? (
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

        {tagLayout.visibleTags.length > 0 || item.sprintName ? (
          <Box
            sx={{
              mt: 0.7,
              pt: 0.6,
              clear: 'both',
              borderTop: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexWrap: 'nowrap',
              gap: 0.5,
              alignItems: 'center',
              minWidth: 0,
              justifyContent: 'space-between',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'nowrap',
                gap: 0.5,
                alignItems: 'center',
                minWidth: 0,
                overflow: 'hidden',
                flex: '1 1 auto',
              }}
            >
              {tagLayout.visibleTags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  variant="outlined"
                  sx={{
                    flex: '0 1 auto',
                    minWidth: 0,
                    maxWidth: 110,
                    height: 18,
                    '& .MuiChip-label': {
                      px: 0.75,
                      fontSize: 10,
                      lineHeight: 1.1,
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  }}
                />
              ))}

              {tagLayout.hiddenCount > 0 ? (
                <Chip
                  label={`+${tagLayout.hiddenCount}`}
                  size="small"
                  variant="outlined"
                  sx={{
                    flex: '0 0 auto',
                    height: 18,
                    '& .MuiChip-label': {
                      px: 0.75,
                      fontSize: 10,
                      lineHeight: 1.1,
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    },
                  }}
                />
              ) : null}
            </Box>

            {item.sprintName ? (
              <Typography
                variant="body-sm"
                sx={{
                  ml: 0.5,
                  flex: '0 0 auto',
                  fontSize: 10,
                  lineHeight: 1.1,
                  color: 'text.secondary',
                  opacity: 0.85,
                  whiteSpace: 'nowrap',
                }}
              >
                Sprint {item.sprintName}
              </Typography>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Card>
  )
}
