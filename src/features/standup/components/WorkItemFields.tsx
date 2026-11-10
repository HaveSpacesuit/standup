import { Badge, Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgStatusWarning from '@stratakit/icons/status-warning.svg'
import type { IdentityRef } from '../../../ado/identity'
import { AdoAvatar } from './AdoAvatar'
import { AppTooltip as Tooltip } from './AppTooltip'
import { TipLines } from './TipLines'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'
import { abbreviateState } from './workItemCardDisplay'
import { METER_TRACK_COLOR } from './workItemTableDisplay'
import type { BacklogSprint } from '../utils/backlogSprint'
import { formatAssignee, formatCreatedDate, getBacklogAgeDays, getImpactDescription, getSeverityDisplay } from '../utils/backlogValue'
import { formatDayCount, formatSprintDateRange } from '../utils/sprintDates'

// The work item fields shared by the Backlog and Triage tables. Each page passes its own tooltips where they explain
// something about that page, such as how Backlog's Value counts a field left empty.

const mutedSx: SxProps<Theme> = { color: TERTIARY_TEXT_COLOR }

export function NotSet() {
  return (
    <>
      <span aria-hidden="true">&mdash;</span>
      <Box component="span" sx={visuallyHiddenSx}>Not set</Box>
    </>
  )
}

const missingMarkSx: SxProps<Theme> = {
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

/** A dashed "?" for a field that should be set but is empty, with a tooltip saying what that means. */
export function MissingValue({ tip }: { tip: string }) {
  return (
    <Tooltip title={tip} describeChild>
      <Box component="span" sx={missingMarkSx}>
        <span aria-hidden="true">?</span>
        <Box component="span" sx={visuallyHiddenSx}>Not set</Box>
      </Box>
    </Tooltip>
  )
}

const severityChipSx: SxProps<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  height: 20,
  pl: '6px',
  pr: 1,
  border: '1px solid var(--severity-border, var(--stratakit-color-border-neutral-muted))',
  borderRadius: 999,
  fontSize: 11,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  color: 'var(--severity-text, var(--stratakit-color-text-neutral-secondary))',
  '&::before': {
    content: '""',
    width: 7,
    height: 7,
    borderRadius: '50%',
    bgcolor: 'var(--severity-dot, var(--stratakit-color-bg-mono-base))',
  },
  '& > b': { fontWeight: 700 },
  '&[data-level="1"]': {
    '--severity-text': 'var(--stratakit-color-text-critical-base)',
    '--severity-border': 'var(--stratakit-color-border-critical-muted)',
    '--severity-dot': 'var(--stratakit-color-bg-critical-base)',
  },
  '&[data-level="2"]': {
    '--severity-text': 'var(--stratakit-color-text-attention-base)',
    '--severity-border': 'var(--stratakit-color-border-attention-muted)',
    '--severity-dot': 'var(--stratakit-color-bg-attention-base)',
  },
  '&[data-level="4"]': {
    '--severity-text': TERTIARY_TEXT_COLOR,
    '--severity-dot': 'var(--stratakit-color-bg-mono-muted)',
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

/**
 * "S1 · Critical" in a chip whose dot and color climb with the severity; a dashed chip when it is not set. A severity
 * without a level is shown as written, with `unreadableTip` when one is given.
 */
export function SeverityChip({ severity, unsetTip, unreadableTip }: {
  severity: string | undefined
  unsetTip: string
  unreadableTip?: string
}) {
  const display = getSeverityDisplay(severity)
  if (!display) {
    return (
      <Tooltip title={unsetTip} describeChild>
        <Box component="span" sx={severityUnsetSx}>Not set</Box>
      </Tooltip>
    )
  }

  if (display.level === undefined) {
    const chip = <Box component="span" sx={severityChipSx}>{display.label}</Box>
    return unreadableTip ? <Tooltip title={unreadableTip} describeChild>{chip}</Tooltip> : chip
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
  '& > .work-item-impact-bars': { display: 'inline-flex', alignItems: 'flex-end', gap: '2px', height: 13 },
  '& > .work-item-impact-bars > span': { width: 4, borderRadius: '1px', bgcolor: METER_TRACK_COLOR },
  '& > .work-item-impact-bars > span:nth-of-type(1)': { height: 4 },
  '& > .work-item-impact-bars > span:nth-of-type(2)': { height: 7 },
  '& > .work-item-impact-bars > span:nth-of-type(3)': { height: 10 },
  '& > .work-item-impact-bars > span:nth-of-type(4)': { height: 13 },
  '& > .work-item-impact-bars > span[data-on]': { bgcolor: 'var(--stratakit-color-text-neutral-secondary)' },
}

const IMPACT_BAR_COUNT = 4

/**
 * Signal bars that fill as more users hit the bug (Impact 1 fills all four), then the level as entered. The tooltip
 * describes the level, then `detail`. An unknown level is shown as entered, with `unknownTip` when one is given.
 */
export function ImpactBars({ priority, detail, missingTip, unknownTip }: {
  priority: number | undefined
  detail: string
  missingTip: string
  unknownTip?: string
}) {
  if (priority === undefined) {
    return <MissingValue tip={missingTip} />
  }

  const description = getImpactDescription(priority)
  if (!description) {
    return unknownTip ? <Tooltip title={unknownTip} describeChild><span>{priority}</span></Tooltip> : priority
  }

  const lit = IMPACT_BAR_COUNT + 1 - priority
  return (
    <Tooltip title={<TipLines lines={[`Impact ${priority}: ${description}`, detail]} />} describeChild>
      <Box component="span" sx={impactSx}>
        <span className="work-item-impact-bars" aria-hidden="true">
          {Array.from({ length: IMPACT_BAR_COUNT }, (_, index) => (
            <span key={index} data-on={index < lit ? '' : undefined} />
          ))}
        </span>
        {priority}
      </Box>
    </Tooltip>
  )
}

/** The age, such as "4mo", with the created date in its tooltip; screen readers read the date instead. */
export function CreatedAge({ createdAt }: { createdAt: string | undefined }) {
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
export function StateLabel({ state }: { state: string | undefined }) {
  if (!state) {
    return <NotSet />
  }

  if (state === 'New') {
    return <Box component="span" sx={mutedSx}>{state}</Box>
  }

  const shortState = abbreviateState(state)
  const badge = (
    <Badge
      variant="inline"
      type="outlined"
      size="small"
      max={Infinity}
      style={{ maxWidth: '100%' }}
      slotProps={{ badge: { style: { maxWidth: '100%' } } }}
      badgeContent={<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortState}</span>}
    />
  )
  if (shortState === state) {
    return <Tooltip title={state} describeChild>{badge}</Tooltip>
  }

  return (
    <Tooltip title={state} describeChild>
      <span style={{ display: 'inline-flex', maxWidth: '100%' }}>
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
export function SprintLabel({ sprint, iterationPath }: { sprint: BacklogSprint; iterationPath: string | undefined }) {
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
          maxWidth: '100%',
          gap: 0.5,
          color: SPRINT_COLORS[sprint.kind],
          fontWeight: sprint.kind === 'current' ? 600 : undefined,
        }}
      >
        {icon ? <Icon href={icon.href} alt="" style={{ color: icon.color, flexShrink: 0 }} /> : null}
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sprint.label}
        </Box>
      </Box>
    </Tooltip>
  )
}

const personSx: SxProps<Theme> = { display: 'inline-flex', alignItems: 'center', gap: 0.75, overflowWrap: 'anywhere' }
const avatarSx: SxProps<Theme> = { width: 16, height: 16, fontSize: 9, flex: '0 0 auto' }

/**
 * A person's avatar and name, or `emptyLabel` in muted text when there is no one. Compact rows show only the avatar,
 * with the name in its tooltip.
 */
export function PersonLabel({ person, emptyLabel, compact = false }: {
  person: IdentityRef | undefined
  emptyLabel: string
  compact?: boolean
}) {
  const name = formatAssignee(person)
  if (!name) {
    return <Box component="span" sx={mutedSx}>{emptyLabel}</Box>
  }

  // Decorative: the name is beside it, or in visually hidden text when compact, so its initial is not read twice.
  const avatar = (
    <AdoAvatar alt="" aria-hidden="true" src={person?.imageUrl} sx={avatarSx}>
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
