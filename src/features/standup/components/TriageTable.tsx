import { Box, Link, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgInspection from '@stratakit/icons/inspection.svg'
import type { TriageItem } from '../../../ado/types'
import { UNASSIGNED_LABEL } from '../utils/backlogFilter'
import type { BacklogSprintResolver } from '../utils/backlogSprint'
import { formatTriageParent, UNKNOWN_CREATOR_LABEL } from '../utils/triageDisplay'
import { AppTooltip } from './AppTooltip'
import { CreatedAge, ImpactBars, MissingValue, NotSet, PersonLabel, SeverityChip, SprintLabel, StateLabel } from './WorkItemFields'
import { WorkItemTitle } from './WorkItemTitle'
import { workItemTitleCellSx } from './workItemTableDisplay'

const TITLE_COLUMN_MIN_WIDTH = 360

// Backlog's columns and widths, then who created the item and its parent. The title column takes the spare width.
const COLUMNS: ReadonlyArray<{ key: string; label: string; width?: number; align?: 'right'; tip?: string }> = [
  { key: 'item', label: 'Work item' },
  { key: 'severity', label: 'Severity', width: 128 },
  { key: 'impact', label: 'Impact', width: 88, tip: 'The Priority field: how many users hit it, from 1 (most) to 4 (few).' },
  { key: 'effort', label: 'Effort', width: 80, align: 'right' },
  { key: 'age', label: 'Age', width: 72, align: 'right', tip: 'Time since the item was created.' },
  { key: 'sprint', label: 'Sprint', width: 176 },
  { key: 'state', label: 'State', width: 128 },
  { key: 'assignee', label: 'Assigned to', width: 176 },
  { key: 'creator', label: 'Created by', width: 176 },
  { key: 'parent', label: 'Parent', width: 240 },
]
const TABLE_MIN_WIDTH = COLUMNS.reduce((total, column) => total + (column.width ?? TITLE_COLUMN_MIN_WIDTH), 0)

const SEVERITY_UNSET_TIP = 'Severity is not set yet.'
const IMPACT_UNSET_TIP = 'Impact (the Priority field) is not set yet.'
const EFFORT_UNSET_TIP = 'Effort is not set yet.'

// Rows leave and return as the quick filter changes, so fixed columns keep the table from shifting under the pointer.
const tableSx: SxProps<Theme> = { tableLayout: 'fixed', minWidth: TABLE_MIN_WIDTH }

// Sticks 1px above the scroller's edge, as on Backlog, so Chromium's rounding never shows a row behind the header.
const headCellSx: SxProps<Theme> = { bgcolor: 'background.paper', whiteSpace: 'nowrap', top: '-1px', zIndex: 3 }
const noWrapSx: SxProps<Theme> = { whiteSpace: 'nowrap' }
const wrapSx: SxProps<Theme> = { overflowWrap: 'anywhere' }

// The type icon hangs beside the title, centered on its first line, so wrapped title and tag lines stay aligned with
// the id rather than running under the icon.
const typeIconSx: SxProps<Theme> = { display: 'inline-flex', alignItems: 'center', height: '1lh', flexShrink: 0 }

// Severity, Impact and Effort are what a bug's triage settles, so an empty one on a bug is flagged like on Backlog. Other
// types may not have the field at all, so theirs are a plain dash.
const isBug = (item: TriageItem) => item.workItemType.toLowerCase() === 'bug'

function TriageSeverity({ item }: { item: TriageItem }) {
  return item.severity === undefined && !isBug(item) ? <NotSet /> : <SeverityChip severity={item.severity} unsetTip={SEVERITY_UNSET_TIP} />
}

function TriageImpact({ item }: { item: TriageItem }) {
  return item.priority === undefined && !isBug(item)
    ? <NotSet />
    : <ImpactBars priority={item.priority} detail="The Priority field" missingTip={IMPACT_UNSET_TIP} />
}

function TriageEffort({ item }: { item: TriageItem }) {
  if (item.effort !== undefined) return item.effort
  return isBug(item) ? <MissingValue tip={EFFORT_UNSET_TIP} /> : <NotSet />
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

export function TriageTable({ items, resolveSprint }: { items: TriageItem[]; resolveSprint: BacklogSprintResolver }) {
  return (
    // Relative so the absolutely positioned visually hidden text is contained by this scroller, not the page.
    <TableContainer component="main" sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', scrollbarGutter: 'stable' }}>
      <Table stickyHeader size="small" aria-label="Triage work items, oldest created first" sx={tableSx}>
        <colgroup>
          {COLUMNS.map((column) => <col key={column.key} style={{ width: column.width }} />)}
        </colgroup>
        <TableHead>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableCell key={column.key} scope="col" align={column.align} sx={headCellSx}>
                {column.tip ? <AppTooltip title={column.tip} describeChild><span>{column.label}</span></AppTooltip> : column.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell component="th" scope="row" sx={workItemTitleCellSx}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <TypeIcon item={item} />
                  <WorkItemTitle item={item} />
                </Box>
              </TableCell>
              <TableCell sx={noWrapSx}><TriageSeverity item={item} /></TableCell>
              <TableCell sx={noWrapSx}><TriageImpact item={item} /></TableCell>
              <TableCell align="right" sx={noWrapSx}><TriageEffort item={item} /></TableCell>
              <TableCell align="right" sx={noWrapSx}><CreatedAge createdAt={item.createdAt} /></TableCell>
              <TableCell sx={noWrapSx}><SprintLabel sprint={resolveSprint(item.iterationPath)} iterationPath={item.iterationPath} /></TableCell>
              <TableCell sx={noWrapSx}><StateLabel state={item.state} /></TableCell>
              <TableCell><PersonLabel person={item.assignedTo} emptyLabel={UNASSIGNED_LABEL} /></TableCell>
              <TableCell><PersonLabel person={item.createdBy} emptyLabel={UNKNOWN_CREATOR_LABEL} /></TableCell>
              <TableCell sx={wrapSx}>
                {item.parent ? (
                  <Link href={item.parent.workItemUrl} target="_blank" rel="noopener noreferrer">{formatTriageParent(item.parent)}</Link>
                ) : <NotSet />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}