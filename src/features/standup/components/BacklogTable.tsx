import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { Box, Button, Checkbox, IconButton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgChevronRight from '@stratakit/icons/chevron-right.svg'
import svgFlag from '@stratakit/icons/flag.svg'
import svgSortDescending from '@stratakit/icons/sort-descending.svg'
import { AppTooltip as Tooltip } from './AppTooltip'
import { TipLines } from './TipLines'
import { CreatedAge, ImpactBars, MissingValue, PersonLabel, SeverityChip, SprintLabel, StateLabel } from './WorkItemFields'
import { PreviewToggleButton } from './WorkItemPreviewPanel'
import { WorkItemTitle } from './WorkItemTitle'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { revealPreviewToggles, type PreviewControls } from './workItemPreviewDisplay'
import { METER_TRACK_COLOR, workItemTitleCellSx } from './workItemTableDisplay'
import { isPreviewRowClick } from '../hooks/usePreviewPanel'
import { UNASSIGNED_LABEL } from '../utils/backlogFilter'
import type { BacklogTierThresholds } from '../utils/backlogOptions'
import type { BacklogPlan, BacklogPlanPicks } from '../utils/backlogPlan'
import { getBacklogTierStyle, groupBacklogBugsByTier, type BacklogTierGroup, type BacklogTierKey } from '../utils/backlogTiers'
import {
  describeBacklogValue,
  formatBacklogValue,
  formatValueTerm,
  getValueMeterPercent,
  MIN_ADJUSTED_EFFORT,
  type RankedBacklogBug,
} from '../utils/backlogValue'
import { formatEffort, formatEffortPoints } from '../utils/sprintEffortTotals'

type BacklogTableProps = {
  bugs: RankedBacklogBug[]
  /** One line per bug: the first tag only, and the assignee's avatar without their name. */
  compact?: boolean
  /** Where each Value tier starts; the bugs are grouped under a header per tier. */
  tierThresholds: BacklogTierThresholds
  /** Tiers that show only their header. */
  collapsedTiers: ReadonlySet<BacklogTierKey>
  onToggleTier: (tier: BacklogTierKey) => void
  /** The bugs a Needs attention facet picks out; the others are dimmed. Null when no facet is on. */
  highlightedBugIds?: ReadonlySet<number> | null
  /** Plan a sprint's picks, which add a checkbox and a running effort total to each row; null when it is off. */
  plan?: BacklogTablePlan | null
  /** Which row the preview panel shows; without it the rows cannot be previewed. */
  preview?: PreviewControls
}

/** The preview controls every row shares, kept apart from the selected id so selecting a bug re-renders two rows. */
type RowPreview = Omit<PreviewControls, 'selectedId'>

export type BacklogTablePlan = {
  plan: BacklogPlan
  picks: BacklogPlanPicks
  /** Checks or unchecks a bug by hand; `wasPicked` is whether it was picked before the click. */
  onTogglePick: (id: number, wasPicked: boolean) => void
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

const BUG_COLUMN_MIN_WIDTH = 300

const COLUMNS: ReadonlyArray<{ key: string; label: ReactNode; width?: number; align?: 'right'; tip?: string }> = [
  {
    key: 'rank',
    width: 80,
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
    width: 128,
    label: (
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        Value
        <Icon href={svgSortDescending} alt="" />
      </Box>
    ),
    tip: `Highest Value first. Value = Severity × Impact ÷ Effort × 10, with Effort counted as at least ${MIN_ADJUSTED_EFFORT}.`,
  },
  { key: 'bug', label: 'Bug' },
  { key: 'severity', label: 'Severity', width: 128 },
  { key: 'impact', label: 'Impact', width: 88, tip: 'The Priority field: how many users hit the bug, from 1 (most) to 4 (few).' },
  { key: 'effort', label: 'Effort', width: 80, align: 'right' },
  { key: 'age', label: 'Age', width: 72, align: 'right', tip: 'Time since the bug was created.' },
  { key: 'sprint', label: 'Sprint', width: 176 },
  { key: 'state', label: 'State', width: 128 },
  { key: 'assignee', label: 'Assigned to', width: 200 },
]

// Plan a sprint leads with the pick checkboxes and follows Effort with the running total of the picks.
const EFFORT_COLUMN_INDEX = COLUMNS.findIndex((column) => column.key === 'effort')
const PLAN_COLUMNS: typeof COLUMNS = [
  { key: 'pick', label: <Box component="span" sx={visuallyHiddenSx}>Pick</Box>, width: 36 },
  ...COLUMNS.slice(0, EFFORT_COLUMN_INDEX + 1),
  { key: 'running', label: 'Running', width: 112, align: 'right', tip: 'The effort picked so far, counting down the list.' },
  ...COLUMNS.slice(EFFORT_COLUMN_INDEX + 1),
]

const noWrapSx: SxProps<Theme> = { whiteSpace: 'nowrap' }

// The tier's color comes from its tbody, so the memoized rows need no tier of their own and keep their props.
const TIER_BAR_SHADOW = 'inset 3px 0 0 var(--backlog-tier, transparent)'
const rankCellSx: SxProps<Theme> = {
  whiteSpace: 'nowrap',
  color: TERTIARY_TEXT_COLOR,
  fontVariantNumeric: 'tabular-nums',
  boxShadow: TIER_BAR_SHADOW,
}
// While planning, the pick checkbox is the first cell, so it carries the tier's bar instead.
const planRankCellSx: SxProps<Theme> = { ...rankCellSx, boxShadow: 'none' }
const pickCellSx: SxProps<Theme> = { width: 36, pr: 0, boxShadow: TIER_BAR_SHADOW }
const runningCellSx: SxProps<Theme> = { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

const bugCellSx: SxProps<Theme> = { ...workItemTitleCellSx, minWidth: BUG_COLUMN_MIN_WIDTH }
// The title shrinks first, so a compact row's title still ends in an ellipsis before the preview button.
const bugTitleRowSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 1,
  '& > *': { minWidth: 0 },
  '& > .preview-toggle': { flex: 'none', ml: 'auto', my: -0.5 },
}
// Rows open the preview when clicked, and stop clear of both sticky headers (columns, then tier) when J and K scroll.
const previewBodySx: SxProps<Theme> = {
  ...revealPreviewToggles('& > tr'),
  '& > tr[data-preview-id]': { cursor: 'pointer', scrollMarginTop: 'calc(var(--backlog-head-height, 37px) + 40px)' },
}

// The scroller sits at a fractional offset (the app's 0.8px hairlines), and Chromium can snap a stuck header 1-2px
// below the scroller's clip edge, exposing the row scrolled behind it. Sticking 1px above the edge keeps the header
// flush with the clip. Larger offsets are worse: the clip's own rounding then decides where the header is visible.
const headCellSx: SxProps<Theme> = { bgcolor: 'background.paper', whiteSpace: 'nowrap', top: '-1px', zIndex: 3 }

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
    bgcolor: METER_TRACK_COLOR,
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

/** The Value, with a meter for its size at a glance and, unless `explain` is off, its sum in the tooltip. */
export function BugValue({ bug, explain = true }: { bug: RankedBacklogBug; explain?: boolean }) {
  const value = (
    <Box component="span" sx={valueSx} style={explain ? undefined : { cursor: 'auto' }}>
      <span className="backlog-value-number">{formatBacklogValue(bug.value)}</span>
      <span className="backlog-value-meter" aria-hidden="true">
        <span style={{ width: `${getValueMeterPercent(bug.value).toFixed(1)}%` }} />
      </span>
    </Box>
  )
  return explain ? <Tooltip title={<ValueTip bug={bug} />} describeChild>{value}</Tooltip> : value
}

/** "S1 · Critical" in a chip whose dot and color climb with the severity; a dashed chip when it is not set. */
export function BugSeverity({ severity }: { severity: string | undefined }) {
  return (
    <SeverityChip
      severity={severity}
      unsetTip={SEVERITY_ASSUMED_TIP}
      unreadableTip="The Value cannot read this severity, so it counts it as 4 - Low."
    />
  )
}

/** Signal bars that fill as more users hit the bug, with what the level scores in the Value in the tooltip. */
export function BugImpact({ priority, score }: { priority: number | undefined; score: number }) {
  return (
    <ImpactBars
      priority={priority}
      detail={`The Priority field · scored ${formatValueTerm(score)}`}
      missingTip={IMPACT_ASSUMED_TIP}
      unknownTip="The Value cannot read this impact, so it counts it as 4: few users hit it."
    />
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
export function BugEffort({ effort }: { effort: number | undefined }) {
  if (effort === undefined) {
    return <MissingValue tip={EFFORT_ASSUMED_TIP} />
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
    bgcolor: METER_TRACK_COLOR,
    fontSize: 11,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  '& .backlog-tier-range': { color: TERTIARY_TEXT_COLOR },
  '& .backlog-tier-effort': { ml: 'auto', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  '& .backlog-tier-matches:not([data-none])': { color: 'var(--stratakit-color-text-accent-strong)', fontWeight: 600 },
  '& .backlog-tier-picked': { color: 'var(--stratakit-color-text-accent-strong)', fontWeight: 600 },
}

const pluralBugs = (count: number) => `${count} ${count === 1 ? 'bug' : 'bugs'}`

/** A tier's header row: its name, size, Value range, and effort, with buttons to collapse or expand its bugs. */
const TierHeader = memo(function TierHeader({
  group,
  collapsed,
  onToggle,
  matchCount,
  pickedCount,
  columnCount,
}: {
  group: BacklogTierGroup
  collapsed: boolean
  onToggle: (tier: BacklogTierKey) => void
  /** How many of the tier's bugs the Needs attention facet picks out, when one is on. */
  matchCount?: number
  /** How many of the tier's bugs Plan a sprint picked, when it is on. */
  pickedCount?: number
  columnCount: number
}) {
  const chevronRef = useRef<HTMLButtonElement>(null)
  const { key, name, range, bugs, effortTotal, unestimatedCount } = group

  return (
    <TableRow hover={false} className="backlog-tier-header">
      <TableCell component="th" scope="rowgroup" colSpan={columnCount} sx={tierHeadCellSx}>
        <Box sx={tierHeadSx}>
          <IconButton
            ref={chevronRef}
            size="small"
            label={`${collapsed ? 'Expand' : 'Collapse'} ${name}`}
            labelPlacement="right"
            aria-expanded={!collapsed}
            onClick={() => onToggle(key)}
          >
            <Icon href={svgChevronRight} style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }} />
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
            {matchCount !== undefined ? (
              <span className="backlog-tier-matches" data-none={matchCount === 0 ? '' : undefined}>
                {' · '}
                {matchCount} match
              </span>
            ) : null}
            {pickedCount ? (
              <span className="backlog-tier-picked">
                {' · '}
                {pickedCount} picked
              </span>
            ) : null}
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

/** Where a bug stands in Plan a sprint, which decides its checkbox and the tip that explains it. */
type PickState = 'picked' | 'hand-picked' | 'hand-skipped' | 'unpicked' | 'outside'

const PICK_TIPS: Readonly<Record<PickState, string>> = {
  picked: 'Picked in rank order · uncheck to skip',
  'hand-picked': 'Picked by hand · uncheck to drop',
  'hand-skipped': 'Skipped by hand · check to pick',
  unpicked: 'Check to pick it anyway',
  outside: 'Outside the active filter',
}

function getPickState(id: number, { plan, picks }: BacklogTablePlan): PickState {
  if (!plan.candidateIds.has(id)) {
    return 'outside'
  }
  if (plan.pickedIds.has(id)) {
    return picks.forceIn.has(id) ? 'hand-picked' : 'picked'
  }
  return picks.forceOut.has(id) ? 'hand-skipped' : 'unpicked'
}

const isPicked = (state: PickState | undefined) => state === 'picked' || state === 'hand-picked'

function PlanPick({ id, state, onToggle }: { id: number; state: PickState; onToggle?: (id: number, wasPicked: boolean) => void }) {
  const picked = isPicked(state)
  return (
    // The span holds the tooltip while the checkbox is disabled and draws the ring that marks a hand choice.
    <Tooltip title={PICK_TIPS[state]} placement="right">
      <span className="backlog-pick" data-hand={state === 'hand-picked' || state === 'hand-skipped' ? '' : undefined}>
        <Checkbox
          checked={picked}
          disabled={state === 'outside'}
          onChange={() => onToggle?.(id, picked)}
          slotProps={{ input: { 'aria-label': `Pick ${id}` } }}
        />
      </span>
    </Tooltip>
  )
}

// Typing in the quick filter re-renders the whole page on every keystroke, and filtering hands back the same ranked bug
// objects, so memoized rows keep the cost proportional to the rows that appear or disappear rather than all of them.
const BacklogRow = memo(function BacklogRow({
  bug,
  compact,
  emphasis,
  pickState,
  running,
  onTogglePick,
  preview,
  selected = false,
}: {
  bug: RankedBacklogBug
  compact: boolean
  /** With a Needs attention facet on, whether the bug is one it picks out or one dimmed behind them. */
  emphasis?: 'match' | 'dim'
  /** Set only while planning a sprint. */
  pickState?: PickState
  /** The running effort total for a pick, or why a bug above the last pick was passed over. */
  running?: string
  onTogglePick?: (id: number, wasPicked: boolean) => void
  /** Set when the rows can be previewed. */
  preview?: RowPreview
  /** Whether the preview panel shows this bug. */
  selected?: boolean
}) {
  const planning = pickState !== undefined
  const picked = isPicked(pickState)
  const title = <WorkItemTitle item={bug} compact={compact} />
  return (
    <TableRow
      data-emphasis={emphasis}
      data-picked={picked ? '' : undefined}
      selected={selected}
      data-preview-id={preview ? bug.id : undefined}
      onClick={preview ? (event) => {
        if (isPreviewRowClick(event)) preview.onSelect(bug.id)
      } : undefined}
    >
      {planning ? (
        <TableCell sx={pickCellSx}><PlanPick id={bug.id} state={pickState} onToggle={onTogglePick} /></TableCell>
      ) : null}
      <TableCell align="right" sx={planning ? planRankCellSx : rankCellSx}>{bug.rank}</TableCell>
      <TableCell sx={noWrapSx}><BugValue bug={bug} /></TableCell>
      <TableCell sx={bugCellSx}>
        {preview ? (
          <Box sx={bugTitleRowSx}>
            {title}
            <PreviewToggleButton id={bug.id} selected={selected} panelId={preview.panelId} onToggle={preview.onToggle} />
          </Box>
        ) : title}
        {emphasis === 'match' ? <Box component="span" sx={visuallyHiddenSx}>Highlighted</Box> : null}
      </TableCell>
      <TableCell sx={noWrapSx}><BugSeverity severity={bug.severity} /></TableCell>
      <TableCell sx={noWrapSx}><BugImpact priority={bug.priority} score={bug.impactScore} /></TableCell>
      <TableCell align="right" sx={noWrapSx}><BugEffort effort={bug.effort} /></TableCell>
      {planning ? (
        <TableCell align="right" sx={runningCellSx}>
          {running ? <span className={picked ? 'backlog-running' : 'backlog-skip-reason'}>{running}</span> : null}
        </TableCell>
      ) : null}
      <TableCell align="right" sx={noWrapSx}><CreatedAge createdAt={bug.createdAt} /></TableCell>
      <TableCell sx={noWrapSx}><SprintLabel sprint={bug.sprint} iterationPath={bug.iterationPath} /></TableCell>
      <TableCell sx={noWrapSx}><StateLabel state={bug.state} /></TableCell>
      <TableCell><PersonLabel person={bug.assignedTo} emptyLabel={UNASSIGNED_LABEL} compact={compact} /></TableCell>
    </TableRow>
  )
})

const cutLineCellSx: SxProps<Theme> = {
  p: 0,
  borderBottom: 0,
  '& .backlog-cut-line-rule': {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    py: 0.375,
    color: 'var(--stratakit-color-text-accent-strong)',
    fontSize: 11,
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
  },
  '& .backlog-cut-line-rule::before': {
    content: '""',
    position: 'absolute',
    insetInline: 0,
    top: '50%',
    borderTop: '2px dashed var(--stratakit-color-border-accent-base)',
  },
  '& .backlog-cut-line-label': {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.625,
    ml: 3.75,
    px: 1,
    bgcolor: 'background.paper',
    whiteSpace: 'nowrap',
  },
}

/** A pick's running effort total, or why a bug ranked above the last pick was passed over; nothing below the line. */
function describeRunning(bug: RankedBacklogBug, plan: BacklogPlan, lastPick: RankedBacklogBug | undefined): string | undefined {
  const total = plan.runningTotals.get(bug.id)
  if (total !== undefined) {
    return formatEffortPoints(total)
  }
  return lastPick && bug.rank < lastPick.rank ? plan.skipReasons.get(bug.id) : undefined
}

/** The dashed line under the last pick: everything above it fits the budget. */
function CutLine({ used, budget, count, columnCount }: { used: number; budget: number; count: number; columnCount: number }) {
  return (
    <TableRow hover={false} className="backlog-cut-line">
      <TableCell colSpan={columnCount} sx={cutLineCellSx}>
        <div className="backlog-cut-line-rule">
          <span className="backlog-cut-line-label">
            <Icon href={svgFlag} alt="" style={{ color: 'var(--stratakit-color-icon-accent-strong)' }} />
            Cut line · {formatEffort(used)} of {formatEffortPoints(budget)} · {pluralBugs(count)} above
          </span>
        </div>
      </TableCell>
    </TableRow>
  )
}

// Like the dimmed cards on the boards: rows a Needs attention facet leaves out fade, and come back on hover or focus.
const tableSx: SxProps<Theme> = {
  // Rows leave the DOM when their tier collapses; only the Bug column should absorb spare width.
  tableLayout: 'fixed',
  '& tr[data-emphasis="dim"] > td': {
    opacity: 0.35,
    filter: 'grayscale(0.6)',
    transition: 'opacity 120ms ease, filter 120ms ease',
  },
  '& tr[data-emphasis="dim"]:hover > td, & tr[data-emphasis="dim"]:focus-within > td': { opacity: 1, filter: 'none' },
  // A translucent tint, so the row's hover color still shows through a pick.
  '& tr[data-picked] > td': { bgcolor: 'color-mix(in srgb, var(--stratakit-color-bg-accent-base) 9%, transparent)' },
  '& .backlog-pick': { display: 'inline-flex', borderRadius: '4px', verticalAlign: 'middle' },
  '& .backlog-pick[data-hand]': {
    boxShadow: '0 0 0 2px var(--stratakit-mui-palette-background-paper), 0 0 0 3.5px var(--stratakit-color-border-accent-base)',
  },
  '& .backlog-running': { color: 'var(--stratakit-color-text-accent-strong)', fontWeight: 650 },
  '& .backlog-skip-reason': { color: TERTIARY_TEXT_COLOR, fontSize: 11 },
}

export const BacklogTable = memo(function BacklogTable({
  bugs,
  compact = false,
  tierThresholds,
  collapsedTiers,
  onToggleTier,
  highlightedBugIds = null,
  plan = null,
  preview,
}: BacklogTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const groups = groupBacklogBugsByTier(bugs, tierThresholds)
  const columns = plan ? PLAN_COLUMNS : COLUMNS
  const columnWidths = columns.map((column) => column.key === 'assignee' && compact ? 112 : column.width)
  const minWidth = columnWidths.reduce<number>((total, width) => total + (width ?? BUG_COLUMN_MIN_WIDTH), 0)
  const lastPick = plan?.plan.picks.at(-1)
  const { panelId, onSelect, onToggle } = preview ?? {}
  const rowPreview = useMemo<RowPreview | undefined>(
    () => panelId && onSelect && onToggle ? { panelId, onSelect, onToggle } : undefined,
    [panelId, onSelect, onToggle],
  )

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
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
      }}
    >
      {/* Relative so the absolutely positioned visually hidden text is contained by this scroller, not the page. */}
      <TableContainer ref={containerRef} sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', scrollbarGutter: 'stable' }}>
        <Table size="small" stickyHeader aria-label="Open bugs ranked by value" sx={[tableSx, { minWidth }]}>
          <colgroup>
            {columns.map((column, index) => <col key={column.key} style={{ width: columnWidths[index] }} />)}
          </colgroup>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
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
            const matchCount = highlightedBugIds ? group.bugs.filter((bug) => highlightedBugIds.has(bug.id)).length : undefined
            const pickedCount = plan ? group.bugs.filter((bug) => plan.plan.pickedIds.has(bug.id)).length : undefined
            return (
              <TableBody
                key={group.key}
                data-tier={group.key}
                style={getBacklogTierStyle(group.key)}
                sx={rowPreview ? previewBodySx : undefined}
              >
                <TierHeader
                  group={group}
                  collapsed={collapsed}
                  onToggle={onToggleTier}
                  matchCount={matchCount}
                  pickedCount={pickedCount}
                  columnCount={columns.length}
                />
                {/* A flat keyed list, so the row that gains or loses the cut line below it keeps its focus. */}
                {collapsed ? null : group.bugs.flatMap((bug) => {
                  const pickState = plan ? getPickState(bug.id, plan) : undefined
                  const row = (
                    <BacklogRow
                      key={bug.id}
                      bug={bug}
                      compact={compact}
                      emphasis={highlightedBugIds ? (highlightedBugIds.has(bug.id) ? 'match' : 'dim') : undefined}
                      pickState={pickState}
                      running={plan ? describeRunning(bug, plan.plan, lastPick) : undefined}
                      onTogglePick={plan?.onTogglePick}
                      preview={rowPreview}
                      selected={preview?.selectedId === bug.id}
                    />
                  )
                  return plan && bug.id === lastPick?.id ? [
                    row,
                    <CutLine
                      key="cut-line"
                      used={plan.plan.used}
                      budget={plan.plan.budget}
                      count={plan.plan.picks.length}
                      columnCount={columns.length}
                    />,
                  ] : [row]
                })}
              </TableBody>
            )
          })}
        </Table>
      </TableContainer>
    </Box>
  )
})
