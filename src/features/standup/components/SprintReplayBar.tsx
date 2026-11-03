import { useMemo } from 'react'
import { Box, Button, IconButton, Slider, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgPlay from '@stratakit/icons/play.svg'
import svgPause from '@stratakit/icons/pause.svg'
import svgChevronLeft from '@stratakit/icons/chevron-left.svg'
import svgChevronRight from '@stratakit/icons/chevron-right.svg'
import type { EffortFlowPoint } from '../hooks/useEffortFlowHistory'
import type { SprintReplay } from '../hooks/useSprintReplay'
import { formatReplayDate, type SprintReplayTimeline } from '../utils/sprintReplay'
import { getStatusColumnColor, getTintedStatusColor, STATUS_COLUMNS } from '../utils/statusColumnStyles'
import { formatSprintDate } from '../utils/sprintDates'
import { AppTooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'

const CHART_HEIGHT = 24
const CHART_VIEW_HEIGHT = 100
const TRACK_COLOR = 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)'
const PLAYHEAD_COLOR = 'var(--stratakit-color-bg-accent-base)'

export type SprintReplayStatus = 'ready' | 'loading' | 'unavailable'

type SprintReplayBarProps = {
  timeline: SprintReplayTimeline
  points: readonly EffortFlowPoint[]
  replay: SprintReplay
  /** Replay needs the sprint's history; until it loads the controls stay disabled. */
  status: SprintReplayStatus
  colorScheme: 'light' | 'dark'
}

/** The sprint's effort stacked by column, one point per working day so far, scaled to 0–100 across. */
function useFlowAreas(points: readonly EffortFlowPoint[], todayIndex: number, dayCount: number) {
  return useMemo(() => {
    const elapsed = points.slice(0, todayIndex + 1)
    const span = Math.max(dayCount - 1, 1)
    const max = Math.max(...elapsed.map((point) => STATUS_COLUMNS.reduce((sum, status) => sum + (point[status] ?? 0), 0)), 0) * 1.08
    if (max <= 0) {
      return []
    }

    const x = (index: number) => ((index / span) * 100).toFixed(3)
    const y = (value: number) => (CHART_VIEW_HEIGHT - (value / max) * CHART_VIEW_HEIGHT).toFixed(3)
    // A single day still reads as a sliver rather than a point.
    const xs = elapsed.length === 1 ? [0, 0.5] : elapsed.map((_point, index) => index)
    const series = elapsed.length === 1 ? [elapsed[0], elapsed[0]] : elapsed
    let lower = series.map(() => 0)
    return STATUS_COLUMNS.map((status) => {
      const upper = lower.map((value, index) => value + (series[index][status] ?? 0))
      const top = upper.map((value, index) => `${x(xs[index])},${y(value)}`)
      const bottom = lower.map((value, index) => `${x(xs[index])},${y(value)}`).reverse()
      lower = upper
      return { status, d: `M${top.join(' L')} L${bottom.join(' L')} Z`, edge: `M${top.join(' L')}` }
    })
  }, [dayCount, points, todayIndex])
}

/**
 * Sprint view's timeline: the sprint's effort by column so far, with a playhead that replays the
 * board to the end of any past day, and Play, which walks the days up to today.
 */
export function SprintReplayBar({ timeline, points, replay, status, colorScheme }: SprintReplayBarProps) {
  const theme = useTheme()
  const { days, todayIndex } = timeline
  const span = Math.max(days.length - 1, 1)
  const ready = status === 'ready' && todayIndex > 0
  const index = ready ? replay.index : todayIndex
  const areas = useFlowAreas(points, todayIndex, days.length)
  const at = (dayIndex: number) => `${((dayIndex / span) * 100).toFixed(3)}%`
  const shown = days[index]
  const isToday = index === todayIndex
  const describeDay = (dayIndex: number) => `Day ${days[dayIndex].day} of ${days.length}, ${formatReplayDate(days[dayIndex])}${dayIndex === todayIndex ? ', today' : ''}`

  return (
    <Box
      data-sprint-replay=""
      role="group"
      aria-label="Sprint replay"
      sx={{
        height: 48,
        flexShrink: 0,
        px: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Icon href={replay.playing ? svgPause : svgPlay} />}
          onClick={replay.togglePlay}
          disabled={!ready}
          sx={{ width: 84, justifyContent: 'center' }}
        >
          {replay.playing ? 'Pause' : 'Play'}
        </Button>
        <AppTooltip title="Previous day">
          <span>
            <IconButton size="small" aria-label="Previous day" onClick={() => replay.step(-1)} disabled={!ready || index === 0}>
              <Icon href={svgChevronLeft} />
            </IconButton>
          </span>
        </AppTooltip>
        <AppTooltip title="Next day">
          <span>
            <IconButton size="small" aria-label="Next day" onClick={() => replay.step(1)} disabled={!ready || isToday}>
              <Icon href={svgChevronRight} />
            </IconButton>
          </span>
        </AppTooltip>
      </Box>

      <Typography component="span" variant="caption-md" sx={{ color: TERTIARY_TEXT_COLOR, flexShrink: 0 }}>
        {formatSprintDate(days[0].date)}
      </Typography>

      <Box sx={{ position: 'relative', flex: '1 1 auto', minWidth: 120, height: CHART_HEIGHT + 14 }}>
        <Box
          component="svg"
          aria-hidden="true"
          viewBox={`0 0 100 ${CHART_VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          sx={{ position: 'absolute', inset: '0 0 auto 0', width: '100%', height: CHART_HEIGHT, display: 'block', borderRadius: 0.5, bgcolor: TRACK_COLOR }}
        >
          {areas.map(({ status: column, d }) => (
            <path key={column} data-flow-area={column} d={d} style={{ fill: getTintedStatusColor(column, theme.palette, colorScheme) }} />
          ))}
          {/* Edged like the ribbon's chart, so the pale bands stay legible at this height. */}
          {areas.map(({ status: column, edge }) => (
            <path
              key={column}
              d={edge}
              vectorEffect="non-scaling-stroke"
              style={{ fill: 'none', stroke: `color-mix(in srgb, ${getStatusColumnColor(column, theme.palette)} 50%, transparent)`, strokeWidth: 1 }}
            />
          ))}
        </Box>
        {/* The days still to come. */}
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            top: 0,
            left: at(todayIndex),
            right: 0,
            height: CHART_HEIGHT,
            borderLeft: '1px dashed',
            borderColor: 'divider',
            background: `repeating-linear-gradient(135deg, ${TRACK_COLOR} 0 2px, transparent 2px 7px)`,
            pointerEvents: 'none',
          }}
        />
        {ready && !isToday ? (
          <>
            {/* The days after the one shown recede. */}
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute',
                top: 0,
                left: at(index),
                width: `calc(${at(todayIndex)} - ${at(index)})`,
                height: CHART_HEIGHT,
                bgcolor: 'background.paper',
                opacity: 0.6,
                pointerEvents: 'none',
              }}
            />
            <Box
              aria-hidden="true"
              data-replay-playhead=""
              sx={{
                position: 'absolute',
                top: -2,
                left: at(index),
                width: 2,
                ml: '-1px',
                height: CHART_HEIGHT + 4,
                borderRadius: 1,
                bgcolor: PLAYHEAD_COLOR,
                pointerEvents: 'none',
              }}
            />
          </>
        ) : null}
        {todayIndex > 0 ? (
          <Box sx={{ position: 'absolute', left: 0, top: CHART_HEIGHT, width: at(todayIndex), height: 14 }}>
            <Slider
              size="small"
              min={0}
              max={todayIndex}
              step={1}
              marks
              value={index}
              disabled={!ready}
              onChange={(_event, value) => replay.goTo(value as number)}
              aria-label="Sprint day"
              getAriaValueText={describeDay}
              sx={{ display: 'block' }}
            />
          </Box>
        ) : null}
      </Box>

      <Typography component="span" variant="caption-md" sx={{ color: TERTIARY_TEXT_COLOR, flexShrink: 0 }}>
        {formatSprintDate(days[days.length - 1].date)}
      </Typography>

      <Box aria-live="polite" sx={{ width: 128, flexShrink: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
        {status === 'ready' ? (
          <>
            <Typography component="span" variant="body-sm" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              Day {shown.day} of {days.length}
            </Typography>
            <Typography component="span" variant="caption-md" color="text.secondary">
              {formatReplayDate(shown)}{isToday ? ' · today' : ''}
            </Typography>
          </>
        ) : (
          <Typography component="span" variant="caption-md" color="text.secondary" sx={{ whiteSpace: 'normal' }}>
            {status === 'loading' ? 'Loading sprint history…' : 'Sprint history unavailable'}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
