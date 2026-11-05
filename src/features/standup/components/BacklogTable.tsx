import { Fragment, memo, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Badge, Box, Button, IconButton, Link, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgChevronDown from '@stratakit/icons/chevron-down.svg'
import svgChevronRight from '@stratakit/icons/chevron-right.svg'
import svgSortDescending from '@stratakit/icons/sort-descending.svg'
import svgStatusWarning from '@stratakit/icons/status-warning.svg'
import svgWindowPopout from '@stratakit/icons/window-popout.svg'
import { AdoAvatar } from './AdoAvatar'
import { AppTooltip as Tooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { abbreviateState } from './workItemCardDisplay'
import { UNASSIGNED_LABEL } from '../utils/backlogFilter'
import type { BacklogTierThresholds } from '../utils/backlogOptions'
import type { BacklogSprint } from '../utils/backlogSprint'
import { BACKLOG_TIER_COLORS, groupBacklogBugsByTier, type BacklogTierGroup, type BacklogTierKey } from '../utils/backlogTiers'
import {
  describeBacklogValue,
  formatAssignee,
  formatBacklogValue,
  formatCreatedDate,
  formatValueTerm,
  getBacklogAgeDays,
  getImpactDescription,
  getSeverityDisplay,
  getValueMeterPercent,
  MIN_ADJUSTED_EFFORT,
  type RankedBacklogBug,
} from '../utils/backlogValue'
import { formatDayCount, formatSprintDateRange } from '../utils/sprintDates'
import { formatEffortPoints } from '../utils/sprintEffortTotals'

type BacklogTableProps = {
  bugs: RankedBacklogBug[]
  /** One line per bug: the first tag only, and the assignee's avatar without their name. */
  compact?: boolean
  /** Where each Value tier starts; the bugs are grouped under a header per tier. */
  tierThresholds: BacklogTierThresholds
  /** Tiers that show only their header. */
  collapsedTiers: ReadonlySet<BacklogTierKey>
  onToggleTier: (tier: BacklogTierKey) => void
}

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

const TRACK_COLOR = 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)'

const COLUMNS: ReadonlyArray<{ key: string; label: ReactNode; align?: 'right'; tip?: string }> = [
  {
    key: 'rank',
    label: (
      <>
        <span aria-hidden="true">#</span>
        <Box component="span" sx={visuallyHiddenSx}>Rank</Box>
      </>
    ),
    align: 'right',
  },
  {
    key: 'value',
    label: (
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        Value
        <Icon href={svgSortDescending} alt="" />
      </Box>
    ),
    tip: `Highest Value first. Value = Severity × Impact ÷ Effort × 10, with Effort counted as at least ${MIN_ADJUSTED_EFFORT}.`,
  },
  { key: 'bug', label: 'Bug' },
  { key: 'severity', label: 'Severity' },
  { key: 'impact', label: 'Impact', tip: 'The Priority field: how many users hit the bug, from 1 (most) to 4 (few).' },
  { key: 'effort', label: 'Effort', align: 'right' },
  { key: 'age', label: 'Age', align: 'right', tip: 'Time since the bug was created.' },
  { key: 'sprint', label: 'Sprint' },
  { key: 'state', label: 'State' },
  { key: 'assignee', label: 'Assigned to' },
]

const noWrapSx: SxProps<Theme> = { whiteSpace: 'nowrap' }

// The tier's color comes from its tbody, so the memoized rows need no tier of their own and keep their props.
const rankCellSx: SxProps<Theme> = {
  whiteSpace: 'nowrap',
  color: TERTIARY_TEXT_COLOR,
  fontVariantNumeric: 'tabular-nums',
  boxShadow: 'inset 3px 0 0 var(--backlog-tier, transparent)',
}

// The id sits before the title like on the cards. Plain class names styled from the cell keep each row to one sx.
const bugCellSx: SxProps<Theme> = {
  minWidth: 300,
  '& .backlog-bug-id': {
    mr: 0.5,
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: 'text.secondary',
  },
}

// Compact rows keep the bug to one line. Only the title text gives way, ending in an ellipsis with the full title in the
// link's tooltip, so the id, the new-tab icon, and the tags stay whole. In a flex row the text spaces between them
// collapse, so the gap spaces them instead.
const compactBugSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.5,
  maxWidth: 520,
  whiteSpace: 'nowrap',
  '& > a': { display: 'inline-flex', alignItems: 'center', minWidth: 0 },
  '& .backlog-bug-title': { overflow: 'hidden', textOverflow: 'ellipsis' },
  '& > ul': { flex: 'none' },
}

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
const headCellSx: SxProps<Theme> = { bgcolor: 'background.paper', whiteSpace: 'nowrap', top: '-1px', zIndex: 3 }

const mutedSx: SxProps<Theme> = { color: TERTIARY_TEXT_COLOR }

/** Tooltip text on separate lines; the first can be bold, like the sum above the terms it explains. */
function TipLines({ lines, boldFirst = false }: { lines: string[]; boldFirst?: boolean }) {
  return lines.map((line, index) => (
    <Box key={line} component="span" sx={{ display: 'block', fontWeight: boldFirst && index === 0 ? 700 : undefined }}>
      {line}
    </Box>
  ))
}

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

const SEVERITY_ASSUMED_TIP = 'Severity is not set, so the Value counts it as 4 - Low, and the bug may rank too low.'
const IMPACT_ASSUMED_TIP = 'Impact (the Priority field) is not set, so the Value counts it as 4: few users hit it.'
const EFFORT_ASSUMED_TIP = `Effort is not set, so the Value counts it as ${MIN_ADJUSTED_EFFORT} points.`
const EFFORT_RAISED_TIP = `Counted as ${MIN_ADJUSTED_EFFORT} points in the Value, the minimum.`

const valueSx: SxProps<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  cursor: 'help',
  '& > .backlog-value-number': {
    minWidth: 36,
    textAlign: 'right',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  '& > .backlog-value-meter': {
    display: 'inline-block',
    width: 44,
    height: 6,
    borderRadius: '3px',
    overflow: 'hidden',
    bgcolor: TRACK_COLOR,
  },
  '& > .backlog-value-meter > span': {
    display: 'block',
    height: '100%',
    borderRadius: '3px',
    bgcolor: 'var(--backlog-tier-meter, var(--stratakit-color-bg-accent-base))',
  },
}

/** Rendered only while the tooltip is open, so the rows do not build every bug's explanation up front. */
function ValueTip({ bug }: { bug: RankedBacklogBug }) {
  return <TipLines lines={describeBacklogValue(bug)} boldFirst />
}

/** The Value, with a meter for its size at a glance and its sum in the tooltip. */
function BugValue({ bug }: { bug: RankedBacklogBug }) {
  return (
    <Tooltip title={<ValueTip bug={bug} />} describeChild>
      <Box component="span" sx={valueSx}>
        <span className="backlog-value-number">{formatBacklogValue(bug.value)}</span>
        <span className="backlog-value-meter" aria-hidden="true">
          <span style={{ width: `${getValueMeterPercent(bug.value).toFixed(1)}%` }} />
        </span>
      </Box>
    </Tooltip>
  )
}

function BugTags({ tags, compact }: { tags: string[] | undefined; compact: boolean }) {
  if (!tags || tags.length === 0) {
    return null
  }

  const shownTags = compact ? tags.slice(0, 1) : tags
  const moreTags = tags.slice(shownTags.length)

  // Text spaces separate the title and tags rather than margins: a space drops at a line break, so a wrapped tag stays
  // flush left, and copied text keeps the tags apart.
  return (
    <>
      {' '}
      <Box component="ul" role="list" aria-label="Tags" sx={tagListSx}>
        {shownTags.map((tag, index) => (
          <Fragment key={tag}>
            {index > 0 && ' '}
            <li>
              {/* MUI shows a badge whose content is a number above max as "99+", and that includes a tag like 2026. */}
              <Badge variant="inline" type="outlined" size="small" max={Infinity} badgeContent={tag} />
            </li>
          </Fragment>
        ))}
        {moreTags.length > 0 ? (
          <>
            {' '}
            <li>
              <Tooltip title={moreTags.join(', ')} describeChild>
                <Box component="span" sx={mutedSx}>
                  <span aria-hidden="true">+{moreTags.length}</span>
                  <Box component="span" sx={visuallyHiddenSx}>{`and ${moreTags.join(', ')}`}</Box>
                </Box>
              </Tooltip>
            </li>
          </>
        ) : null}
      </Box>
    </>
  )
}

/** The id, then the title linking to the work item, then the tags. */
function BugTitle({ bug, compact }: { bug: RankedBacklogBug; compact: boolean }) {
  const link = (
    <Link href={bug.workItemUrl} target="_blank" rel="noreferrer noopener">
      <span className="backlog-bug-title">{bug.title}</span>
      <Box component="span" sx={{ display: 'inline-flex', verticalAlign: 'text-bottom', ml: 0.5 }}>
        <Icon href={svgWindowPopout} alt="" />
      </Box>
      <Box component="span" sx={visuallyHiddenSx}> (opens in a new tab)</Box>
    </Link>
  )

  return (
    <Box sx={compact ? compactBugSx : undefined}>
      <span className="backlog-bug-id">{bug.id}</span>{' '}
      {compact ? <Tooltip title={bug.title} describeChild>{link}</Tooltip> : link}
      <BugTags tags={bug.tags} compact={compact} />
    </Box>
  )
}

const severityChipSx: SxProps<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  height: 20,
  pl: '6px',
  pr: 1,
  border: '1px solid var(--backlog-severity-border, var(--stratakit-color-border-neutral-muted))',
  borderRadius: 999,
  fontSize: 11,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  color: 'var(--backlog-severity-text, var(--stratakit-color-text-neutral-secondary))',
  '&::before': {
    content: '""',
    width: 7,
    height: 7,
    borderRadius: '50%',
    bgcolor: 'var(--backlog-severity-dot, var(--stratakit-color-bg-mono-base))',
  },
  '& > b': { fontWeight: 700 },
  '&[data-level="1"]': {
    '--backlog-severity-text': 'var(--stratakit-color-text-critical-base)',
    '--backlog-severity-border': 'var(--stratakit-color-border-critical-muted)',
    '--backlog-severity-dot': 'var(--stratakit-color-bg-critical-base)',
  },
  '&[data-level="2"]': {
    '--backlog-severity-text': 'var(--stratakit-color-text-attention-base)',
    '--backlog-severity-border': 'var(--stratakit-color-border-attention-muted)',
    '--backlog-severity-dot': 'var(--stratakit-color-bg-attention-base)',
  },
  '&[data-level="4"]': {
    '--backlog-severity-text': TERTIARY_TEXT_COLOR,
    '--backlog-severity-dot': 'var(--stratakit-color-bg-mono-muted)',
  },
}

const severityUnsetSx: SxProps<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 20,
  px: 1,
  border: '1px dashed var(--stratakit-color-border-attention-base)',
  borderRadius: 999,
  fontSize: 11,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  color: 'var(--stratakit-color-text-attention-base)',
  cursor: 'help',
}

/** "S1 · Critical" in a chip whose dot and color climb with the severity; a dashed chip when it is not set. */
function BugSeverity({ severity }: { severity: string | undefined }) {
  const display = getSeverityDisplay(severity)
  if (!display) {
    return (
      <Tooltip title={SEVERITY_ASSUMED_TIP} describeChild>
        <Box component="span" sx={severityUnsetSx}>Not set</Box>
      </Tooltip>
    )
  }

  if (display.level === undefined) {
    return (
      <Tooltip title="The Value cannot read this severity, so it counts it as 4 - Low." describeChild>
        <Box component="span" sx={severityChipSx}>{display.label}</Box>
      </Tooltip>
    )
  }

  return (
    <Box component="span" sx={severityChipSx} data-level={display.level}>
      <b>S{display.level}</b> · {display.name}
    </Box>
  )
}

const impactSx: SxProps<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  cursor: 'help',
  fontVariantNumeric: 'tabular-nums',
  '& > .backlog-impact-bars': { display: 'inline-flex', alignItems: 'flex-end', gap: '2px', height: 13 },
  '& > .backlog-impact-bars > span': { width: 4, borderRadius: '1px', bgcolor: TRACK_COLOR },
  '& > .backlog-impact-bars > span:nth-of-type(1)': { height: 4 },
  '& > .backlog-impact-bars > span:nth-of-type(2)': { height: 7 },
  '& > .backlog-impact-bars > span:nth-of-type(3)': { height: 10 },
  '& > .backlog-impact-bars > span:nth-of-type(4)': { height: 13 },
  '& > .backlog-impact-bars > span[data-on]': { bgcolor: 'var(--stratakit-color-text-neutral-secondary)' },
}

const IMPACT_BAR_COUNT = 4

/** Signal bars that fill as more users hit the bug (Impact 1 fills all four), then the level as entered. */
function BugImpact({ priority, score }: { priority: number | undefined; score: number }) {
  if (priority === undefined) {
    return <AssumedDefault tip={IMPACT_ASSUMED_TIP} />
  }

  const description = getImpactDescription(priority)
  if (!description) {
    return (
      <Tooltip title="The Value cannot read this impact, so it counts it as 4: few users hit it." describeChild>
        <span>{priority}</span>
      </Tooltip>
    )
  }

  const lit = IMPACT_BAR_COUNT + 1 - priority
  const tip = [`Impact ${priority}: ${description}`, `The Priority field · scored ${formatValueTerm(score)}`]
  return (
    <Tooltip title={<TipLines lines={tip} />} describeChild>
      <Box component="span" sx={impactSx}>
        <span className="backlog-impact-bars" aria-hidden="true">
          {Array.from({ length: IMPACT_BAR_COUNT }, (_, index) => (
            <span key={index} data-on={index < lit ? '' : undefined} />
          ))}
        </span>
        {priority}
      </Box>
    </Tooltip>
  )
}

const raisedEffortSx: SxProps<Theme> = {
  cursor: 'help',
  textDecorationLine: 'underline',
  textDecorationStyle: 'dotted',
  textDecorationColor: TERTIARY_TEXT_COLOR,
  textUnderlineOffset: '3px',
}

/** The Effort as entered; one under the minimum is underlined, with a tooltip saying the Value counts the minimum. */
function BugEffort({ effort }: { effort: number | undefined }) {
  if (effort === undefined) {
    return <AssumedDefault tip={EFFORT_ASSUMED_TIP} />
  }

  if (effort < MIN_ADJUSTED_EFFORT) {
    return (
      <Tooltip title={EFFORT_RAISED_TIP} describeChild>
        <Box component="span" sx={raisedEffortSx}>{effort}</Box>
      </Tooltip>
    )
  }

  return effort
}

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

/**
 * New, where most bugs wait, is muted text; any other state is a badge so work under way stands out. A long state is
 * abbreviated as on the cards ("AFT"), with the full state in its tooltip and for screen readers.
 */
function BugState({ state }: { state: string | undefined }) {
  if (!state) {
    return <NotSet />
  }

  if (state === 'New') {
    return <Box component="span" sx={mutedSx}>{state}</Box>
  }

  const shortState = abbreviateState(state)
  const badge = <Badge variant="inline" type="outlined" size="small" max={Infinity} badgeContent={shortState} />
  if (shortState === state) {
    return badge
  }

  return (
    <Tooltip title={state} describeChild>
      <span>
        <span aria-hidden="true">{badge}</span>
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

const personSx: SxProps<Theme> = { display: 'inline-flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }
const avatarSx: SxProps<Theme> = { width: 16, height: 16, fontSize: 9, flex: '0 0 auto' }

/** The assignee's avatar and name; compact rows show only the avatar, with the name in its tooltip. */
function BugAssignee({ assignedTo, compact }: { assignedTo: RankedBacklogBug['assignedTo']; compact: boolean }) {
  const name = formatAssignee(assignedTo)
  if (!name) {
    return <Box component="span" sx={mutedSx}>{UNASSIGNED_LABEL}</Box>
  }

  // Decorative: the name is beside it, or in visually hidden text when compact, so its initial is not read twice.
  const avatar = (
    <AdoAvatar alt="" aria-hidden="true" src={assignedTo?.imageUrl} sx={avatarSx}>
      {name.trim().charAt(0).toUpperCase()}
    </AdoAvatar>
  )

  if (compact) {
    return (
      <Tooltip title={name} describeChild>
        <Box component="span" sx={personSx}>
          {avatar}
          <Box component="span" sx={visuallyHiddenSx}>{name}</Box>
        </Box>
      </Tooltip>
    )
  }

  return (
    <Box component="span" sx={personSx}>
      {avatar}
      {name}
    </Box>
  )
}

const tierHeadCellSx: SxProps<Theme> = {
  position: 'sticky',
  // The column header sticks 1px above the scroller's edge (see headCellSx), so its bottom is 1px short of its height.
  top: 'calc(var(--backlog-head-height, 37px) - 1px)',
  // Above the badges in the rows (MUI gives them z-index 1) and below the column header.
  zIndex: 2,
  p: 0,
  bgcolor: 'background.paper',
  textAlign: 'left',
  fontWeight: 400,
  // A shadow rather than a border, because a collapsed table's borders stay behind when a sticky cell moves.
  borderBottom: 0,
  boxShadow: 'inset 0 -1px 0 var(--stratakit-color-border-glow-strong-default)',
}

const tierHeadSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  minHeight: 36,
  px: 1,
  color: 'text.secondary',
  '& .backlog-tier-bar': { width: 4, height: 18, borderRadius: 999, bgcolor: 'var(--backlog-tier)', flex: 'none' },
  '& .backlog-tier-name': { color: 'text.primary', fontWeight: 700 },
  '& .backlog-tier-count': {
    minWidth: 20,
    height: 18,
    px: 0.75,
    borderRadius: 999,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    bgcolor: TRACK_COLOR,
    fontSize: 11,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  '& .backlog-tier-range': { color: TERTIARY_TEXT_COLOR },
  '& .backlog-tier-effort': { ml: 'auto', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
}

const pluralBugs = (count: number) => `${count} ${count === 1 ? 'bug' : 'bugs'}`

/** A tier's header row: its name, size, Value range, and effort, with buttons to collapse or expand its bugs. */
const TierHeader = memo(function TierHeader({
  group,
  collapsed,
  onToggle,
}: {
  group: BacklogTierGroup
  collapsed: boolean
  onToggle: (tier: BacklogTierKey) => void
}) {
  const chevronRef = useRef<HTMLButtonElement>(null)
  const { key, name, range, bugs, effortTotal, unestimatedCount } = group

  return (
    <TableRow hover={false} className="backlog-tier-header">
      <TableCell component="th" scope="rowgroup" colSpan={COLUMNS.length} sx={tierHeadCellSx}>
        <Box sx={tierHeadSx}>
          <IconButton
            ref={chevronRef}
            size="small"
            label={`${collapsed ? 'Expand' : 'Collapse'} ${name}`}
            labelPlacement="right"
            aria-expanded={!collapsed}
            onClick={() => onToggle(key)}
          >
            <Icon href={collapsed ? svgChevronRight : svgChevronDown} />
          </IconButton>
          <span className="backlog-tier-bar" aria-hidden="true" />
          <span className="backlog-tier-name">{name}</span>
          <span className="backlog-tier-count">
            <span aria-hidden="true">{bugs.length}</span>
            <Box component="span" sx={visuallyHiddenSx}>{pluralBugs(bugs.length)}</Box>
          </span>
          <span className="backlog-tier-range">{range}</span>
          <span className="backlog-tier-effort">
            <span aria-hidden="true">Σ </span>
            {formatEffortPoints(effortTotal)}
            {unestimatedCount > 0 ? ` + ${unestimatedCount} unestimated` : null}
          </span>
          {collapsed ? (
            <Button
              size="small"
              variant="text"
              aria-label={`Show ${pluralBugs(bugs.length)} in ${name}`}
              // The button goes away once the tier opens, so keep focus in the header on the chevron.
              onClick={() => {
                chevronRef.current?.focus()
                onToggle(key)
              }}
            >
              Show {bugs.length}
            </Button>
          ) : null}
        </Box>
      </TableCell>
    </TableRow>
  )
})

// Typing in the quick filter re-renders the whole page on every keystroke, and filtering hands back the same ranked bug
// objects, so memoized rows keep the cost proportional to the rows that appear or disappear rather than all of them.
const BacklogRow = memo(function BacklogRow({ bug, compact }: { bug: RankedBacklogBug; compact: boolean }) {
  return (
    <TableRow>
      <TableCell align="right" sx={rankCellSx}>{bug.rank}</TableCell>
      <TableCell sx={noWrapSx}><BugValue bug={bug} /></TableCell>
      <TableCell sx={bugCellSx}><BugTitle bug={bug} compact={compact} /></TableCell>
      <TableCell sx={noWrapSx}><BugSeverity severity={bug.severity} /></TableCell>
      <TableCell sx={noWrapSx}><BugImpact priority={bug.priority} score={bug.impactScore} /></TableCell>
      <TableCell align="right" sx={noWrapSx}><BugEffort effort={bug.effort} /></TableCell>
      <TableCell align="right" sx={noWrapSx}><BugAge createdAt={bug.createdAt} /></TableCell>
      <TableCell sx={noWrapSx}><BugSprint sprint={bug.sprint} iterationPath={bug.iterationPath} /></TableCell>
      <TableCell sx={noWrapSx}><BugState state={bug.state} /></TableCell>
      <TableCell><BugAssignee assignedTo={bug.assignedTo} compact={compact} /></TableCell>
    </TableRow>
  )
})

function tierBodyStyle(key: BacklogTierKey): CSSProperties {
  const color = BACKLOG_TIER_COLORS[key]
  return {
    '--backlog-tier': color,
    // The Low tier's own color is too faint for a meter, so its meters take the neutral fill instead of the accent.
    ...(key === 'low' ? { '--backlog-tier-meter': 'var(--stratakit-color-bg-mono-base)' } : {}),
  } as CSSProperties
}

export const BacklogTable = memo(function BacklogTable({
  bugs,
  compact = false,
  tierThresholds,
  collapsedTiers,
  onToggleTier,
}: BacklogTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const groups = groupBacklogBugsByTier(bugs, tierThresholds)

  // The tier headers stick just below the column header, whose height changes with the theme's font size.
  useLayoutEffect(() => {
    const container = containerRef.current
    const head = container?.querySelector('thead')
    if (!container || !head || typeof ResizeObserver === 'undefined') {
      return
    }

    const update = () => container.style.setProperty('--backlog-head-height', `${head.getBoundingClientRect().height}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(head)
    return () => observer.disconnect()
  }, [])

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
      <TableContainer ref={containerRef} sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Table size="small" stickyHeader aria-label="Open bugs ranked by value">
          <TableHead>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableCell key={column.key} align={column.align} sx={headCellSx}>
                  {column.tip ? (
                    <Tooltip title={column.tip} describeChild>
                      <span>{column.label}</span>
                    </Tooltip>
                  ) : column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          {groups.map((group) => {
            const collapsed = collapsedTiers.has(group.key)
            return (
              <TableBody key={group.key} data-tier={group.key} style={tierBodyStyle(group.key)}>
                <TierHeader group={group} collapsed={collapsed} onToggle={onToggleTier} />
                {collapsed ? null : group.bugs.map((bug) => (
                  <BacklogRow key={bug.id} bug={bug} compact={compact} />
                ))}
              </TableBody>
            )
          })}
        </Table>
      </TableContainer>
    </Box>
  )
})
