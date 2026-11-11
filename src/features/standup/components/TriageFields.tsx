import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgInbox from '@stratakit/icons/inbox.svg'
import svgInspection from '@stratakit/icons/inspection.svg'
import svgStatusSuccess from '@stratakit/icons/status-success.svg'
import svgTag from '@stratakit/icons/tag.svg'
import type { TriageItem } from '../../../ado/types'
import { describeTriageAge, READY_TO_CLEAR_LABEL } from '../utils/triageDisplay'
import { getTriageEntry, getTriageItemAge } from '../utils/triageInbox'
import type { TriageCheck, TriageReadinessChecks } from '../utils/triageOptions'
import { getTriageReadiness, getTriageReasonDetails, hasTriageChecks, type TriageReason } from '../utils/triageRules'
import { AppTooltip } from './AppTooltip'
import { TipLines } from './TipLines'
import { visuallyHiddenSx } from './developmentCardDisplay'
import { ImpactBars, MissingValue, NotSet, SeverityChip } from './WorkItemFields'
import { METER_TRACK_COLOR } from './workItemTableDisplay'

// The Triage table's cells, shared with the Inbox's cards so an item reads the same in either view.

const SEVERITY_UNSET_TIP = 'Severity is not set yet.'
const IMPACT_UNSET_TIP = 'Impact (the Priority field) is not set yet.'
const EFFORT_UNSET_TIP = 'Effort is not set yet.'

// The type icon hangs beside the title, centered on its first line, so wrapped title and tag lines stay aligned with
// the id rather than running under the icon.
const typeIconSx: SxProps<Theme> = { display: 'inline-flex', alignItems: 'center', height: '1lh', flexShrink: 0 }

// Reason chips are quieter than the tag pills: a filled, square-cornered label so they read as the row's status rather
// than as more tags. Styled from the list so each row costs one sx.
const reasonListSx: SxProps<Theme> = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 0.5,
  m: 0,
  p: 0,
  listStyle: 'none',
  '& > li': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.5,
    height: 20,
    pl: 0.625,
    pr: 0.875,
    borderRadius: 1,
    fontSize: 11,
    bgcolor: METER_TRACK_COLOR,
    color: 'text.secondary',
    whiteSpace: 'nowrap',
    cursor: 'help',
  },
}
const reasonIconStyle = { width: 12, height: 12, flexShrink: 0 }

const flaggedAgeSx: SxProps<Theme> = { color: 'var(--stratakit-color-text-attention-base)', fontWeight: 600 }

// Positive like the Tests page's passing runs, and pill shaped so it reads as a status rather than one of the Why chips.
const readyChipSx: SxProps<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  height: 20,
  pl: 0.75,
  pr: 1,
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  bgcolor: 'var(--stratakit-color-bg-positive-muted)',
  color: 'var(--stratakit-color-text-positive-base)',
  whiteSpace: 'nowrap',
  cursor: 'help',
}
const readyIconStyle = { ...reasonIconStyle, color: 'var(--stratakit-color-icon-positive-base)' }

// Each missing field reads as the dashed "?" the Severity, Impact and Effort cells use, shrunk to sit beside its name.
const missingMarkSx = {
  display: 'inline-grid',
  placeItems: 'center',
  width: 14,
  height: 14,
  border: '1px dashed var(--stratakit-color-border-attention-base)',
  borderRadius: '50%',
  fontSize: 9,
  fontWeight: 700,
  lineHeight: 1,
}
const missingListSx: SxProps<Theme> = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px 8px',
  m: 0,
  p: 0,
  listStyle: 'none',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--stratakit-color-text-attention-base)',
  cursor: 'help',
  '& > li': { display: 'inline-flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' },
  '& .missing-mark': missingMarkSx,
}

// A card lists every check, passed ones quietly with a tick, so what is left stands out.
const checklistSx: SxProps<Theme> = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px 12px',
  fontSize: 12,
  color: 'text.secondary',
  '& > ul': { display: 'contents', listStyle: 'none' },
  '& li': { display: 'inline-flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' },
  '& li.missing': { color: 'var(--stratakit-color-text-attention-base)', fontWeight: 600 },
  '& .missing-mark': missingMarkSx,
}

// Severity, Impact and Effort are flagged like on Backlog when they are one of the item type's readiness checks. Otherwise
// the type may not have the field at all, so an empty one is a plain dash.
type ChecksProps = { item: TriageItem; checks: readonly TriageCheck[] }

export function TriageSeverity({ item, checks }: ChecksProps) {
  return item.severity === undefined && !checks.includes('severity')
    ? <NotSet />
    : <SeverityChip severity={item.severity} unsetTip={SEVERITY_UNSET_TIP} />
}

export function TriageImpact({ item, checks }: ChecksProps) {
  return item.priority === undefined && !checks.includes('impact')
    ? <NotSet />
    : <ImpactBars priority={item.priority} detail="The Priority field" missingTip={IMPACT_UNSET_TIP} />
}

export function TriageEffort({ item, checks }: ChecksProps) {
  if (item.effort !== undefined) return item.effort
  return checks.includes('effort') ? <MissingValue tip={EFFORT_UNSET_TIP} /> : <NotSet />
}

function ReadyChip({ item, readiness, clearing }: { item: TriageItem; readiness: { checks: unknown[] }; clearing: string }) {
  const passed = readiness.checks.length ? 'Every readiness check passes.' : `${item.workItemType} has no readiness checks.`
  return (
    <AppTooltip title={<TipLines lines={[passed, clearing].filter(Boolean)} />} describeChild>
      <Box component="span" sx={readyChipSx}>
        <Icon href={svgStatusSuccess} alt="" style={readyIconStyle} />
        {READY_TO_CLEAR_LABEL}
      </Box>
    </AppTooltip>
  )
}

/** "Ready to clear" once every check for the item's type passes, otherwise the fields still missing. */
export function TriageReadinessLabel({ item, checks, clearing }: { item: TriageItem; checks: TriageReadinessChecks; clearing: string }) {
  const readiness = getTriageReadiness(item, checks)
  if (readiness.ready) return <ReadyChip item={item} readiness={readiness} clearing={clearing} />
  return (
    <AppTooltip title={<TipLines lines={[`Missing: ${readiness.missing.join(', ')}`, clearing].filter(Boolean)} />} describeChild>
      <Box component="ul" role="list" aria-label="Missing" sx={missingListSx}>
        {readiness.missing.map((label) => (
          <li key={label}><span className="missing-mark" aria-hidden="true">?</span>{label}</li>
        ))}
      </Box>
    </AppTooltip>
  )
}

/**
 * A card's readiness line: "Ready to clear", or each check with a tick or the dashed "?", then what takes the item off
 * the queue. Only the clearing text while no type has readiness checks.
 */
export function TriageChecklist({ item, checks, clearing }: { item: TriageItem; checks: TriageReadinessChecks; clearing: string }) {
  const readiness = getTriageReadiness(item, checks)
  const showChecks = hasTriageChecks(checks)
  if (!showChecks && !clearing) return null
  return (
    <Box sx={checklistSx}>
      {!showChecks ? null : readiness.ready ? <ReadyChip item={item} readiness={readiness} clearing={clearing} /> : (
        <Box component="ul" role="list" aria-label="Readiness checks">
          {readiness.checks.map(({ check, label, filled }) => (
            <li key={check} className={filled ? undefined : 'missing'}>
              {filled
                ? <Icon href={svgStatusSuccess} alt="" style={readyIconStyle} />
                : <span className="missing-mark" aria-hidden="true">?</span>}
              {label}
              <Box component="span" sx={visuallyHiddenSx}>{filled ? ': filled in' : ': missing'}</Box>
            </li>
          ))}
        </Box>
      )}
      {clearing ? <span>{clearing}</span> : null}
    </Box>
  )
}

export function TriageTypeIcon({ item }: { item: Pick<TriageItem, 'workItemType' | 'workItemIconUrl'> }) {
  return (
    <Box component="span" sx={typeIconSx}>
      <AppTooltip title={item.workItemType}>
        {item.workItemIconUrl ? (
          <Box component="span" role="img" aria-label={item.workItemType} sx={{
            width: 16, height: 16, bgcolor: 'text.secondary',
            maskImage: `url(${JSON.stringify(item.workItemIconUrl)})`, maskSize: 'contain',
            maskRepeat: 'no-repeat', maskPosition: 'center',
          }} />
        ) : <Icon href={svgInspection} alt={item.workItemType} />}
      </AppTooltip>
    </Box>
  )
}

function describeReason(reason: TriageReason, item: TriageItem): string {
  return reason.kind === 'tag'
    ? `Listed because it has the “${reason.tag}” tag.`
    : `Listed because it is a bug still in its first state, ${item.state}.`
}

export function TriageReasons({ item, clearing }: { item: TriageItem; clearing: string }) {
  const reasons = getTriageReasonDetails(item)
  if (reasons.length === 0) return <NotSet />
  return (
    <Box component="ul" role="list" aria-label="Why it is listed" sx={reasonListSx}>
      {reasons.map((reason) => (
        <AppTooltip key={reason.label} title={<TipLines lines={[describeReason(reason, item), clearing].filter(Boolean)} />} describeChild>
          <li>
            <Icon href={reason.kind === 'tag' ? svgTag : svgInbox} alt="" style={reasonIconStyle} />
            {reason.label}
          </li>
        </AppTooltip>
      ))}
    </Box>
  )
}

/**
 * Working days since the item entered triage, amber once it has waited `flagDays` or more, unless it is waiting on
 * someone else.
 */
export function TriageAgeLabel({ item, flagDays, waitingTags }: { item: TriageItem; flagDays: number; waitingTags: readonly string[] }) {
  const entry = getTriageEntry(item)
  const age = getTriageItemAge(item, flagDays, waitingTags)
  if (!entry || !age) return <NotSet />

  const since = describeTriageAge(entry.at, age)
  const waiting = `Waiting longer than ${flagDays} working ${flagDays === 1 ? 'day' : 'days'}`
  return (
    <AppTooltip title={age.flagged ? <TipLines lines={[since, waiting]} /> : since} describeChild>
      <Box component="time" dateTime={entry.at} sx={age.flagged ? flaggedAgeSx : undefined}>
        <span aria-hidden="true">{age.label}</span>
        <Box component="span" sx={visuallyHiddenSx}>{age.flagged ? `${since}. ${waiting}` : since}</Box>
      </Box>
    </AppTooltip>
  )
}
