import Box from '@mui/material/Box'
import { Icon } from '@stratakit/mui'
import svgGitBranch from '@stratakit/icons/git-branch.svg'
import type { IdentityRef } from '../../../ado/identity'
import type { WorkItemPullRequestSummary, WorkItemSummary } from '../../../ado/queryEngine'
import { AdoAvatar } from './AdoAvatar'
import { AgingDots } from './AgingDots'
import { StateBadge } from './DevelopmentCardBadges'
import { PullRequestProgressStrip } from './PullRequestProgressStrip'
import { RolloverSprintIndicator } from './RolloverSprintIndicator'
import {
  getClosedPullRequestLabel,
  getCompactCardStep,
  getPullRequestStatusText,
  getToneColor,
  TERTIARY_TEXT_COLOR,
  visuallyHiddenSx,
  type DevelopmentCardModel,
  type NextStep,
} from './developmentCardDisplay'

const truncateSx = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const

const glyphSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  flex: '0 0 auto',
  color: TERTIARY_TEXT_COLOR,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
} as const

// The hover card already spells out everything on this line, so these elements skip native title tooltips.

/** A PR's progress strip; linked PRs also link to the PR, since the card title links to the work item. */
function PullRequestGlyph({ pullRequest, linked }: { pullRequest: WorkItemPullRequestSummary; linked: boolean }) {
  const closedLabel = getClosedPullRequestLabel(pullRequest)
  const progress = closedLabel
    ? <Box component="span" sx={{ fontSize: 10 }}>{closedLabel}</Box>
    : <PullRequestProgressStrip pullRequest={pullRequest} size="compact" />

  if (!linked) {
    return <Box component="span" data-compact-pr={pullRequest.id} sx={glyphSx}>{progress}</Box>
  }

  const status = getPullRequestStatusText(pullRequest)
  return (
    <Box
      component="a"
      href={pullRequest.url}
      target="_blank"
      rel="noreferrer noopener"
      data-compact-pr={pullRequest.id}
      aria-label={`PR ${pullRequest.id}: ${pullRequest.title}${status ? `. ${status}` : ''}`}
      sx={{ ...glyphSx, borderRadius: 0.5, '&:hover': { color: 'text.secondary' } }}
    >
      <Icon href={svgGitBranch} />
      {progress}
    </Box>
  )
}

function StepGlyph({ step }: { step: NextStep }) {
  return (
    <Box
      component="span"
      data-card-step={step.tone}
      sx={{ ...glyphSx, flex: '0 1 auto', minWidth: 0, color: getToneColor(step.tone), fontWeight: step.tone === 'neutral' ? 400 : 500 }}
    >
      <Box component="span" sx={{ display: 'inline-flex', flex: '0 0 auto' }}>
        <Icon href={step.iconHref} />
      </Box>
      <Box component="span" sx={truncateSx}>{step.text}</Box>
    </Box>
  )
}

function OwnerGlyph({ identity }: { identity: IdentityRef }) {
  const name = identity.displayName ?? identity.uniqueName ?? 'someone else'
  return (
    <Box component="span" sx={{ display: 'inline-flex', flex: '0 0 auto' }}>
      <AdoAvatar alt="" src={identity.imageUrl} sx={{ width: 16, height: 16, fontSize: 9 }}>
        {name.trim().charAt(0).toUpperCase()}
      </AdoAvatar>
      <Box component="span" sx={visuallyHiddenSx}>Assigned to {name}</Box>
    </Box>
  )
}

/** The compact card's single status line: state, PR progress, and next step on the left; aging and sprint on the right. */
export function DevelopmentCardCompactLine({ item, model, accent }: { item: WorkItemSummary; model: DevelopmentCardModel; accent: string }) {
  const pullRequests = model.pullRequestOnly ? [model.pullRequestOnly] : model.linkedPullRequests
  const step = getCompactCardStep(model)
  const owner = step?.owner?.kind === 'person' ? step.owner.identity : null
  const hasContent = model.showStateBadge
    || pullRequests.length > 0
    || Boolean(step)
    || Boolean(model.changeBadgeText)
    || Boolean(model.agingDots)
    || model.showRollover
    || model.showSprint
  if (!hasContent) {
    return null
  }

  return (
    <Box
      data-compact-line=""
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        mt: 0.75,
        minWidth: 0,
        minHeight: 16,
        fontSize: 11,
        lineHeight: 1.3,
        color: 'text.secondary',
      }}
    >
      {model.showStateBadge && item.state ? <StateBadge state={item.state} /> : null}
      {pullRequests.map((pullRequest) => (
        <PullRequestGlyph key={pullRequest.id} pullRequest={pullRequest} linked={!model.pullRequestOnly} />
      ))}
      {step ? <StepGlyph step={step} /> : null}
      {owner ? <OwnerGlyph identity={owner} /> : null}
      {/* The change text only takes leftover space, so it truncates before the step does; the corner dot still marks the change. */}
      <Box sx={{ flex: '1 1 0', minWidth: 0, display: 'flex' }}>
        {model.changeBadgeText ? (
          <Box
            component="span"
            data-change-reason=""
            sx={{ ...truncateSx, color: 'var(--stratakit-color-text-info-base)', fontWeight: 500 }}
          >
            <Box component="span" sx={visuallyHiddenSx}>Latest change: </Box>
            {model.changeBadgeText}
          </Box>
        ) : null}
      </Box>
      {model.agingDots ? <AgingDots dots={model.agingDots} /> : null}
      {model.showRollover ? <RolloverSprintIndicator color={accent} /> : null}
      {model.showSprint ? (
        <Box component="span" sx={{ ...truncateSx, flex: '0 1 auto', fontSize: 10, color: 'text.secondary' }}>
          {item.sprintName}
        </Box>
      ) : null}
    </Box>
  )
}
