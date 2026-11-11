import type { RefObject } from 'react'
import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import svgSortDescending from '@stratakit/icons/sort-descending.svg'
import type { WorkItemPreviewImages } from '../hooks/useWorkItemPreview'
import { UNASSIGNED_LABEL } from '../utils/backlogFilter'
import type { BacklogTierThresholds } from '../utils/backlogOptions'
import { BACKLOG_TIERS, formatBacklogTierRange, getBacklogTier, getBacklogTierStyle } from '../utils/backlogTiers'
import {
  describeBacklogValue,
  formatValueTerm,
  getAssumedValueInputs,
  getImpactDescription,
  type RankedBacklogBug,
} from '../utils/backlogValue'
import { BugEffort, BugImpact, BugSeverity, BugValue } from './BacklogTable'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { CreatedAge, PersonLabel, SprintLabel, StateLabel } from './WorkItemFields'
import { PreviewSection, WorkItemPreviewDetails, WorkItemPreviewPanel, type PreviewLoad } from './WorkItemPreviewPanel'

const gonePromptSx: SxProps<Theme> = { m: 0, mt: 1.75, fontSize: 13, color: 'text.secondary' }

const valueBoxSx: SxProps<Theme> = {
  display: 'grid',
  gap: 1,
  px: 1.25,
  py: 1,
  border: '1px solid var(--stratakit-color-border-neutral-muted)',
  borderRadius: 1,
  bgcolor: 'background.paper',
  fontSize: 12.5,
  '& .summary': { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px' },
  '& .rank': { fontWeight: 650, fontVariantNumeric: 'tabular-nums' },
  '& .tier': { display: 'inline-flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' },
  '& .tier-bar': { width: 4, height: 14, borderRadius: 999, bgcolor: 'var(--backlog-tier)', flex: 'none' },
  '& .tier-range': { color: TERTIARY_TEXT_COLOR },
  '& dl': { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: '6px 12px', m: 0 },
  '& dt': { color: TERTIARY_TEXT_COLOR },
  '& dd': { m: 0, display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 },
  '& dd.detail': { color: TERTIARY_TEXT_COLOR },
  '& dd.term': { justifySelf: 'end', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  '& dd.term[data-assumed]': { color: 'var(--stratakit-color-text-attention-base)', fontWeight: 600 },
  '& .formula': { color: TERTIARY_TEXT_COLOR, fontVariantNumeric: 'tabular-nums' },
  '& .assumed': { color: 'var(--stratakit-color-text-attention-base)' },
}

const listNames = (names: readonly string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** Why the bug ranks where it does: its Value, rank and tier, each input with what it scores, and any it assumed. */
function BacklogValueBreakdown({ bug, totalBugCount, tierThresholds }: {
  bug: RankedBacklogBug
  totalBugCount: number
  tierThresholds: BacklogTierThresholds
}) {
  const tier = getBacklogTier(bug.value, tierThresholds)
  const tierName = BACKLOG_TIERS.find((entry) => entry.key === tier)?.name
  const assumed = getAssumedValueInputs(bug)
  const assumedNames = [
    assumed.severity ? 'Severity' : null,
    assumed.impact ? 'Impact' : null,
    assumed.effort ? 'Effort' : null,
  ].filter((name) => name !== null)
  const impact = getImpactDescription(bug.priority)

  return (
    <Box sx={valueBoxSx} style={getBacklogTierStyle(tier)}>
      <div className="summary">
        <BugValue bug={bug} explain={false} />
        <span className="rank">Rank {bug.rank} of {totalBugCount}</span>
        <span className="tier">
          <span className="tier-bar" aria-hidden="true" />
          {tierName}
          <span className="tier-range">{formatBacklogTierRange(tier, tierThresholds)}</span>
        </span>
      </div>
      <dl>
        <dt>Severity</dt>
        <dd><BugSeverity severity={bug.severity} /></dd>
        <dd className="term" data-assumed={assumed.severity ? '' : undefined}>→ {formatValueTerm(bug.severityScore)}</dd>
        <dt>Impact</dt>
        <dd><BugImpact priority={bug.priority} score={bug.impactScore} />{impact ? <span className="detail">{impact}</span> : null}</dd>
        <dd className="term" data-assumed={assumed.impact ? '' : undefined}>→ {formatValueTerm(bug.impactScore)}</dd>
        <dt>Effort</dt>
        <dd><BugEffort effort={bug.effort} />{assumed.effort ? null : ' pts'}</dd>
        <dd className="term" data-assumed={assumed.effort ? '' : undefined}>→ {formatValueTerm(bug.adjustedEffort)}</dd>
      </dl>
      <div className="formula">{describeBacklogValue(bug)[0]}</div>
      {assumedNames.length ? (
        <div className="assumed">
          The Value assumes a default for {listNames(assumedNames)}, so this rank may change once
          {assumedNames.length > 1 ? ' they are' : ' it is'} set.
        </div>
      ) : null}
    </Box>
  )
}

type BacklogPreviewPanelProps = {
  panelId: string
  panelRef: RefObject<HTMLElement | null>
  width: number
  onResize: (width: number) => void
  onClose: () => void
  id: number
  /** Undefined once the bug is no longer among the team's open bugs. */
  bug?: RankedBacklogBug
  /** Whether the Down arrow still has bugs to move to once the bug has left. */
  canMove: boolean
  /** How many open bugs the rank counts among. */
  totalBugCount: number
  tierThresholds: BacklogTierThresholds
  load: PreviewLoad
  images?: WorkItemPreviewImages
  now?: Date
}

/**
 * The selected bug beside the ranked list: why it ranks where it does, then its repro steps and other text,
 * attachments, comments and links from Azure DevOps.
 */
export function BacklogPreviewPanel({
  bug, canMove, totalBugCount, tierThresholds, load, images, now = new Date(), ...panel
}: BacklogPreviewPanelProps) {
  if (!bug) {
    return (
      <WorkItemPreviewPanel {...panel} missingTitle="No longer in the backlog">
        <Box component="p" sx={gonePromptSx}>
          Bug {panel.id} is no longer among the open bugs for this team.{canMove ? ' Press the Down arrow for the next bug.' : ''}
        </Box>
      </WorkItemPreviewPanel>
    )
  }

  const item = { id: bug.id, title: bug.title, workItemType: 'Bug', workItemUrl: bug.workItemUrl }
  const facts = (
    <>
      <span><span className="label">Sprint</span><SprintLabel sprint={bug.sprint} iterationPath={bug.iterationPath} /></span>
      <span><span className="label">State</span><StateLabel state={bug.state} /></span>
      <span><span className="label">Assigned</span><PersonLabel person={bug.assignedTo} emptyLabel={UNASSIGNED_LABEL} /></span>
      <span><span className="label">Age</span><CreatedAge createdAt={bug.createdAt} /></span>
    </>
  )

  return (
    <WorkItemPreviewPanel {...panel} item={item} facts={facts}>
      <PreviewSection heading="Value" iconHref={svgSortDescending}>
        <BacklogValueBreakdown bug={bug} totalBugCount={totalBugCount} tierThresholds={tierThresholds} />
      </PreviewSection>
      <WorkItemPreviewDetails item={item} load={load} images={images} now={now} />
    </WorkItemPreviewPanel>
  )
}
