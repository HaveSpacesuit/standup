import { Badge, Card, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgGitBranch from '@stratakit/icons/git-branch.svg'
import { memo } from 'react'
import type { IdentityRef } from '../../../ado/identity'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { getIconUrlWithThemeColorValue } from '../utils/workItemIconColor'
import { WorkItemTags } from './WorkItemTags'
import { RolloverSprintIndicator } from './RolloverSprintIndicator'
import { DevelopmentCardStep } from './DevelopmentCardStep'
import { DevelopmentPullRequestRow } from './DevelopmentPullRequestRow'
import type { WorkItemCardHighlightState } from './WorkItemCard'
import { getStatusPaletteKey } from './workItemCardDisplay'
import {
  findBlockedTag,
  getCardNextStep,
  getStateBadgeColor,
  isDefaultColumnState,
  shouldShowSprint,
  TERTIARY_TEXT_COLOR,
  visuallyHiddenSx,
} from './developmentCardDisplay'

type DevelopmentCardProps = {
  item: WorkItemSummary
  highlightState?: WorkItemCardHighlightState
  /** Cards in the current sprint omit the sprint name. */
  currentIterationName?: string | null
  /** The developer whose row the card is pinned to; used to call out work now owned by someone else. */
  rowMember?: IdentityRef | null
  showRolloverIndicator?: boolean
}

/**
 * The Development board's card: a neutral surface with a column-colored leading edge, showing only
 * the details that are not already implied by the card's row, column, or the current sprint.
 */
export const DevelopmentCard = memo(function DevelopmentCard({
  item,
  highlightState = 'none',
  currentIterationName = null,
  rowMember = null,
  showRolloverIndicator = false,
}: DevelopmentCardProps) {
  const theme = useTheme()
  const accent = theme.palette[getStatusPaletteKey(item.status)].main
  const isNew = highlightState === 'new'
  const isStale = highlightState === 'stale'

  const pullRequestOnly = item.kind === 'pull-request' ? item.pullRequest : undefined
  const linkedPullRequests = pullRequestOnly ? [] : (item.activePullRequests ?? [])
  const cardStep = getCardNextStep(item, rowMember)
  // A blocked card's step line already carries the reason from its blocked tag.
  const hiddenTag = item.status === 'Blocked' && cardStep ? findBlockedTag(item.tags) : undefined
  const sortedTags = (item.tags ?? [])
    .filter((tag) => tag !== hiddenTag)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))

  const showEffort = !pullRequestOnly && typeof item.effort === 'number'
  const showStateBadge = !pullRequestOnly && !isDefaultColumnState(item.status, item.state) && !cardStep?.coversState
  const showSprint = !pullRequestOnly && shouldShowSprint(item.sprintName, currentIterationName)
  const showRollover = !pullRequestOnly && showRolloverIndicator
  const showMeta = showStateBadge || showSprint || showRollover

  const leadingEdge = `inset 3px 0 0 ${accent}`
  const restingShadow = isNew
    ? `${leadingEdge}, 0 0 0 1px color-mix(in srgb, ${accent} 72%, transparent), 0 0 14px color-mix(in srgb, ${accent} 42%, transparent)`
    : `${leadingEdge}, var(--stratakit-shadow-surface-xs)`
  const raisedSx = {
    zIndex: 2,
    transform: 'translateY(-1px)',
    boxShadow: `${leadingEdge}, var(--stratakit-shadow-surface-md)`,
    opacity: 1,
    filter: 'none',
  }

  const titleUrl = pullRequestOnly ? pullRequestOnly.url : item.workItemUrl
  const titleText = pullRequestOnly ? pullRequestOnly.title : item.title
  const displayId = pullRequestOnly ? pullRequestOnly.id : item.id

  return (
    <Card
      elevation={0}
      data-development-card=""
      sx={{
        containerType: 'inline-size',
        position: 'relative',
        width: '100%',
        minWidth: 0,
        py: 1.25,
        pr: 1.75,
        pl: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: isNew ? `color-mix(in srgb, ${accent} 8%, ${theme.palette.background.paper})` : 'background.paper',
        overflow: 'visible',
        zIndex: 0,
        boxShadow: restingShadow,
        opacity: isStale ? 0.68 : 1,
        filter: isStale ? 'saturate(0.78)' : 'none',
        transition: 'transform 160ms ease, box-shadow 160ms ease, opacity 120ms ease, filter 120ms ease',
        '&:hover': raisedSx,
        '&:focus-within': raisedSx,
      }}
    >
      <Box
        component="a"
        href={titleUrl}
        target="_blank"
        rel="noreferrer noopener"
        title={titleText}
        sx={{
          display: 'block',
          minWidth: 0,
          color: 'text.primary',
          textDecoration: 'none',
          '&:hover': { textDecoration: 'underline' },
        }}
      >
        <Typography
          variant="body-sm"
          sx={{
            lineHeight: 1.25,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {showEffort ? (
            <Box
              component="span"
              sx={{
                float: 'right',
                ml: 1.5,
                mb: 0.25,
                minWidth: 20,
                height: 18,
                px: 1.25,
                borderRadius: 999,
                border: '1px solid var(--stratakit-color-border-neutral-muted)',
                color: 'text.secondary',
                fontSize: 11,
                fontWeight: 600,
                lineHeight: '16px',
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <Box component="span" sx={visuallyHiddenSx}>Effort </Box>
              {item.effort}
            </Box>
          ) : null}
          {pullRequestOnly ? (
            <Box component="span" sx={{ display: 'inline-flex', verticalAlign: 'text-bottom', mr: 0.5, color: TERTIARY_TEXT_COLOR }}>
              <Icon href={svgGitBranch} />
            </Box>
          ) : item.workItemIconUrl ? (
            <Box
              component="img"
              src={getIconUrlWithThemeColorValue(item.workItemIconUrl, theme.palette.text.secondary)}
              alt={item.workItemType ?? ''}
              sx={{ width: 14, height: 14, display: 'inline-block', verticalAlign: 'text-bottom', mr: 0.5 }}
            />
          ) : null}
          <Box component="span" sx={{ fontWeight: 600, color: 'text.secondary', mr: 0.5, fontVariantNumeric: 'tabular-nums' }}>
            {displayId}
          </Box>
          <Box component="span">{titleText}</Box>
        </Typography>
      </Box>

      {sortedTags.length > 0 ? <WorkItemTags tags={sortedTags} /> : null}

      {pullRequestOnly ? (
        <Box sx={{ clear: 'both', mt: 0.75 }}>
          <DevelopmentPullRequestRow pullRequest={pullRequestOnly} showHeading={false} />
        </Box>
      ) : linkedPullRequests.length > 0 ? (
        <Box
          sx={{
            clear: 'both',
            mt: 1,
            pt: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'grid',
            gap: 1,
          }}
        >
          {linkedPullRequests.map((pullRequest) => (
            <DevelopmentPullRequestRow key={pullRequest.id} pullRequest={pullRequest} />
          ))}
        </Box>
      ) : null}

      {cardStep ? (
        <Box sx={{ clear: 'both' }}>
          <DevelopmentCardStep step={cardStep} />
        </Box>
      ) : null}

      {showMeta ? (
        <Box sx={{ clear: 'both', display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, minWidth: 0, minHeight: 16 }}>
          {showStateBadge && item.state ? (
            <Badge
              variant="inline"
              type="outlined"
              size="small"
              color={getStateBadgeColor(item.state)}
              max={Infinity}
              badgeContent={item.state}
              title={`State: ${item.state}`}
              sx={{ minWidth: 0, maxWidth: '100%', '& .MuiBadge-badge': { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' } }}
            />
          ) : null}
          <Box sx={{ flex: '1 1 auto' }} />
          {showRollover ? <RolloverSprintIndicator color={accent} /> : null}
          {showSprint ? (
            <Typography
              variant="body-sm"
              title={item.sprintName}
              sx={{ fontSize: 10, lineHeight: 1.1, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
            >
              {item.sprintName}
            </Typography>
          ) : null}
        </Box>
      ) : null}
    </Card>
  )
})
