import { Box, Link, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgInbox from '@stratakit/icons/inbox.svg'
import svgInspection from '@stratakit/icons/inspection.svg'
import svgStatusSuccess from '@stratakit/icons/status-success.svg'
import svgTag from '@stratakit/icons/tag.svg'
import type { TriageItem } from '../../../ado/types'
import { UNASSIGNED_LABEL } from '../utils/backlogFilter'
import type { BacklogSprintResolver } from '../utils/backlogSprint'
import { describeTriageAge, formatTriageParent, getTriageAge, getTriageTitleTags, READY_TO_CLEAR_LABEL, UNKNOWN_CREATOR_LABEL } from '../utils/triageDisplay'
import type { TriageCheck, TriageReadinessChecks } from '../utils/triageOptions'
import { describeTriageClearing, getTriageChecksFor, getTriageReadiness, getTriageReasonDetails, hasTriageChecks, type TriageReason } from '../utils/triageRules'
import { AppTooltip } from './AppTooltip'
import { TipLines } from './TipLines'
import { visuallyHiddenSx } from './developmentCardDisplay'
import { ImpactBars, MissingValue, NotSet, PersonLabel, SeverityChip, SprintLabel, StateLabel } from './WorkItemFields'
import { WorkItemTitle } from './WorkItemTitle'
import { METER_TRACK_COLOR, workItemTitleCellSx } from './workItemTableDisplay'

const TITLE_COLUMN_MIN_WIDTH = 360

type TriageColumn = { key: string; label: string; width?: number; align?: 'right'; tip?: string }

// Backlog's columns and widths, with why the item is listed beside it, then who created the item and its parent. The
// title column takes the spare width.
const COLUMNS: readonly TriageColumn[] = [
  { key: 'item', label: 'Work item' },
  { key: 'why', label: 'Why', width: 136, tip: 'The Triage rules the item meets.' },
  { key: 'readiness', label: 'Readiness', width: 180, tip: 'What is still missing before the item is ready to clear. Set the checks for each type in Triage options.' },
  { key: 'severity', label: 'Severity', width: 128 },
  { key: 'impact', label: 'Impact', width: 88, tip: 'The Priority field: how many users hit it, from 1 (most) to 4 (few).' },
  { key: 'effort', label: 'Effort', width: 80, align: 'right' },
  { key: 'age', label: 'Age', width: 72, align: 'right' },
  { key: 'sprint', label: 'Sprint', width: 176 },
  { key: 'state', label: 'State', width: 128 },
  { key: 'assignee', label: 'Assigned to', width: 176 },
  { key: 'creator', label: 'Created by', width: 176 },
  { key: 'parent', label: 'Parent', width: 240 },
]

const SEVERITY_UNSET_TIP = 'Severity is not set yet.'
const IMPACT_UNSET_TIP = 'Impact (the Priority field) is not set yet.'
const EFFORT_UNSET_TIP = 'Effort is not set yet.'

// Rows leave and return as the quick filter changes, so fixed columns keep the table from shifting under the pointer.
const tableSx: SxProps<Theme> = { tableLayout: 'fixed' }

// Sticks 1px above the scroller's edge, as on Backlog, so Chromium's rounding never shows a row behind the header.
const headCellSx: SxProps<Theme> = { bgcolor: 'background.paper', whiteSpace: 'nowrap', top: '-1px', zIndex: 3 }
const noWrapSx: SxProps<Theme> = { whiteSpace: 'nowrap' }
const wrapSx: SxProps<Theme> = { overflowWrap: 'anywhere' }

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
  '& .missing-mark': {
    display: 'inline-grid',
    placeItems: 'center',
    width: 14,
    height: 14,
    border: '1px dashed var(--stratakit-color-border-attention-base)',
    borderRadius: '50%',
    fontSize: 9,
    fontWeight: 700,
    lineHeight: 1,
  },
}

// Severity, Impact and Effort are flagged like on Backlog when they are one of the item type's readiness checks. Otherwise
// the type may not have the field at all, so an empty one is a plain dash.
type ChecksProps = { item: TriageItem; checks: readonly TriageCheck[] }

function TriageSeverity({ item, checks }: ChecksProps) {
  return item.severity === undefined && !checks.includes('severity')
    ? <NotSet />
    : <SeverityChip severity={item.severity} unsetTip={SEVERITY_UNSET_TIP} />
}

function TriageImpact({ item, checks }: ChecksProps) {
  return item.priority === undefined && !checks.includes('impact')
    ? <NotSet />
    : <ImpactBars priority={item.priority} detail="The Priority field" missingTip={IMPACT_UNSET_TIP} />
}

function TriageEffort({ item, checks }: ChecksProps) {
  if (item.effort !== undefined) return item.effort
  return checks.includes('effort') ? <MissingValue tip={EFFORT_UNSET_TIP} /> : <NotSet />
}

/** "Ready to clear" once every check for the item's type passes, otherwise the fields still missing. */
function TriageReadinessLabel({ item, checks, clearing }: { item: TriageItem; checks: TriageReadinessChecks; clearing: string }) {
  const readiness = getTriageReadiness(item, checks)
  if (readiness.ready) {
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

function TypeIcon({ item }: { item: TriageItem }) {
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

function TriageReasons({ item, clearing }: { item: TriageItem; clearing: string }) {
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

/** Working days since the item arrived, amber once it has waited `flagDays` or more. */
function TriageAgeLabel({ createdAt, flagDays }: { createdAt: string | undefined; flagDays: number }) {
  const age = getTriageAge(createdAt, flagDays)
  if (createdAt === undefined || age === undefined) return <NotSet />

  const created = describeTriageAge(createdAt, age)
  const waiting = `Waiting longer than ${flagDays} working ${flagDays === 1 ? 'day' : 'days'}`
  return (
    <AppTooltip title={age.flagged ? <TipLines lines={[created, waiting]} /> : created} describeChild>
      <Box component="time" dateTime={createdAt} sx={age.flagged ? flaggedAgeSx : undefined}>
        <span aria-hidden="true">{age.label}</span>
        <Box component="span" sx={visuallyHiddenSx}>{age.flagged ? `${created}. ${waiting}` : created}</Box>
      </Box>
    </AppTooltip>
  )
}

type TriageTableProps = {
  items: TriageItem[]
  resolveSprint: BacklogSprintResolver
  /** Working days after which an item's age turns amber. */
  ageFlagDays: number
  /**
   * Whether to show the Assigned to and Parent columns. New items rarely have either, so the page hides a column no
   * item in the queue fills; it decides from the whole queue so the columns hold still while the quick filter changes.
   */
  showAssignee?: boolean
  showParent?: boolean
  /** The fields each type must have filled in; the Readiness column is hidden while neither list has any. */
  readinessChecks: TriageReadinessChecks
  /** The iteration paths that take a new bug off the queue, named in each item's "Clears when" text. */
  excludedIterationPaths: readonly string[]
}

export function TriageTable({
  items, resolveSprint, ageFlagDays, showAssignee = true, showParent = true, readinessChecks, excludedIterationPaths,
}: TriageTableProps) {
  const showReadiness = hasTriageChecks(readinessChecks)
  const columns = COLUMNS
    .filter((column) => (column.key !== 'assignee' || showAssignee) && (column.key !== 'parent' || showParent)
      && (column.key !== 'readiness' || showReadiness))
    .map((column) => column.key === 'age'
      ? { ...column, tip: `Working days since the item was created. It turns amber after ${ageFlagDays}.` }
      : column)
  const minWidth = columns.reduce((total, column) => total + (column.width ?? TITLE_COLUMN_MIN_WIDTH), 0)

  return (
    // Relative so the absolutely positioned visually hidden text is contained by this scroller, not the page.
    <TableContainer component="main" sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', scrollbarGutter: 'stable' }}>
      <Table stickyHeader size="small" aria-label="Triage work items, oldest created first" sx={tableSx} style={{ minWidth }}>
        <colgroup>
          {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
        </colgroup>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.key} scope="col" align={column.align} sx={headCellSx}>
                {column.tip ? <AppTooltip title={column.tip} describeChild><span>{column.label}</span></AppTooltip> : column.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => {
            const checks = getTriageChecksFor(item, readinessChecks)
            const clearing = describeTriageClearing(item, excludedIterationPaths)
            return (
              <TableRow key={item.id}>
                <TableCell component="th" scope="row" sx={workItemTitleCellSx}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <TypeIcon item={item} />
                    <WorkItemTitle item={{ ...item, tags: getTriageTitleTags(item) }} />
                  </Box>
                </TableCell>
                <TableCell><TriageReasons item={item} clearing={clearing} /></TableCell>
                {showReadiness ? <TableCell><TriageReadinessLabel item={item} checks={readinessChecks} clearing={clearing} /></TableCell> : null}
                <TableCell sx={noWrapSx}><TriageSeverity item={item} checks={checks} /></TableCell>
                <TableCell sx={noWrapSx}><TriageImpact item={item} checks={checks} /></TableCell>
                <TableCell align="right" sx={noWrapSx}><TriageEffort item={item} checks={checks} /></TableCell>
                <TableCell align="right" sx={noWrapSx}><TriageAgeLabel createdAt={item.createdAt} flagDays={ageFlagDays} /></TableCell>
                <TableCell sx={noWrapSx}><SprintLabel sprint={resolveSprint(item.iterationPath)} iterationPath={item.iterationPath} /></TableCell>
                <TableCell sx={noWrapSx}><StateLabel state={item.state} /></TableCell>
                {showAssignee ? <TableCell><PersonLabel person={item.assignedTo} emptyLabel={UNASSIGNED_LABEL} /></TableCell> : null}
                <TableCell><PersonLabel person={item.createdBy} emptyLabel={UNKNOWN_CREATOR_LABEL} /></TableCell>
                {showParent ? (
                  <TableCell sx={wrapSx}>
                    {item.parent ? (
                      <Link href={item.parent.workItemUrl} target="_blank" rel="noopener noreferrer">{formatTriageParent(item.parent)}</Link>
                    ) : <NotSet />}
                  </TableCell>
                ) : null}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}