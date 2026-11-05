import { Card, Tooltip, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgArrowRight from '@stratakit/icons/arrow-right.svg'
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
import { AdoAvatar } from './AdoAvatar'
import { JourneyCaptionLabel, JourneyTrailBar } from './SprintJourneyParts'
import type { WorkItemCardHighlightState } from './WorkItemCard'
import type { CardChangeDetail } from '../hooks/useAdoHistoryHighlights'
import { getJourneyTrail, type SprintJourney } from '../utils/sprintJourney'
import { formatSprintDate } from '../utils/sprintDates'
import type { SprintRemoval } from '../utils/sprintLens'
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
  /** Set while a Needs attention facet is selected: matching cards are ringed and the rest recede. */
  emphasis?: 'match' | 'dim'
  /** The card's sprint journey: adds a caption, a trail along the bottom edge, and the hover ghost. */
  journey?: SprintJourney
  /** Shown as an avatar beside the effort, for boards whose lanes are not people. */
  owner?: IdentityRef | null
  /** Set for a card that has left the sprint: drawn as a dashed outline that says where it went. */
  removal?: SprintRemoval
  /** Shows the card as it stood at this moment, while the sprint is replayed. */
  asOf?: number
  /** Override the status-derived edge color when a board column represents a different workflow. */
  columnColor?: string
  /** States already implied by the surrounding QA column. */
  expectedStateNames?: readonly string[]
  /** Role shown by the card's owner avatar, e.g. "Tester" or "Filed by". */
  ownerLabel?: string
  /** A concise workflow caption for boards that derive progress outside the sprint journey model. */
  caption?: string
  /** Shows an unassigned sprint as an explicit, dashed badge. */
  showNoSprintBadge?: boolean
  /** Neutral treatment for work that was removed rather than completed. */
  cancelled?: boolean
}

type CardPartProps = {
  item: WorkItemSummary
  model: DevelopmentCardModel
  accent: string
  ownerLabel: string
  caption?: string
  showNoSprintBadge: boolean
  cancelled: boolean
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
  /** The developer who owns the card, shown as an avatar when the card's lane is not a person. */
  owner?: IdentityRef | null
  /** Clamp the title to this many lines; omit to show it in full. */
  lines?: number
  /** Show the full title in a tooltip; compact cards use their hover card instead. */
  showTitleTooltip?: boolean
  /** Strike through the effort, for cards whose effort no longer counts toward the sprint. */
  struckEffort?: boolean
  ownerLabel: string
  cancelled?: boolean
}

function OwnerAvatar({ owner, label }: { owner: IdentityRef; label: string }) {
  const name = owner.displayName ?? owner.uniqueName ?? 'Unknown'
  return (
    <AppTooltip title={name}>
      <Box component="span" role="img" aria-label={`${label}: ${name}`} data-card-owner="" sx={{ display: 'inline-flex', flex: '0 0 auto' }}>
        <AdoAvatar alt="" src={owner.imageUrl} sx={{ width: EFFORT_BADGE_HEIGHT, height: EFFORT_BADGE_HEIGHT, fontSize: 9 }}>
          {name.trim().charAt(0).toUpperCase()}
        </AdoAvatar>
      </Box>
    </AppTooltip>
  )
}

function CardTitle({ item, model, owner = null, lines, showTitleTooltip = false, struckEffort = false, ownerLabel, cancelled = false }: CardTitleProps) {
  const hasAside = model.showEffort || Boolean(owner)

  return (
    <Typography
      variant="body-sm"
      // A div rather than the default p, since the owner avatar renders a div.
      render={<div />}
      sx={{
        lineHeight: 1.25,
        wordBreak: 'break-word',
        // A single clamped text line can be shorter than the floated effort badge.
        minHeight: lines === 1 && hasAside ? EFFORT_BADGE_HEIGHT : undefined,
        ...(lines
          ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' }
          : {}),
      }}
    >
      {/* Outside the link, so the owner's tooltip doesn't open alongside the title's. */}
      {hasAside ? (
        <Box component="span" sx={{ float: 'right', ml: 1.5, mb: 0.25, display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          {model.showEffort ? (
            <Box
              component="span"
              sx={{
                minWidth: 20,
                height: EFFORT_BADGE_HEIGHT,
                px: 1.25,
                borderRadius: 999,
                border: '1px solid var(--stratakit-color-border-neutral-muted)',
                color: struckEffort ? TERTIARY_TEXT_COLOR : 'text.secondary',
                fontSize: 11,
                fontWeight: 600,
                lineHeight: '16px',
                textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
                textDecoration: struckEffort ? 'line-through' : undefined,
              }}
            >
              <Box component="span" sx={visuallyHiddenSx}>{struckEffort ? 'Removed effort ' : 'Effort '}</Box>
              {item.effort}
            </Box>
          ) : null}
          {owner ? <OwnerAvatar owner={owner} label={ownerLabel} /> : null}
        </Box>
      ) : null}
      <AppTooltip title={showTitleTooltip ? model.titleText : undefined}>
        <Box
          component="a"
          href={model.titleUrl}
          target="_blank"
          rel="noreferrer noopener"
          sx={{
            color: cancelled ? 'text.secondary' : 'text.primary',
            textDecoration: cancelled ? 'line-through' : 'none',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
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
        </Box>
      </AppTooltip>
    </Typography>
  )
}

/** Tags, PRs, next step, and the meta row of the regular card. */
function CardSections({ item, model, accent, caption, showNoSprintBadge }: Pick<CardPartProps, 'item' | 'model' | 'accent' | 'caption' | 'showNoSprintBadge'>) {
  const showMeta = model.showStateBadge
    || model.showSprint
    || model.showRollover
    || Boolean(model.changeBadgeText)
    || Boolean(model.agingDots)
    || Boolean(model.journeyCaption)
    || Boolean(caption)
    || (showNoSprintBadge && !item.sprintName)

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
          {model.journeyCaption ? <JourneyCaptionLabel caption={model.journeyCaption} /> : null}
          {model.showRollover ? <RolloverSprintIndicator color={accent} /> : null}
          {caption ? (
            <Typography component="span" variant="body-sm" sx={{ fontSize: 10, lineHeight: 1.1, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {caption}
            </Typography>
          ) : null}
          {showNoSprintBadge && !item.sprintName ? (
            <Box
              component="span"
              data-no-sprint=""
              sx={{
                px: 0.6,
                py: 0.125,
                border: '1px dashed var(--stratakit-color-border-neutral-muted)',
                borderRadius: 999,
                color: 'text.secondary',
                fontSize: 10,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}
            >
              No sprint
            </Box>
          ) : null}
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

/** The one line a removed card shows: where it went, and when. */
function RemovalLine({ removal }: { removal: SprintRemoval }) {
  const destination = removal.to ? `Moved to ${removal.to}` : 'Moved out of the sprint'
  const text = removal.at === null ? destination : `${destination} · ${formatSprintDate(new Date(removal.at))}`

  return (
    <Box
      data-card-removal=""
      sx={{
        clear: 'both',
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        mt: 0.75,
        minWidth: 0,
        fontSize: 11,
        lineHeight: 1.3,
        color: 'text.secondary',
      }}
    >
      <Box component="span" sx={{ display: 'inline-flex', flex: '0 0 auto', color: TERTIARY_TEXT_COLOR }}>
        <Icon href={svgArrowRight} />
      </Box>
      <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</Box>
    </Box>
  )
}

/** The full card, plus the facts a compact card leaves out, shown while a compact card is hovered or focused. */
function DevelopmentCardHoverCard({
  item,
  model,
  accent,
  owner,
  ownerLabel,
  caption,
  showNoSprintBadge,
  cancelled,
}: CardPartProps & { owner: IdentityRef | null }) {
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
      <CardTitle item={item} model={model} owner={owner} ownerLabel={ownerLabel} cancelled={cancelled} />
      <CardSections item={item} model={model} accent={accent} caption={caption} showNoSprintBadge={showNoSprintBadge} />
      <DevelopmentCardDetails item={item} model={model} />
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
  emphasis,
  journey,
  owner = null,
  removal,
  asOf,
  columnColor,
  expectedStateNames,
  ownerLabel = 'Owner',
  caption,
  showNoSprintBadge = false,
  cancelled = false,
}: DevelopmentCardProps) {
  const theme = useTheme()
  const accent = cancelled
    ? 'var(--stratakit-color-icon-neutral-secondary)'
    : columnColor ?? theme.palette[getStatusPaletteKey(item.status)].main
  const model = getDevelopmentCardModel({ item, highlightState, changeDetail, currentIterationName, rowMember, showRolloverIndicator, expectedStateNames, journey, asOf })
  const trail = journey && model.journeyCaption ? getJourneyTrail(journey, asOf ?? Date.now()) : null
  // A past day's card has nothing more to show on hover.
  const hoverCard = compact && asOf === undefined

  const edges = emphasis === 'match'
    ? `inset 3px 0 0 ${accent}, 0 0 0 2px var(--stratakit-color-border-accent-base)`
    : `inset 3px 0 0 ${accent}`
  const restingShadow = `${edges}, var(--stratakit-shadow-surface-xs)`
  const isDimmed = emphasis === 'dim'
  const restingOpacity = isDimmed ? 0.35 : model.isFaded ? 0.68 : 1
  const restingFilter = isDimmed ? 'grayscale(0.6)' : model.isFaded ? 'saturate(0.78)' : 'none'
  const raisedSx = {
    zIndex: 2,
    // A compact card opens its hover card rather than lifting.
    transform: compact ? 'none' : 'translateY(-1px)',
    boxShadow: `${edges}, var(--stratakit-shadow-surface-md)`,
    opacity: 1,
    filter: 'none',
  }

  const card = removal ? (
    <Card
      elevation={0}
      data-development-card=""
      data-card-id={item.id}
      data-compact={compact ? '' : undefined}
      data-emphasis={emphasis}
      data-removed=""
      // StrataKit's card layer outranks sx for the border and background, so they go inline.
      style={{ borderStyle: 'dashed', borderColor: 'var(--stratakit-color-border-neutral-base)', backgroundColor: 'transparent' }}
      sx={{
        position: 'relative',
        width: '100%',
        minWidth: 0,
        pt: compact ? 1 : 1.25,
        pb: compact ? 1 : 1.25,
        pr: 1.75,
        pl: 2.5,
        border: '1px solid',
        borderRadius: 1,
        boxShadow: 'none',
        overflow: 'visible',
        opacity: isDimmed ? 0.35 : 0.85,
        filter: isDimmed ? 'grayscale(0.6)' : 'none',
        transition: 'opacity 120ms ease, filter 120ms ease',
        '&:hover, &:focus-within': { opacity: 1, filter: 'none' },
      }}
    >
      <CardTitle item={item} model={model} owner={owner} ownerLabel={ownerLabel} cancelled lines={compact ? 1 : 2} showTitleTooltip struckEffort />
      <RemovalLine removal={removal} />
    </Card>
  ) : (
    <Card
      elevation={0}
      data-development-card=""
      data-card-id={item.id}
      data-compact={compact ? '' : undefined}
      data-emphasis={emphasis}
      data-as-of={asOf === undefined ? undefined : ''}
      data-journey-id={journey && !model.pullRequestOnly ? item.id : undefined}
      style={cancelled ? { borderStyle: 'dashed', borderColor: 'var(--stratakit-color-border-neutral-muted)' } : undefined}
      sx={{
        containerType: 'inline-size',
        position: 'relative',
        width: '100%',
        minWidth: 0,
        pt: compact ? 1 : 1.25,
        // Room for the journey trail along the bottom edge.
        pb: trail ? (compact ? 1.5 : 1.75) : compact ? 1 : 1.25,
        pr: 1.75,
        pl: 2.5,
        border: '1px solid',
        borderColor: cancelled ? 'var(--stratakit-color-border-neutral-muted)' : 'divider',
        borderRadius: 1,
        bgcolor: cancelled ? 'background.default' : 'background.paper',
        overflow: 'visible',
        zIndex: 0,
        boxShadow: restingShadow,
        opacity: restingOpacity,
        filter: restingFilter,
        transition: 'transform 160ms ease, box-shadow 160ms ease, opacity 120ms ease, filter 120ms ease',
        '&:hover': raisedSx,
        '&:focus-within': raisedSx,
      }}
    >
      <SuppressTooltips when={hoverCard}>
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
        <CardTitle item={item} model={model} owner={owner} ownerLabel={ownerLabel} cancelled={cancelled} lines={compact ? 1 : 2} showTitleTooltip={!hoverCard} />
        {compact
          ? <DevelopmentCardCompactLine item={item} model={model} accent={accent} />
          : <CardSections item={item} model={model} accent={accent} caption={caption} showNoSprintBadge={showNoSprintBadge} />}
        {trail ? <JourneyTrailBar trail={trail} /> : null}
        {emphasis === 'match' ? <Box component="span" sx={visuallyHiddenSx}>Highlighted</Box> : null}
      </SuppressTooltips>
    </Card>
  )

  // A removed card already shows all it has to say.
  if (!hoverCard || removal) {
    return card
  }

  return (
    <Tooltip
      title={<DevelopmentCardHoverCard item={item} model={model} accent={accent} owner={owner} ownerLabel={ownerLabel} caption={caption} showNoSprintBadge={showNoSprintBadge} cancelled={cancelled} />}
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
