import { Avatar, Badge, Box, IconButton, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgChevronDown from '@stratakit/icons/chevron-down.svg'
import svgChevronRight from '@stratakit/icons/chevron-right.svg'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { BOARD_HEADER_HEIGHT } from '../utils/boardLayout'
import { formatEffort, formatEffortPoints } from '../utils/sprintEffortTotals'
import { getStatusColumnColor, STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
import { AdoAvatar } from './AdoAvatar'
import { formatLaneFlag, getLaneFlags, type AttentionFacetKey, type AttentionTone } from './boardAttention'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'
import type { BoardRowData } from './KanbanBoardGrid'
import { describeLaneLoad, LANE_HEAD_FLAG_LIMIT, type LaneSummary } from './laneSummary'

const BADGE_COLORS: Record<AttentionTone, 'error' | 'warning' | 'info' | 'success'> = {
  critical: 'error',
  attention: 'warning',
  info: 'info',
  positive: 'success',
}

const COLLAPSED_PIP_LIMIT = 8

function toneIconColor(tone: AttentionTone): string {
  return `var(--stratakit-color-icon-${tone}-base)`
}

function LaneLoadBar({ statusCounts, collapsed }: { statusCounts: Record<StatusColumn, number>; collapsed: boolean }) {
  const theme = useTheme()

  return (
    <Box
      // A collapsed lane's cells already read out their counts.
      role={collapsed ? undefined : 'img'}
      aria-label={collapsed ? undefined : describeLaneLoad(statusCounts)}
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
      {STATUS_COLUMNS.filter((status) => statusCounts[status] > 0).map((status) => (
        <Box
          key={status}
          sx={{ flex: `${statusCounts[status]} 1 0`, minWidth: 3, bgcolor: getStatusColumnColor(status, theme.palette) }}
        />
      ))}
    </Box>
  )
}

type BoardLaneHeadProps = {
  row: BoardRowData
  summary: LaneSummary
  collapsed: boolean
  onToggleCollapsed?: () => void
}

/** The sticky first cell of a lane: who it belongs to, how their work spreads across columns, and what needs attention. */
export function BoardLaneHead({ row, summary, collapsed, onToggleCollapsed }: BoardLaneHeadProps) {
  const avatarSize = collapsed ? 20 : 28
  const headFlags = summary.flags.slice(0, LANE_HEAD_FLAG_LIMIT)

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
      {row.isUnassigned ? (
        <Avatar sx={{ width: avatarSize, height: avatarSize }} />
      ) : (
        <AdoAvatar
          alt={row.label}
          descriptor={row.avatarDescriptor}
          src={row.avatarUrl}
          sx={{ width: avatarSize, height: avatarSize }}
        />
      )}
      <Typography
        render={<h2 />}
        variant="body-sm"
        sx={{ fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {row.label}
      </Typography>
    </Box>
  )

  return (
    <Box
      data-lane={row.key}
      data-lane-collapsed={collapsed ? '' : undefined}
      sx={{
        position: 'sticky',
        left: 0,
        zIndex: 3,
        px: 1.5,
        py: collapsed ? 0.75 : 1.25,
        borderBottom: '1px solid',
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        alignItems: collapsed ? 'center' : 'flex-start',
        minWidth: 0,
      }}
    >
      {collapsed ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: '1 1 auto' }}>
          {identity}
          <LaneLoadBar statusCounts={summary.statusCounts} collapsed />
        </Box>
      ) : (
        <Box
          sx={{
            // Keeps the summary in view while scrolling through a tall lane.
            position: 'sticky',
            top: BOARD_HEADER_HEIGHT + 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            minWidth: 0,
            flex: '1 1 auto',
          }}
        >
          {identity}
          <LaneLoadBar statusCounts={summary.statusCounts} collapsed={false} />
          <Typography variant="caption-md" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
            {summary.openCount === 0 ? 'Nothing open' : (
              <>
                <span aria-hidden="true">{summary.openCount} open · {formatEffortPoints(summary.openEffort)}</span>
                <Box component="span" sx={visuallyHiddenSx}>
                  {summary.openCount} open {summary.openCount === 1 ? 'card' : 'cards'}, {formatEffort(summary.openEffort)} points
                </Box>
              </>
            )}
          </Typography>
          {headFlags.length > 0 ? (
            <Box
              component="ul"
              aria-label="Needs attention"
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
            >
              {headFlags.map(({ facet, count }) => (
                <li key={facet.key} data-lane-flag={facet.key}>
                  <Badge
                    variant="inline"
                    type="outlined"
                    size="small"
                    color={BADGE_COLORS[facet.tone]}
                    max={Infinity}
                    badgeContent={(
                      <>
                        <Icon href={facet.iconHref} style={{ color: toneIconColor(facet.tone) }} />
                        {formatLaneFlag(facet.key, count)}
                      </>
                    )}
                  />
                </li>
              ))}
            </Box>
          ) : null}
        </Box>
      )}
    </Box>
  )
}

type CollapsedLaneSummaryProps = {
  status: StatusColumn
  items: readonly WorkItemSummary[]
  signalsByItemId: ReadonlyMap<number, ReadonlySet<AttentionFacetKey>>
  highlightedCount: number | null
}

/** A collapsed lane's cell: a pip per card, the count, and an icon per attention signal present. */
export function CollapsedLaneSummary({ status, items, signalsByItemId, highlightedCount }: CollapsedLaneSummaryProps) {
  const theme = useTheme()

  if (items.length === 0) {
    return (
      <>
        <Typography component="span" variant="caption-md" aria-hidden="true" sx={{ color: TERTIARY_TEXT_COLOR }}>
          –
        </Typography>
        <Box component="span" sx={visuallyHiddenSx}>{status}: none</Box>
      </>
    )
  }

  // Every Blocked card is flagged blocked, so the column already says it.
  const flags = getLaneFlags(items, signalsByItemId).filter(({ facet }) => facet.key !== 'blocked')
  const description = [
    `${status}: ${items.length} ${items.length === 1 ? 'card' : 'cards'}`,
    ...flags.map(({ facet, count }) => formatLaneFlag(facet.key, count)),
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
          {Array.from({ length: Math.min(items.length, COLLAPSED_PIP_LIMIT) }, (_, index) => (
            <Box
              key={index}
              component="span"
              sx={{ width: 6, height: 10, borderRadius: '2px', bgcolor: getStatusColumnColor(status, theme.palette), opacity: 0.55 }}
            />
          ))}
        </Box>
        <Typography
          component="span"
          variant="caption-md"
          sx={{ fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
        >
          {items.length}
        </Typography>
        {flags.length > 0 ? (
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            {flags.map(({ facet }) => (
              <Icon key={facet.key} href={facet.iconHref} style={{ color: toneIconColor(facet.tone) }} />
            ))}
          </Box>
        ) : null}
      </Box>
      <Box component="span" sx={visuallyHiddenSx}>{description}</Box>
    </>
  )
}
