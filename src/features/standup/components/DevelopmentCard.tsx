import { Card, Tooltip, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgGitBranch from '@stratakit/icons/git-branch.svg'
import { memo } from 'react'
import type { IdentityRef } from '../../../ado/identity'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { WorkItemTags } from './WorkItemTags'
import { RolloverSprintIndicator } from './RolloverSprintIndicator'
import { DevelopmentCardStep } from './DevelopmentCardStep'
import { DevelopmentPullRequestRow } from './DevelopmentPullRequestRow'
import { DevelopmentCardCompactLine } from './DevelopmentCardCompactLine'
import { DevelopmentCardDetails } from './DevelopmentCardDetails'
import { ChangeBadge, StateBadge } from './DevelopmentCardBadges'
import { AgingDots } from './AgingDots'
import { AppTooltip, SuppressTooltips } from './AppTooltip'
import type { WorkItemCardHighlightState } from './WorkItemCard'
import type { CardChangeDetail } from '../hooks/useAdoHistoryHighlights'
import { getStatusPaletteKey } from './workItemCardDisplay'
import {
  getDevelopmentCardModel,
  TERTIARY_TEXT_COLOR,
  visuallyHiddenSx,
  type DevelopmentCardModel,
} from './developmentCardDisplay'

type DevelopmentCardProps = {
  item: WorkItemSummary
  highlightState?: WorkItemCardHighlightState
  changeDetail?: CardChangeDetail
  /** Cards in the current sprint omit the sprint name. */
  currentIterationName?: string | null
  /** The developer whose row the card is pinned to; used to call out work now owned by someone else. */
  rowMember?: IdentityRef | null
  showRolloverIndicator?: boolean
  /** Title and one status line, with the full card shown on hover or keyboard focus. */
  compact?: boolean
}

type CardPartProps = {
  item: WorkItemSummary
  model: DevelopmentCardModel
  accent: string
}

const HOVER_CARD_WIDTH = 300
const EFFORT_BADGE_HEIGHT = 18

/**
 * StrataKit styles tooltips as short captions from a cascade layer that outranks sx, so the hover card
 * swaps out StrataKit's tooltip class (keeping its popper) and draws its own surface instead.
 */
const hoverCardTooltipProps = {
  className: 'development-card-hover-tooltip',
  sx: {
    p: 0,
    maxWidth: 'none',
    bgcolor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    borderRadius: 0,
    // MUI's placement margins use a more specific selector than plain sx.
    '.MuiTooltip-popper[data-popper-placement] &': { m: 0.5 },
  },
} as const

type CardTitleProps = {
  item: WorkItemSummary
  model: DevelopmentCardModel
  /** Clamp the title to this many lines; omit to show it in full. */
  lines?: number
  /** Show the full title in a tooltip; compact cards use their hover card instead. */
  showTitleTooltip?: boolean
}

function CardTitle({ item, model, lines, showTitleTooltip = false }: CardTitleProps) {
  return (
    <AppTooltip title={showTitleTooltip ? model.titleText : undefined}>
      <Box
        component="a"
        href={model.titleUrl}
        target="_blank"
        rel="noreferrer noopener"
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
            wordBreak: 'break-word',
            // A single clamped text line can be shorter than the floated effort badge.
            minHeight: lines === 1 && model.showEffort ? EFFORT_BADGE_HEIGHT : undefined,
            ...(lines
              ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' }
              : {}),
          }}
        >
          {model.showEffort ? (
            <Box
              component="span"
              sx={{
                float: 'right',
                ml: 1.5,
                mb: 0.25,
                minWidth: 20,
                height: EFFORT_BADGE_HEIGHT,
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
          {model.pullRequestOnly ? (
            <Box component="span" sx={{ display: 'inline-flex', verticalAlign: 'text-bottom', mr: 0.5, color: TERTIARY_TEXT_COLOR }}>
              <Icon href={svgGitBranch} />
            </Box>
          ) : item.workItemIconUrl ? (
            <Box
              component="span"
              role={item.workItemType ? 'img' : undefined}
              aria-label={item.workItemType}
              aria-hidden={item.workItemType ? undefined : true}
              sx={{
                width: 14,
                height: 14,
                display: 'inline-block',
                verticalAlign: 'text-bottom',
                mr: 0.5,
                // Keep the ADO icon's shape while letting CSS follow the current color scheme.
                bgcolor: 'var(--stratakit-color-icon-neutral-base)',
                maskImage: `url(${JSON.stringify(item.workItemIconUrl)})`,
                maskSize: 'contain',
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
                '@media (forced-colors: active)': {
                  bgcolor: 'CanvasText',
                  forcedColorAdjust: 'none',
                },
              }}
            />
          ) : null}
          <Box component="span" sx={{ fontWeight: 600, color: 'text.secondary', mr: 0.5, fontVariantNumeric: 'tabular-nums' }}>
            {model.displayId}
          </Box>
          <Box component="span">{model.titleText}</Box>
        </Typography>
      </Box>
    </AppTooltip>
  )
}

/** Tags, PRs, next step, and the meta row of the regular card. */
function CardSections({ item, model, accent }: CardPartProps) {
  const showMeta = model.showStateBadge
    || model.showSprint
    || model.showRollover
    || Boolean(model.changeBadgeText)
    || Boolean(model.agingDots)

  return (
    <>
      {model.tags.length > 0 ? <WorkItemTags tags={model.tags} /> : null}

      {model.pullRequestOnly ? (
        <Box sx={{ clear: 'both', mt: 0.75 }}>
          <DevelopmentPullRequestRow pullRequest={model.pullRequestOnly} showHeading={false} />
        </Box>
      ) : model.linkedPullRequests.length > 0 ? (
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
          {model.linkedPullRequests.map((pullRequest) => (
            <DevelopmentPullRequestRow key={pullRequest.id} pullRequest={pullRequest} showRepository={model.spansRepositories} />
          ))}
        </Box>
      ) : null}

      {model.cardStep ? (
        <Box sx={{ clear: 'both' }}>
          <DevelopmentCardStep step={model.cardStep} />
        </Box>
      ) : null}

      {showMeta ? (
        <Box sx={{ clear: 'both', display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, minWidth: 0, minHeight: 16 }}>
          {model.showStateBadge && item.state ? <StateBadge state={item.state} /> : null}
          {model.changeBadgeText ? <ChangeBadge text={model.changeBadgeText} fullText={model.changeBadgeFullText} /> : null}
          <Box sx={{ flex: '1 1 auto' }} />
          {model.agingDots ? <AgingDots dots={model.agingDots} /> : null}
          {model.showRollover ? <RolloverSprintIndicator color={accent} /> : null}
          {model.showSprint ? (
            <AppTooltip title={item.sprintName}>
              <Typography
                variant="body-sm"
                tabIndex={0}
                sx={{ fontSize: 10, lineHeight: 1.1, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
              >
                {item.sprintName}
              </Typography>
            </AppTooltip>
          ) : null}
        </Box>
      ) : null}
    </>
  )
}

/** The full card, plus the facts a compact card leaves out, shown while a compact card is hovered or focused. */
function DevelopmentCardHoverCard({
  item,
  model,
  accent,
  changeDetail,
}: CardPartProps & { changeDetail?: CardChangeDetail }) {
  return (
    <Box
      data-development-card-hover=""
      sx={{
        position: 'relative',
        width: HOVER_CARD_WIDTH,
        maxWidth: 'calc(100vw - 16px)',
        boxSizing: 'border-box',
        py: 2,
        pr: 2.5,
        pl: 3,
        bgcolor: 'background.paper',
        color: 'text.primary',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        boxShadow: `inset 3px 0 0 ${accent}, var(--stratakit-shadow-surface-lg)`,
        textAlign: 'start',
        hyphens: 'manual',
        overflowWrap: 'normal',
      }}
    >
      <CardTitle item={item} model={model} />
      <CardSections item={item} model={model} accent={accent} />
      <DevelopmentCardDetails item={item} model={model} changeDetail={changeDetail} />
    </Box>
  )
}

/**
 * The Development board's card: a neutral surface with a column-colored leading edge, showing only
 * the details that are not already implied by the card's row, column, or the current sprint.
 */
export const DevelopmentCard = memo(function DevelopmentCard({
  item,
  highlightState = 'none',
  changeDetail,
  currentIterationName = null,
  rowMember = null,
  showRolloverIndicator = false,
  compact = false,
}: DevelopmentCardProps) {
  const theme = useTheme()
  const accent = theme.palette[getStatusPaletteKey(item.status)].main
  const model = getDevelopmentCardModel({ item, highlightState, changeDetail, currentIterationName, rowMember, showRolloverIndicator })

  const leadingEdge = `inset 3px 0 0 ${accent}`
  const restingShadow = `${leadingEdge}, var(--stratakit-shadow-surface-xs)`
  const raisedSx = {
    zIndex: 2,
    // A compact card opens its hover card rather than lifting.
    transform: compact ? 'none' : 'translateY(-1px)',
    boxShadow: `${leadingEdge}, var(--stratakit-shadow-surface-md)`,
    opacity: 1,
    filter: 'none',
  }

  const card = (
    <Card
      elevation={0}
      data-development-card=""
      data-compact={compact ? '' : undefined}
      sx={{
        containerType: 'inline-size',
        position: 'relative',
        width: '100%',
        minWidth: 0,
        py: compact ? 1 : 1.25,
        pr: 1.75,
        pl: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
        overflow: 'visible',
        zIndex: 0,
        boxShadow: restingShadow,
        opacity: model.isFaded ? 0.68 : 1,
        filter: model.isFaded ? 'saturate(0.78)' : 'none',
        transition: 'transform 160ms ease, box-shadow 160ms ease, opacity 120ms ease, filter 120ms ease',
        '&:hover': raisedSx,
        '&:focus-within': raisedSx,
      }}
    >
      <SuppressTooltips when={compact}>
        {model.isNew ? (
          <Box
            component="span"
            data-change-dot=""
            sx={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: 'var(--stratakit-color-bg-info-base)',
              boxShadow: `0 0 0 2px ${(theme.vars || theme).palette.background.paper}`,
              pointerEvents: 'none',
            }}
          >
            {model.changeBadgeText ? null : <Box component="span" sx={visuallyHiddenSx}>Recently changed</Box>}
          </Box>
        ) : null}
        <CardTitle item={item} model={model} lines={compact ? 1 : 2} showTitleTooltip={!compact} />
        {compact
          ? <DevelopmentCardCompactLine item={item} model={model} accent={accent} />
          : <CardSections item={item} model={model} accent={accent} />}
      </SuppressTooltips>
    </Card>
  )

  if (!compact) {
    return card
  }

  return (
    <Tooltip
      title={<DevelopmentCardHoverCard item={item} model={model} accent={accent} changeDetail={changeDetail} />}
      placement="right-start"
      enterDelay={400}
      enterNextDelay={150}
      leaveDelay={100}
      slotProps={{ tooltip: hoverCardTooltipProps }}
    >
      {card}
    </Tooltip>
  )
})
