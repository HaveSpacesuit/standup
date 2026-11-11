import type { RefObject } from 'react'
import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import svgDuplicate from '@stratakit/icons/duplicate.svg'
import svgInbox from '@stratakit/icons/inbox.svg'
import svgStatusSuccess from '@stratakit/icons/status-success.svg'
import type { TriageItem, WorkItemPreviewTextField } from '../../../ado/types'
import type { WorkItemPreviewImages } from '../hooks/useWorkItemPreview'
import type { BacklogSprintResolver } from '../utils/backlogSprint'
import type { TriageCheck, TriageReadinessChecks } from '../utils/triageOptions'
import { describeTriageClearing, getTriageChecksFor, hasTriageChecks } from '../utils/triageRules'
import type { TriageMatch } from '../utils/triageSimilar'
import { TriageChecklist, TriageEffort, TriageImpact, TriageSeverity } from './TriageFields'
import { TriageEntryLine } from './TriageInbox'
import { TriageMatchStrip } from './TriageSimilar'
import { describeTriageMatch } from './triageSimilarDisplay'
import { PersonLabel, SprintLabel, StateLabel } from './WorkItemFields'
import { PreviewSection, WorkItemPreviewDetails, WorkItemPreviewPanel, type PreviewLoad } from './WorkItemPreviewPanel'

const noteSx: SxProps<Theme> = { mt: 0.75, fontSize: 12, color: 'text.secondary' }
const gonePromptSx: SxProps<Theme> = { m: 0, mt: 1.75, fontSize: 13, color: 'text.secondary' }

const TEXT_CHECKS: Partial<Record<TriageCheck, WorkItemPreviewTextField>> = {
  reproSteps: 'reproSteps',
  acceptanceCriteria: 'acceptanceCriteria',
  description: 'description',
}

type TriagePreviewPanelProps = {
  panelId: string
  panelRef: RefObject<HTMLElement | null>
  width: number
  onResize: (width: number) => void
  onClose: () => void
  id: number
  /** Undefined once the item has left the queue. */
  item?: TriageItem
  /** Whether the Down arrow still has items to move to once the item has left. */
  canMove: boolean
  load: PreviewLoad
  images?: WorkItemPreviewImages
  resolveSprint: BacklogSprintResolver
  ageFlagDays: number
  readinessChecks: TriageReadinessChecks
  excludedIterationPaths: readonly string[]
  waitingTags: readonly string[]
  match?: TriageMatch
  onCompare?: (itemId: number) => void
  now?: Date
}

/**
 * The selected triage item beside the queue: why it is listed and what clears it, its readiness and closest match, then
 * its repro steps and other text, attachments, comments and links from Azure DevOps.
 */
export function TriagePreviewPanel({
  item, canMove, load, images, resolveSprint, ageFlagDays, readinessChecks, excludedIterationPaths, waitingTags, match,
  onCompare, now = new Date(), ...panel
}: TriagePreviewPanelProps) {
  if (!item) {
    return (
      <WorkItemPreviewPanel {...panel} missingTitle="No longer in triage">
        <Box component="p" sx={gonePromptSx}>
          Item {panel.id} has left the triage queue.{canMove ? ' Press the Down arrow for the next item.' : ''}
        </Box>
      </WorkItemPreviewPanel>
    )
  }

  const checks = getTriageChecksFor(item, readinessChecks)
  const clearing = describeTriageClearing(item, excludedIterationPaths)
  const required = new Set(checks.flatMap((check) => TEXT_CHECKS[check] ?? []))
  const facts = (
    <>
      <span><span className="label">Severity</span><TriageSeverity item={item} checks={checks} /></span>
      <span><span className="label">Impact</span><TriageImpact item={item} checks={checks} /></span>
      <span><span className="label">Effort</span><TriageEffort item={item} checks={checks} /></span>
      <span><span className="label">Sprint</span><SprintLabel sprint={resolveSprint(item.iterationPath)} iterationPath={item.iterationPath} /></span>
      <span><span className="label">State</span><StateLabel state={item.state} /></span>
      <span><span className="label">Assigned</span><PersonLabel person={item.assignedTo} emptyLabel="Unassigned" /></span>
    </>
  )

  return (
    <WorkItemPreviewPanel {...panel} item={item} facts={facts}>
      <PreviewSection heading="Why it's here" iconHref={svgInbox}>
        <TriageEntryLine item={item} clearing={clearing} ageFlagDays={ageFlagDays} waitingTags={waitingTags} now={now} />
        {clearing ? <Box sx={noteSx}>{clearing}</Box> : null}
      </PreviewSection>
      {hasTriageChecks(readinessChecks) ? (
        <PreviewSection heading="Readiness" iconHref={svgStatusSuccess}>
          <TriageChecklist item={item} checks={readinessChecks} clearing="" />
        </PreviewSection>
      ) : null}
      {match && onCompare ? (
        <PreviewSection heading="Similar" iconHref={svgDuplicate}>
          <TriageMatchStrip itemId={item.id} match={match} detail={describeTriageMatch(match, resolveSprint, now)} onCompare={onCompare} />
        </PreviewSection>
      ) : null}
      <WorkItemPreviewDetails item={item} load={load} images={images} required={required} now={now} />
    </WorkItemPreviewPanel>
  )
}
