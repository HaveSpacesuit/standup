import { Fragment } from 'react'
import { Box, CircularProgress, Skeleton, Typography } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { TEST_TILE_GRID_COLUMNS } from './testHealthPresentation'
import { passRatePosition } from '../utils/testHealth'

type TestsLoadingStateProps = {
  pipelineCount: number
  lookbackDays: number
  view?: 'rows' | 'calendar'
}

const X_TICK_COUNT = 7
const MAX_TILES = 8
const MAX_ROWS = 6
// Matches the Rows view: a 92px plot over a lane of tests ran, inside 14px top and 8px bottom padding.
const ROW_HEIGHT = 140
const ROW_PLOT_HEIGHT = 92
const ROW_LANE_HEIGHT = 18
const LANE_BAR_HEIGHTS = [86, 84, 87, 85, 86, 83, 87, 86, 84, 85, 87, 86, 85, 84, 86, 87, 85, 86]
// Matches the Calendar view: rows as tall as their labels, with 40px weekday cells and narrower, empty weekends.
const CALENDAR_ROW_HEIGHT = 98
const CALENDAR_CELL_HEIGHT = 40
const CALENDAR_DAY_WEIGHTS = [1, 1, 1, 1, 1, 0.4, 0.4]
const CALENDAR_WORKING_DAYS = 5
const TILE_NAME_WIDTHS = [44, 60, 36, 52]

// Typical pass-rate shapes so the placeholder hugs the top of the chart like real data.
const TRACE_PATTERNS: ReadonlyArray<readonly number[]> = [
  [99.5, 99, 100, 98.5, 99, 100, 99.5, 97, 99, 100, 99.5, 100],
  [96, 97.5, 95, 98, 96.5, 94, 97, 98.5, 96, 97, 98, 97.5],
  [91, 93, 88, 92, 95, 90, 93.5, 94, 89, 92.5, 95, 93],
  [98, 96, 99, 97.5, 92, 96.5, 98, 99, 97, 95.5, 98.5, 99],
]

const pulse = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.4; }
  100% { opacity: 1; }
`

// The Rows view's scale, which shows 25–100% with a little headroom.
const ROW_TOP_POSITION = passRatePosition(100) - 0.06
const rowPercentToTop = (percent: number) =>
  ((passRatePosition(percent) - ROW_TOP_POSITION) / (passRatePosition(25) - ROW_TOP_POSITION)) * 100
// Runs rarely begin exactly at the start of the lookback window, so traces start partway in.
const TRACE_START_X = [12, 22, 30, 18]

function tracePoints(pattern: readonly number[], startX: number) {
  return pattern
    .map((percent, index) => `${startX + (index / (pattern.length - 1)) * (98 - startX)},${rowPercentToTop(percent)}`)
    .join(' ')
}

export function TestsLoadingState({ pipelineCount, lookbackDays, view = 'rows' }: TestsLoadingStateProps) {
  const tileCount = Math.min(Math.max(pipelineCount, 1), MAX_TILES)
  const pipelineLabel = pipelineCount === 1 ? '1 pipeline' : `${pipelineCount} pipelines`

  return (
    <Box aria-busy="true" sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={18} />
        <Box>
          <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
            Loading test results...
          </Typography>
          <Typography variant="body-sm" color="text.secondary">
            Fetching published test runs for {pipelineLabel} over the last {lookbackDays} days.
          </Typography>
        </Box>
      </Box>

      <Box
        aria-hidden="true"
        data-testid="tests-loading-tiles"
        sx={{ display: 'grid', gridTemplateColumns: TEST_TILE_GRID_COLUMNS, gap: 1.25 }}
      >
        {Array.from({ length: tileCount }).map((_, index) => (
          <Box
            key={`tests-loading-tile-${index}`}
            sx={{
              p: '9px 11px 8px 13px',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: 'background.paper',
              boxShadow: 'var(--stratakit-shadow-surface-xs)',
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Skeleton variant="rounded" width={18} height={10} />
              <Skeleton variant="text" width={TILE_NAME_WIDTHS[index % TILE_NAME_WIDTHS.length]} height={18} />
              <Skeleton variant="text" width={56} height={16} />
              <Skeleton variant="rounded" width={60} height={20} sx={{ ml: 'auto', borderRadius: 999 }} />
            </Box>
            <Skeleton variant="text" width={72} height={32} />
            <Skeleton variant="rounded" height={34} />
            <Skeleton variant="text" width={150} height={16} />
          </Box>
        ))}
      </Box>

      {view === 'rows' ? <RowsSkeleton pipelineCount={pipelineCount} />
        : <CalendarSkeleton pipelineCount={pipelineCount} lookbackDays={lookbackDays} />}
    </Box>
  )
}

const tracePulseSx = {
  color: 'text.secondary',
  animation: `${pulse} 2s ease-in-out 0.5s infinite`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
} as const

function RowLabelSkeleton({ index, height }: { index: number; height: number }) {
  return (
    <Box sx={{ height, p: '10px 10px 8px 12px', borderTop: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 0.25 }}>
      <Skeleton variant="text" width={TILE_NAME_WIDTHS[index % TILE_NAME_WIDTHS.length]} height={18} />
      <Skeleton variant="text" width={64} height={16} />
      <Skeleton variant="text" width={60} height={28} />
      <Skeleton variant="text" width={52} height={14} />
    </Box>
  )
}

/** The Rows view: a label column and one short plot per pipeline, each with its usual band, a trace, and a tests-ran lane. */
function RowsSkeleton({ pipelineCount }: { pipelineCount: number }) {
  const rowCount = Math.min(Math.max(pipelineCount, 1), MAX_ROWS)
  return (
    <Box aria-hidden="true" data-testid="tests-loading-rows" sx={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)' }}>
      <Box />
      <Box sx={{ height: 24 }} />
      {Array.from({ length: rowCount }).map((_, index) => (
        <Fragment key={`tests-loading-row-${index}`}>
          <RowLabelSkeleton index={index} height={ROW_HEIGHT} />
          <Box sx={{ height: ROW_HEIGHT, borderTop: 1, borderColor: 'divider', position: 'relative', pl: 5, pr: 6.75, pt: 1.75, pb: 1 }}>
            <Box sx={{ position: 'relative', height: ROW_PLOT_HEIGHT }}>
              <Skeleton variant="rectangular" sx={{ position: 'absolute', left: 0, right: 0, top: '12%', height: '16%', opacity: 0.6 }} />
              <Box
                component="svg"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', ...tracePulseSx }}
              >
                <polyline
                  points={tracePoints(TRACE_PATTERNS[index % TRACE_PATTERNS.length], TRACE_START_X[index % TRACE_START_X.length])}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={0.22}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </Box>
            </Box>
            <Box
              data-testid="tests-loading-lane"
              sx={{ mt: '6px', ml: `${TRACE_START_X[index % TRACE_START_X.length]}%`, height: ROW_LANE_HEIGHT, display: 'flex', alignItems: 'flex-end', gap: '3px' }}
            >
              {LANE_BAR_HEIGHTS.map((height, bar) => (
                <Skeleton key={`tests-loading-lane-${bar}`} variant="rectangular" sx={{ flex: 1, height: `${height}%` }} />
              ))}
            </Box>
          </Box>
        </Fragment>
      ))}
      <Box />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 5, pr: 6.75, pt: 0.5 }}>
        {Array.from({ length: X_TICK_COUNT }).map((_, index) => (
          <Skeleton key={`tests-loading-rows-tick-${index}`} variant="text" width={40} height={16} />
        ))}
      </Box>
    </Box>
  )
}

/** The Calendar view: a label column and a row of pulsing day cells per pipeline, with narrower weekends. */
function CalendarSkeleton({ pipelineCount, lookbackDays }: { pipelineCount: number; lookbackDays: number }) {
  const rowCount = Math.min(Math.max(pipelineCount, 1), MAX_ROWS)
  const weeks = Math.max(1, Math.round(lookbackDays / 7))
  const days = Array.from({ length: weeks }).flatMap(() => CALENDAR_DAY_WEIGHTS)
  return (
    <Box aria-hidden="true" data-testid="tests-loading-calendar" sx={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)' }}>
      <Box />
      <Box sx={{ height: 36 }} />
      {Array.from({ length: rowCount }).map((_, index) => (
        <Fragment key={`tests-loading-calendar-row-${index}`}>
          <RowLabelSkeleton index={index} height={CALENDAR_ROW_HEIGHT} />
          <Box sx={{ height: CALENDAR_ROW_HEIGHT, borderTop: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: '2px', px: '6px' }}>
            {days.map((weight, day) => (
              day % CALENDAR_DAY_WEIGHTS.length < CALENDAR_WORKING_DAYS ? (
                <Skeleton
                  key={`tests-loading-calendar-cell-${day}`}
                  data-testid="tests-loading-calendar-cell"
                  variant="rounded"
                  height={CALENDAR_CELL_HEIGHT}
                  sx={{ flex: weight, minWidth: 0, borderRadius: '2px' }}
                />
              ) : <Box key={`tests-loading-calendar-cell-${day}`} sx={{ flex: weight, minWidth: 0 }} />
            ))}
          </Box>
        </Fragment>
      ))}
    </Box>
  )
}
