import { Fragment, memo } from 'react'
import { Badge, Box, Link, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgStatusWarning from '@stratakit/icons/status-warning.svg'
import svgWindowPopout from '@stratakit/icons/window-popout.svg'
import { AppTooltip as Tooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { abbreviateState } from './workItemCardDisplay'
import { UNASSIGNED_LABEL } from '../utils/backlogFilter'
import type { BacklogSprint } from '../utils/backlogSprint'
import {
  formatAssignee,
  formatBacklogValue,
  formatCreatedDate,
  getBacklogAgeDays,
  MIN_ADJUSTED_EFFORT,
  type RankedBacklogBug,
} from '../utils/backlogValue'
import { formatDayCount, formatSprintDateRange } from '../utils/sprintDates'

type BacklogTableProps = {
  bugs: RankedBacklogBug[]
}

const COLUMNS: ReadonlyArray<{ label: string; align?: 'right' }> = [
  { label: 'ID' },
  { label: 'Value', align: 'right' },
  { label: 'Title' },
  { label: 'Age', align: 'right' },
  { label: 'Assigned To' },
  { label: 'State' },
  { label: 'Sprint' },
  { label: 'Severity' },
  { label: 'Impact', align: 'right' },
  { label: 'Effort', align: 'right' },
]

// MUI's sx reads a bare 1 as 100%, so the 1px sizes must be strings.
const visuallyHiddenSx: SxProps<Theme> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}

const noWrapSx: SxProps<Theme> = { whiteSpace: 'nowrap' }

// Tags flow like words after the title, so many or long tags wrap with the title instead of widening the column. The
// items are styled from the list because there can be thousands of them and a Box with its own sx costs on every mount.
const tagListSx: SxProps<Theme> = {
  display: 'inline',
  m: 0,
  p: 0,
  listStyle: 'none',
  '& > li': { display: 'inline', whiteSpace: 'nowrap' },
}

// The scroller sits at a fractional offset (the app's 0.8px hairlines), and Chromium can snap a stuck header 1-2px
// below the scroller's clip edge, exposing the row scrolled behind it. Sticking 1px above the edge keeps the header
// flush with the clip. Larger offsets are worse: the clip's own rounding then decides where the header is visible.
const headCellSx: SxProps<Theme> = { bgcolor: 'background.paper', whiteSpace: 'nowrap', top: '-1px' }

function NotSet() {
  return (
    <>
      <span aria-hidden="true">&mdash;</span>
      <Box component="span" sx={visuallyHiddenSx}>Not set</Box>
    </>
  )
}

const assumedMarkSx: SxProps<Theme> = {
  display: 'inline-grid',
  placeItems: 'center',
  minWidth: 18,
  height: 18,
  px: 0.5,
  border: '1px dashed var(--stratakit-color-border-attention-base)',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  color: 'var(--stratakit-color-text-attention-base)',
  cursor: 'help',
}

/** A dashed "?" for a Value input left empty, whose tooltip says what the Value assumes instead. */
function AssumedDefault({ tip }: { tip: string }) {
  return (
    <Tooltip title={tip} describeChild>
      <Box component="span" sx={assumedMarkSx}>
        <span aria-hidden="true">?</span>
        <Box component="span" sx={visuallyHiddenSx}>Not set</Box>
      </Box>
    </Tooltip>
  )
}

const SEVERITY_ASSUMED_TIP = 'Severity is not set, so Value assumes 4 - Low.'
const IMPACT_ASSUMED_TIP = 'Impact (the Priority field) is not set, so Value assumes 4.'
const EFFORT_ASSUMED_TIP = `Effort is not set, so Value assumes ${MIN_ADJUSTED_EFFORT} points.`

const mutedSx: SxProps<Theme> = { color: TERTIARY_TEXT_COLOR }

/** The age, such as "4mo", with the created date in its tooltip; screen readers read the date instead. */
function BugAge({ createdAt }: { createdAt: string | undefined }) {
  const days = getBacklogAgeDays(createdAt)
  if (createdAt === undefined || days === undefined) {
    return <NotSet />
  }

  const created = `Created ${formatCreatedDate(createdAt)}`
  return (
    <Tooltip title={created} describeChild>
      <time dateTime={createdAt}>
        <span aria-hidden="true">{formatDayCount(days)}</span>
        <Box component="span" sx={visuallyHiddenSx}>{created}</Box>
      </time>
    </Tooltip>
  )
}

/** A long state abbreviated as on the cards ("AFT"), with the full state in its tooltip and for screen readers. */
function BugState({ state }: { state: string | undefined }) {
  if (!state) {
    return <NotSet />
  }

  const shortState = abbreviateState(state)
  if (shortState === state) {
    return state
  }

  return (
    <Tooltip title={state} describeChild>
      <span>
        <span aria-hidden="true">{shortState}</span>
        <Box component="span" sx={visuallyHiddenSx}>{state}</Box>
      </span>
    </Tooltip>
  )
}

const SPRINT_COLORS: Record<BacklogSprint['kind'], string> = {
  current: 'var(--stratakit-color-text-accent-strong)',
  next: 'text.primary',
  future: 'text.primary',
  past: 'var(--stratakit-color-text-attention-base)',
  backlog: TERTIARY_TEXT_COLOR,
  unknown: 'text.secondary',
}

const SPRINT_ICONS: Partial<Record<BacklogSprint['kind'], { href: string; color: string }>> = {
  current: { href: svgCalendar, color: 'var(--stratakit-color-icon-accent-strong)' },
  next: { href: svgCalendar, color: 'var(--stratakit-color-icon-neutral-secondary)' },
  past: { href: svgStatusWarning, color: 'var(--stratakit-color-icon-attention-base)' },
}

/** "This sprint", "Next sprint", "Sprint 12 · ended", or "Backlog", with the sprint's dates or the path in a tooltip. */
function BugSprint({ sprint, iterationPath }: { sprint: BacklogSprint; iterationPath: string | undefined }) {
  const { iteration } = sprint
  const tip = iteration
    ? `${iteration.name}: ${formatSprintDateRange(iteration.startDate, iteration.finishDate)}`
    : iterationPath?.trim() || 'No iteration path'
  const icon = SPRINT_ICONS[sprint.kind]

  return (
    <Tooltip title={tip} describeChild>
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          color: SPRINT_COLORS[sprint.kind],
          fontWeight: sprint.kind === 'current' ? 600 : undefined,
        }}
      >
        {icon ? <Icon href={icon.href} alt="" style={{ color: icon.color }} /> : null}
        {sprint.label}
      </Box>
    </Tooltip>
  )
}

function BugAssignee({ assignedTo }: { assignedTo: RankedBacklogBug['assignedTo'] }) {
  const name = formatAssignee(assignedTo)
  return name || <Box component="span" sx={mutedSx}>{UNASSIGNED_LABEL}</Box>
}

function BugTags({ tags }: { tags: string[] | undefined }) {
  if (!tags || tags.length === 0) {
    return null
  }

  // Text spaces separate the title and tags rather than margins: a space drops at a line break, so a wrapped tag stays
  // flush left, and copied text keeps the tags apart.
  return (
    <>
      {' '}
      <Box component="ul" role="list" aria-label="Tags" sx={tagListSx}>
        {tags.map((tag, index) => (
          <Fragment key={tag}>
            {index > 0 && ' '}
            <li>
              {/* MUI shows a badge whose content is a number above max as "99+", and that includes a tag like 2026. */}
              <Badge variant="inline" type="outlined" size="small" max={Infinity} badgeContent={tag} />
            </li>
          </Fragment>
        ))}
      </Box>
    </>
  )
}

// Typing in the quick filter re-renders the whole page on every keystroke, and filtering hands back the same ranked bug
// objects, so memoized rows keep the cost proportional to the rows that appear or disappear rather than all of them.
const BacklogRow = memo(function BacklogRow({ bug }: { bug: RankedBacklogBug }) {
  return (
    <TableRow>
      <TableCell sx={noWrapSx}>{bug.id}</TableCell>
      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatBacklogValue(bug.value)}</TableCell>
      <TableCell sx={{ minWidth: 280 }}>
        <Link href={bug.workItemUrl} target="_blank" rel="noreferrer noopener">
          {bug.title}
          <Box component="span" sx={{ display: 'inline-flex', verticalAlign: 'text-bottom', ml: 0.5 }}>
            <Icon href={svgWindowPopout} alt="" />
          </Box>
          <Box component="span" sx={visuallyHiddenSx}> (opens in a new tab)</Box>
        </Link>
        <BugTags tags={bug.tags} />
      </TableCell>
      <TableCell align="right" sx={noWrapSx}><BugAge createdAt={bug.createdAt} /></TableCell>
      <TableCell><BugAssignee assignedTo={bug.assignedTo} /></TableCell>
      <TableCell sx={noWrapSx}><BugState state={bug.state} /></TableCell>
      <TableCell sx={noWrapSx}><BugSprint sprint={bug.sprint} iterationPath={bug.iterationPath} /></TableCell>
      <TableCell sx={noWrapSx}>{bug.severity || <AssumedDefault tip={SEVERITY_ASSUMED_TIP} />}</TableCell>
      <TableCell align="right">{bug.priority ?? <AssumedDefault tip={IMPACT_ASSUMED_TIP} />}</TableCell>
      <TableCell align="right">{bug.effort ?? <AssumedDefault tip={EFFORT_ASSUMED_TIP} />}</TableCell>
    </TableRow>
  )
})

export const BacklogTable = memo(function BacklogTable({ bugs }: BacklogTableProps) {
  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
      }}
    >
      {/* Relative so the absolutely positioned visually hidden text is contained by this scroller, not the page. */}
      <TableContainer sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Table size="small" stickyHeader aria-label="Open bugs ranked by value">
          <TableHead>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableCell key={column.label} align={column.align} sx={headCellSx}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {bugs.map((bug) => (
              <BacklogRow key={bug.id} bug={bug} />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
})
