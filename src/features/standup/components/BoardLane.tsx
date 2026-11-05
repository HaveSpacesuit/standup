import { Avatar, Badge, Box, IconButton, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgChevronDown from '@stratakit/icons/chevron-down.svg'
import svgChevronRight from '@stratakit/icons/chevron-right.svg'
import type { ReactNode } from 'react'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { BOARD_HEADER_HEIGHT } from '../utils/boardLayout'
import { formatEffort, formatEffortPoints } from '../utils/sprintEffortTotals'
import { getStatusColumnColor, STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
import { AdoAvatar } from './AdoAvatar'
import { AppTooltip } from './AppTooltip'
import { formatLaneFlag, getLaneFlags, type AttentionFacetKey, type AttentionTone, type LaneFlag } from './boardAttention'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'
import type { BoardRowData, LaneNote } from './KanbanBoardGrid'
import {
  describeLaneLoad,
  LANE_HEAD_FLAG_LIMIT,
  presentingFrameShadow,
  type LaneHeadFlag,
  type LaneLoadSegment,
  type LaneSummary,
} from './laneSummary'

const BADGE_COLORS: Record<AttentionTone, 'error' | 'warning' | 'info' | 'success'> = {
  critical: 'error',
  attention: 'warning',
  info: 'info',
  positive: 'success',
}

const COLLAPSED_PIP_LIMIT = 8
/** Ghost lanes hold cards that have left, so their load bar and pips recede. */
const GHOST_OPACITY = 0.45

function toneIconColor(tone: AttentionTone | 'neutral'): string {
  return `var(--stratakit-color-icon-${tone}-base)`
}

function toLaneHeadFlag({ facet, count }: LaneFlag): LaneHeadFlag {
  return { key: facet.key, label: formatLaneFlag(facet.key, count), tone: facet.tone, iconHref: facet.iconHref }
}

function LaneLoadBar({ segments, label, collapsed, ghost = false }: {
  segments: readonly LaneLoadSegment[]
  label: string
  collapsed: boolean
  ghost?: boolean
}) {
  return (
    <Box
      // A collapsed lane's cells already read out their counts.
      role={collapsed ? undefined : 'img'}
      aria-label={collapsed ? undefined : label}
      aria-hidden={collapsed || undefined}
      data-lane-load=""
      sx={{
        display: 'flex',
        gap: '1px',
        height: 5,
        width: collapsed ? 34 : undefined,
        flex: collapsed ? '0 0 auto' : undefined,
        borderRadius: 999,
        overflow: 'hidden',
        bgcolor: 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)',
      }}
    >
      {segments.filter((segment) => segment.count > 0).map((segment) => (
        <Box
          key={segment.key}
          sx={{ flex: `${segment.count} 1 0`, minWidth: 3, bgcolor: segment.color, opacity: ghost ? GHOST_OPACITY : undefined }}
        />
      ))}
    </Box>
  )
}

function LaneNoteBadge({ note }: { note: LaneNote }) {
  return (
    <AppTooltip title={note.description}>
      <Badge
        variant="inline"
        type="outlined"
        size="small"
        color={note.tone === 'neutral' ? undefined : BADGE_COLORS[note.tone]}
        max={Infinity}
        badgeContent={(
          <>
            <Icon href={note.iconHref} style={{ color: toneIconColor(note.tone) }} />
            {note.label}
            {note.description ? <Box component="span" sx={visuallyHiddenSx}>: {note.description}</Box> : null}
          </>
        )}
      />
    </AppTooltip>
  )
}

type LaneHeadProps = {
  row: BoardRowData
  collapsed: boolean
  onToggleCollapsed?: () => void
  /** The lane whose owner is speaking in standup. */
  presenting?: boolean
  /** The board's column header height, which the expanded lane head's sticky summary clears. */
  headerHeight?: number
  /** How the lane's cards spread across the columns. */
  load: readonly LaneLoadSegment[]
  /** The load bar's spoken description. */
  loadLabel: string
  /** The line under the load bar, such as "4 open · 5 pts". */
  caption: ReactNode
  /** Attention flags, most urgent first; the head shows the first few. */
  flags: readonly LaneHeadFlag[]
}

/** The sticky first cell of a lane: who it belongs to, how their work spreads across columns, and what needs attention. */
export function LaneHead({
  row,
  collapsed,
  onToggleCollapsed,
  presenting = false,
  headerHeight = BOARD_HEADER_HEIGHT,
  load,
  loadLabel,
  caption,
  flags,
}: LaneHeadProps) {
  const avatarSize = collapsed ? 20 : 28
  // Cards in a ghost lane have left the board, so they raise no attention flags here.
  const headFlags = row.ghost ? [] : flags.slice(0, LANE_HEAD_FLAG_LIMIT)
  const notes = row.notes ?? []

  const identity = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: '1 1 auto' }}>
      {onToggleCollapsed ? (
        <IconButton
          size="small"
          label={`${collapsed ? 'Expand' : 'Collapse'} ${row.label}`}
          labelPlacement="right"
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
          sx={{ ml: -0.75, flex: '0 0 auto' }}
        >
          <Icon href={collapsed ? svgChevronRight : svgChevronDown} />
        </IconButton>
      ) : null}
      {row.iconHref ? (
        <Box
          aria-hidden="true"
          sx={{
            width: avatarSize,
            height: avatarSize,
            flex: '0 0 auto',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 1,
            bgcolor: 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)',
          }}
        >
          <Icon href={row.iconHref} style={{ color: 'var(--stratakit-color-icon-neutral-base)' }} />
        </Box>
      ) : row.isUnassigned ? (
        <Avatar sx={{ width: avatarSize, height: avatarSize }} />
      ) : (
        <AdoAvatar
          alt={row.label}
          descriptor={row.avatarDescriptor}
          src={row.avatarUrl}
          sx={{ width: avatarSize, height: avatarSize }}
        />
      )}
      <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Typography
          render={<h2 />}
          variant="body-sm"
          sx={{ fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {row.label}
        </Typography>
        {row.subtitle && !collapsed ? (
          <Typography
            component="span"
            variant="caption-sm"
            sx={{ color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {row.subtitle}
          </Typography>
        ) : null}
      </Box>
    </Box>
  )

  return (
    <Box
      data-lane={row.key}
      data-lane-collapsed={collapsed ? '' : undefined}
      data-lane-presenting={presenting ? '' : undefined}
      sx={{
        position: 'sticky',
        left: 0,
        zIndex: 3,
        px: 1.5,
        py: collapsed ? 0.75 : 1.25,
        borderBottom: '1px solid',
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: presenting
          ? 'color-mix(in srgb, var(--stratakit-color-bg-accent-base) 8%, var(--stratakit-color-bg-page-base))'
          : 'background.paper',
        boxShadow: presenting ? presentingFrameShadow({ left: true }) : undefined,
        display: 'flex',
        alignItems: collapsed ? 'center' : 'flex-start',
        minWidth: 0,
      }}
    >
      {collapsed ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: '1 1 auto' }}>
          {identity}
          <LaneLoadBar segments={load} label={loadLabel} collapsed ghost={row.ghost} />
        </Box>
      ) : (
        <Box
          sx={{
            // Keeps the summary in view while scrolling through a tall lane.
            position: 'sticky',
            top: headerHeight + 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            minWidth: 0,
            flex: '1 1 auto',
          }}
        >
          {identity}
          {presenting ? (
            <Typography
              component="span"
              variant="caption-sm"
              sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--stratakit-color-text-accent-strong)' }}
            >
              Speaking
            </Typography>
          ) : null}
          <LaneLoadBar segments={load} label={loadLabel} collapsed={false} ghost={row.ghost} />
          <Typography variant="caption-md" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
            {caption}
          </Typography>
          {headFlags.length > 0 ? (
            <Box
              component="ul"
              aria-label="Needs attention"
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
            >
              {headFlags.map((flag) => (
                <li key={flag.key} data-lane-flag={flag.key}>
                  <Badge
                    variant="inline"
                    type="outlined"
                    size="small"
                    color={BADGE_COLORS[flag.tone]}
                    max={Infinity}
                    badgeContent={(
                      <>
                        <Icon href={flag.iconHref} style={{ color: toneIconColor(flag.tone) }} />
                        {flag.label}
                      </>
                    )}
                  />
                </li>
              ))}
            </Box>
          ) : null}
          {notes.length > 0 ? (
            <Box
              component="ul"
              aria-label="Sprint scope"
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
            >
              {notes.map((note) => (
                <li key={note.key} data-lane-note={note.key}>
                  <LaneNoteBadge note={note} />
                </li>
              ))}
            </Box>
          ) : null}
        </Box>
      )}
    </Box>
  )
}

type BoardLaneHeadProps = Pick<LaneHeadProps, 'row' | 'collapsed' | 'onToggleCollapsed' | 'presenting' | 'headerHeight'> & {
  summary: LaneSummary
}

/** A Development lane head, which counts open work in effort points. */
export function BoardLaneHead({ row, summary, ...head }: BoardLaneHeadProps) {
  const theme = useTheme()
  const effortSign = row.ghost && summary.totalEffort > 0 ? '\u2212' : ''
  const caption = row.countsAllItems ? (
    summary.itemCount === 0 ? 'No cards' : (
      <>
        <span aria-hidden="true">
          {summary.itemCount} {summary.itemCount === 1 ? 'item' : 'items'} · {effortSign}{formatEffortPoints(summary.totalEffort)}
        </span>
        <Box component="span" sx={visuallyHiddenSx}>
          {summary.itemCount} {summary.itemCount === 1 ? 'card' : 'cards'}, {formatEffort(summary.totalEffort)} points{row.ghost ? ' removed' : ''}
        </Box>
      </>
    )
  ) : summary.openCount === 0 ? 'Nothing open' : (
    <>
      <span aria-hidden="true">{summary.openCount} open · {formatEffortPoints(summary.openEffort)}</span>
      <Box component="span" sx={visuallyHiddenSx}>
        {summary.openCount} open {summary.openCount === 1 ? 'card' : 'cards'}, {formatEffort(summary.openEffort)} points
      </Box>
    </>
  )

  return (
    <LaneHead
      row={row}
      {...head}
      load={STATUS_COLUMNS.map((status) => ({ key: status, count: summary.statusCounts[status], color: getStatusColumnColor(status, theme.palette) }))}
      loadLabel={describeLaneLoad(summary.statusCounts)}
      caption={caption}
      flags={summary.flags.map(toLaneHeadFlag)}
    />
  )
}

type CollapsedCellSummaryProps = {
  /** The column's name, which starts the spoken summary. */
  label: string
  count: number
  /** The column's color, for the pips. */
  color: string
  flags: readonly LaneHeadFlag[]
  highlightedCount: number | null
  /** Cards that have left the board's scope: outlined pips and no attention flags. */
  ghost?: boolean
}

/** A collapsed lane's cell: a pip per card, the count, and an icon per attention signal present. */
export function CollapsedCellSummary({ label, count, color, flags, highlightedCount, ghost = false }: CollapsedCellSummaryProps) {
  if (count === 0) {
    return (
      <>
        <Typography component="span" variant="caption-md" aria-hidden="true" sx={{ color: TERTIARY_TEXT_COLOR }}>
          –
        </Typography>
        <Box component="span" sx={visuallyHiddenSx}>{label}: none</Box>
      </>
    )
  }

  const shownFlags = ghost ? [] : flags
  const description = [
    `${label}: ${count} ${count === 1 ? 'card' : 'cards'}`,
    ...shownFlags.map((flag) => flag.label),
    ...(highlightedCount ? [`${highlightedCount} highlighted`] : []),
  ].join(', ')

  return (
    <>
      <Box
        component="span"
        aria-hidden="true"
        data-collapsed-summary=""
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}
      >
        <Box component="span" sx={{ display: 'inline-flex', gap: '2px', flex: '0 0 auto' }}>
          {Array.from({ length: Math.min(count, COLLAPSED_PIP_LIMIT) }, (_, index) => (
            <Box
              key={index}
              component="span"
              sx={{
                width: 6,
                height: 10,
                boxSizing: 'border-box',
                borderRadius: '2px',
                ...(ghost
                  ? { border: '1px dashed', borderColor: color }
                  : { bgcolor: color, opacity: 0.55 }),
              }}
            />
          ))}
        </Box>
        <Typography
          component="span"
          variant="caption-md"
          sx={{ fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
        >
          {count}
        </Typography>
        {shownFlags.length > 0 ? (
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            {shownFlags.map((flag) => (
              <Icon key={flag.key} href={flag.iconHref} style={{ color: toneIconColor(flag.tone) }} />
            ))}
          </Box>
        ) : null}
      </Box>
      <Box component="span" sx={visuallyHiddenSx}>{description}</Box>
    </>
  )
}

type CollapsedLaneSummaryProps = {
  status: StatusColumn
  items: readonly WorkItemSummary[]
  signalsByItemId: ReadonlyMap<number, ReadonlySet<AttentionFacetKey>>
  highlightedCount: number | null
  /** Cards that have left the board's scope: outlined pips and no attention flags. */
  ghost?: boolean
}

/** A Development lane's collapsed cell. */
export function CollapsedLaneSummary({ status, items, signalsByItemId, highlightedCount, ghost = false }: CollapsedLaneSummaryProps) {
  const theme = useTheme()
  // Every Blocked card is flagged blocked, so the column already says it.
  const flags = getLaneFlags(items, signalsByItemId).filter(({ facet }) => facet.key !== 'blocked').map(toLaneHeadFlag)

  return (
    <CollapsedCellSummary
      label={status}
      count={items.length}
      color={getStatusColumnColor(status, theme.palette)}
      flags={flags}
      highlightedCount={highlightedCount}
      ghost={ghost}
    />
  )
}
