import { Box, Link, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import type { TriageItem } from '../../../ado/types'
import { UNASSIGNED_LABEL } from '../utils/backlogFilter'
import type { BacklogSprintResolver } from '../utils/backlogSprint'
import { formatTriageParent, getTriageTitleTags, UNKNOWN_CREATOR_LABEL } from '../utils/triageDisplay'
import type { TriageReadinessChecks } from '../utils/triageOptions'
import { describeTriageClearing, getTriageChecksFor, hasTriageChecks } from '../utils/triageRules'
import type { TriageMatch } from '../utils/triageSimilar'
import { AppTooltip } from './AppTooltip'
import {
  TriageAgeLabel, TriageEffort, TriageImpact, TriageReadinessLabel, TriageReasons, TriageSeverity, TriageTypeIcon,
} from './TriageFields'
import { TriageMatchStrip } from './TriageSimilar'
import { describeTriageMatch } from './triageSimilarDisplay'
import { NotSet, PersonLabel, SprintLabel, StateLabel } from './WorkItemFields'
import { WorkItemTitle } from './WorkItemTitle'
import { workItemTitleCellSx } from './workItemTableDisplay'

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

// Rows leave and return as the quick filter changes, so fixed columns keep the table from shifting under the pointer.
const tableSx: SxProps<Theme> = { tableLayout: 'fixed' }

// Sticks 1px above the scroller's edge, as on Backlog, so Chromium's rounding never shows a row behind the header.
const headCellSx: SxProps<Theme> = { bgcolor: 'background.paper', whiteSpace: 'nowrap', top: '-1px', zIndex: 3 }
const noWrapSx: SxProps<Theme> = { whiteSpace: 'nowrap' }
const wrapSx: SxProps<Theme> = { overflowWrap: 'anywhere' }
const titleRowSx: SxProps<Theme> = { display: 'flex', alignItems: 'flex-start', gap: 1 }
// The match strip sits under the title, only as wide as its text.
const titleStackSx: SxProps<Theme> = { display: 'grid', justifyItems: 'start', gap: 0.5, minWidth: 0 }
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
  /** Tags that mean the item is waiting on someone else, so its age is never flagged. */
  waitingTags: readonly string[]
  /** Each item's closest similar item, shown under its title. */
  matches?: ReadonlyMap<number, TriageMatch>
  onCompare?: (itemId: number) => void
}

export function TriageTable({
  items, resolveSprint, ageFlagDays, showAssignee = true, showParent = true, readinessChecks, excludedIterationPaths, waitingTags,
  matches, onCompare,
}: TriageTableProps) {
  const showReadiness = hasTriageChecks(readinessChecks)
  const columns = COLUMNS
    .filter((column) => (column.key !== 'assignee' || showAssignee) && (column.key !== 'parent' || showParent)
      && (column.key !== 'readiness' || showReadiness))
    .map((column) => column.key === 'age'
      ? { ...column, tip: `Working days since the item entered triage. It turns amber after ${ageFlagDays}, unless the item is waiting on someone else.` }
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
            const match = matches?.get(item.id)
            return (
              <TableRow key={item.id}>
                <TableCell component="th" scope="row" sx={workItemTitleCellSx}>
                  <Box sx={titleRowSx}>
                    <TriageTypeIcon item={item} />
                    {match && onCompare ? (
                      <Box sx={titleStackSx}>
                        <WorkItemTitle item={{ ...item, tags: getTriageTitleTags(item) }} />
                        <TriageMatchStrip itemId={item.id} match={match} detail={describeTriageMatch(match, resolveSprint)} compact onCompare={onCompare} />
                      </Box>
                    ) : <WorkItemTitle item={{ ...item, tags: getTriageTitleTags(item) }} />}
                  </Box>
                </TableCell>
                <TableCell><TriageReasons item={item} clearing={clearing} /></TableCell>
                {showReadiness ? <TableCell><TriageReadinessLabel item={item} checks={readinessChecks} clearing={clearing} /></TableCell> : null}
                <TableCell sx={noWrapSx}><TriageSeverity item={item} checks={checks} /></TableCell>
                <TableCell sx={noWrapSx}><TriageImpact item={item} checks={checks} /></TableCell>
                <TableCell align="right" sx={noWrapSx}><TriageEffort item={item} checks={checks} /></TableCell>
                <TableCell align="right" sx={noWrapSx}><TriageAgeLabel item={item} flagDays={ageFlagDays} waitingTags={waitingTags} /></TableCell>
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