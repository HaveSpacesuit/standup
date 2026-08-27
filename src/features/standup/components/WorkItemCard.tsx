import { Avatar, Badge, Card, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { IdentityRef } from '../../../ado/identity'
import { getWorkItemIconUrlWithThemeColor } from '../utils/workItemIconColor'
import { WorkItemTags } from './WorkItemTags'
import { PullRequestSection } from './PullRequestSection'
import {
  abbreviateState,
  buildTagLayout,
  getStatusPaletteKey,
  getTagBudget,
} from './workItemCardDisplay'
import { RolloverSprintIndicator } from './RolloverSprintIndicator'

type WorkItemCardProps = {
  item: WorkItemSummary
  highlightState?: WorkItemCardHighlightState
  /** Overrides the state-derived accent (border, id, PR coloring). Used by the QA board to color cards by column. */
  accentColor?: string
  /** Displays the work item's current state on the card. */
  showState?: boolean
  /** Hides the effort badge (not meaningful in the QA context). */
  hideEffort?: boolean
  /** Controls where effort appears when it is shown. */
  effortPlacement?: 'badge' | 'footer'
  /** Hides the sprint metadata in the footer when the surrounding view already groups by sprint. */
  hideSprint?: boolean
  /** Shows an assignments-only indicator when the item moved from the previous sprint into the current one. */
  showRolloverIndicator?: boolean
  /** Places the footer person beside effort instead of replacing the effort block. */
  showFooterPersonWithEffort?: boolean
  /** A labeled person (e.g. "Created by" / "Assigned to") to show in the card footer. */
  footerPerson?: { label: string; identity: IdentityRef } | null
}

export type WorkItemCardHighlightState = 'new' | 'stale' | 'none'

export function WorkItemCard({
  item,
  highlightState = 'none',
  accentColor,
  showState = false,
  hideEffort = false,
  effortPlacement = 'badge',
  hideSprint = false,
  showRolloverIndicator = false,
  showFooterPersonWithEffort = false,
  footerPerson = null,
}: WorkItemCardProps) {
  const theme = useTheme()
  const statusPaletteKey = getStatusPaletteKey(item.status)
  const statusColor = theme.palette[statusPaletteKey].main
  // The card's emphasis color: the QA board passes its column accent so cards match the column
  // they're in; elsewhere it falls back to the state-derived status color.
  const accent = accentColor ?? statusColor
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

  const person = footerPerson?.identity
  const personName = person?.displayName ?? person?.uniqueName
  const showPerson = Boolean(!isPullRequestOnly && person && (personName || person.imageUrl))
  const hasVisibleTags = tagLayout.visibleTags.length > 0
  const showFooterEffort = !hideEffort && effortPlacement === 'footer' && typeof item.effort === 'number' && !isPullRequestOnly
  const showTagsRow = hasVisibleTags || (!showPerson && !showFooterEffort)

  return (
    <Card
      elevation={2}
      sx={{
        position: 'relative',
        p: 1,
        border: '1px solid',
        borderColor: accent,
        borderRadius: 1,
        bgcolor: isNew ? newBackground : 'background.paper',
        overflow: 'visible',
        transition: 'box-shadow 120ms ease, border-color 120ms ease, opacity 120ms ease, filter 120ms ease',
        boxShadow: cardShadow,
        opacity: isStale ? 0.68 : 1,
        filter: isStale ? 'saturate(0.78)' : 'none',
        '&:hover': {
          boxShadow: hoverShadow ?? 4,
          borderColor: accent,
          opacity: 1,
          filter: 'none',
        },
        '&:focus-within': {
          boxShadow: hoverShadow ?? 4,
          borderColor: accent,
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
        {showState && item.state ? (
          <Box
            component="span"
            sx={{
              float: 'right',
              ml: 0.75,
              mb: 0.25,
              px: 0.75,
              py: 0.125,
              maxWidth: 130,
              borderRadius: 999,
              border: '1px solid',
              borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`,
              bgcolor: `color-mix(in srgb, ${accent} 14%, transparent)`,
              color: accent,
              fontSize: 10,
              lineHeight: 1.5,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={item.state}
          >
            {abbreviateState(item.state)}
          </Box>
        ) : !hideEffort && effortPlacement === 'badge' && typeof item.effort === 'number' && !isPullRequestOnly ? (
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
          <PullRequestSection pullRequest={pullRequestOnly} statusColor={accent} emphasizeTitle />
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
                    color: accent,
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

            {showTagsRow ? (
              <WorkItemTags
                tagLayout={tagLayout}
                sprintName={showPerson || showFooterEffort ? undefined : item.sprintName}
                showRolloverIndicator={showRolloverIndicator && !hideSprint}
                rolloverIndicatorColor={accent}
              />
            ) : null}

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
                    statusColor={accent}
                  />
                ))}
              </Box>
            ) : null}

            {/* Footer row — used for QA person info or assignments effort, with the sprint on the
                right. It carries a divider when it starts a new metadata section. */}
            {showPerson || showFooterEffort ? (
              <Box
                sx={{
                  clear: 'both',
                  mt: 0.7,
                  pt: 0.6,
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  minWidth: 0,
                  justifyContent: 'space-between',
                }}
              >
                {showFooterEffort ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flex: '1 1 auto' }}>
                    <Typography
                      variant="body-sm"
                      sx={{ fontSize: 10, color: 'text.secondary', flex: '0 0 auto', whiteSpace: 'nowrap' }}
                    >
                      Effort
                    </Typography>
                    <Typography
                      variant="body-sm"
                      sx={{ fontSize: 11, fontWeight: 500, color: accent, minWidth: 0, whiteSpace: 'nowrap' }}
                    >
                      {item.effort}
                    </Typography>
                  </Box>
                ) : showPerson && person ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flex: '1 1 auto' }}>
                    <Typography
                      variant="body-sm"
                      sx={{ fontSize: 10, color: 'text.secondary', flex: '0 0 auto', whiteSpace: 'nowrap' }}
                    >
                      {footerPerson?.label}
                    </Typography>
                    <Avatar
                      alt={personName ?? ''}
                      src={person.imageUrl}
                      sx={{ width: 16, height: 16, fontSize: 8, flex: '0 0 auto' }}
                    />
                    <Typography
                      variant="body-sm"
                      sx={{ fontSize: 11, fontWeight: 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={personName}
                    >
                      {personName}
                    </Typography>
                  </Box>
                ) : null}

                {showPerson && showFooterPersonWithEffort && person ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flex: '0 1 auto' }}>
                    <Avatar
                      alt={personName ?? ''}
                      src={person.imageUrl}
                      sx={{ width: 16, height: 16, fontSize: 8, flex: '0 0 auto' }}
                    />
                    <Typography
                      variant="body-sm"
                      sx={{ fontSize: 11, fontWeight: 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={personName}
                    >
                      {personName}
                    </Typography>
                  </Box>
                ) : item.sprintName && !hideSprint ? (
                  <Box sx={{ ml: 0.5, display: 'inline-flex', alignItems: 'center', gap: 0.35, flex: '0 0 auto', color: 'text.secondary', opacity: 0.85 }}>
                    {showRolloverIndicator ? <RolloverSprintIndicator color={accent} /> : null}
                    <Typography
                      variant="body-sm"
                      sx={{ fontSize: 10, lineHeight: 1.1, whiteSpace: 'nowrap' }}
                    >
                      Sprint {item.sprintName}
                    </Typography>
                  </Box>
                ) : null}
              </Box>
            ) : null}
          </>
        )}
      </Box>
    </Card>
  )
}
