import { Box, CircularProgress, Skeleton, Typography } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { TEST_TILE_GRID_COLUMNS } from './testHealthPresentation'
import { PASS_RATE_TICKS, passRatePosition } from '../utils/testHealth'

type TestsLoadingStateProps = {
  pipelineCount: number
  lookbackDays: number
}

const CHART_HEIGHT = 480
const X_TICK_COUNT = 7
const MAX_TRACES = 4
const MAX_TILES = 8
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

const maxPosition = passRatePosition(0)
const percentToTop = (percent: number) => (passRatePosition(percent) / maxPosition) * 100
// Runs rarely begin exactly at the start of the lookback window, so traces start partway in.
const TRACE_START_X = [12, 22, 30, 18]

function tracePoints(pattern: readonly number[], startX: number) {
  return pattern
    .map((percent, index) => `${startX + (index / (pattern.length - 1)) * (98 - startX)},${percentToTop(percent)}`)
    .join(' ')
}

export function TestsLoadingState({ pipelineCount, lookbackDays }: TestsLoadingStateProps) {
  const traceCount = Math.min(Math.max(pipelineCount, 1), MAX_TRACES)
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

      <Box
        aria-hidden="true"
        sx={{
          height: CHART_HEIGHT,
          p: 2,
          display: 'grid',
          gridTemplateColumns: '16px 40px minmax(0, 1fr)',
          gridTemplateRows: 'minmax(0, 1fr) auto',
          columnGap: 1,
          rowGap: 1,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ gridRow: 1, gridColumn: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Skeleton variant="rounded" width={12} height={180} />
        </Box>

        <Box sx={{ gridRow: 1, gridColumn: 2, position: 'relative' }}>
          {PASS_RATE_TICKS.map((percent) => (
            <Skeleton
              key={`tests-loading-y-tick-${percent}`}
              variant="text"
              width={percent === 100 ? 34 : 26}
              height={16}
              sx={{ position: 'absolute', right: 0, top: `${percentToTop(percent)}%`, transform: 'translateY(-50%)' }}
            />
          ))}
        </Box>

        <Box
          sx={{
            gridRow: 1,
            gridColumn: 3,
            position: 'relative',
            borderLeft: '1px solid',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          {PASS_RATE_TICKS.map((percent) => (
            <Box
              key={`tests-loading-gridline-${percent}`}
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${percentToTop(percent)}%`,
                borderTop: '1px solid',
                borderColor: 'divider',
              }}
            />
          ))}
          <Box
            component="svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
              color: 'text.secondary',
              animation: `${pulse} 2s ease-in-out 0.5s infinite`,
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          >
            {TRACE_PATTERNS.slice(0, traceCount).map((pattern, index) => (
              <polyline
                key={`tests-loading-trace-${index}`}
                points={tracePoints(pattern, TRACE_START_X[index])}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.22}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </Box>
        </Box>

        <Box sx={{ gridRow: 2, gridColumn: 3, display: 'flex', justifyContent: 'space-between' }}>
          {Array.from({ length: X_TICK_COUNT }).map((_, index) => (
            <Skeleton key={`tests-loading-x-tick-${index}`} variant="text" width={64} height={16} />
          ))}
        </Box>
      </Box>
    </Box>
  )
}
