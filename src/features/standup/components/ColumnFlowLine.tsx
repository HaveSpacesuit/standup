import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import {
  COLUMN_OLDEST_ATTENTION_DAYS,
  describeColumnFlowDelta,
  formatColumnFlowDelta,
  type ColumnFlow,
  type ColumnFlowTone,
} from '../utils/columnFlow'
import { getStatusColumnColor, type StatusColumn } from '../utils/statusColumnStyles'
import { formatDayCount } from '../utils/sprintDates'
import { AppTooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'

const SPARK_WIDTH = 64
const SPARK_HEIGHT = 18

const TONE_COLORS: Record<ColumnFlowTone, string> = {
  positive: 'success.main',
  critical: 'error.main',
  neutral: 'text.secondary',
}

function ColumnSparkline({ flow, color }: { flow: ColumnFlow; color: string }) {
  const { series, dayCount } = flow
  const max = Math.max(...series, 1)
  const span = Math.max(dayCount - 1, 1)
  const x = (index: number) => (index / span) * (SPARK_WIDTH - 3) + 1.5
  const y = (value: number) => SPARK_HEIGHT - 2 - (value / max) * (SPARK_HEIGHT - 5)
  const last = series.length - 1

  return (
    <svg
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
      data-column-sparkline=""
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <line x1={0} x2={SPARK_WIDTH} y1={SPARK_HEIGHT - 1} y2={SPARK_HEIGHT - 1} stroke="var(--stratakit-color-border-neutral-muted)" />
      <polyline
        points={series.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(last)} cy={y(series[last])} r={2.2} fill={color} />
    </svg>
  )
}

/** A column's sprint so far, under its title: effort by day, the change since the start, and its oldest card. */
export function ColumnFlowLine({ status, flow }: { status: StatusColumn; flow: ColumnFlow }) {
  const theme = useTheme()
  const color = getStatusColumnColor(status, theme.palette)
  const oldestDays = flow.oldestDays !== null && flow.oldestDays > 0 ? flow.oldestDays : null
  const deltaDescription = `${status}: ${describeColumnFlowDelta(flow.delta)}`
  const oldestDescription = oldestDays === null
    ? null
    : `Longest stay in ${status}: ${oldestDays} ${oldestDays === 1 ? 'day' : 'days'}`

  return (
    <AppTooltip
      title={(
        <>
          <Box component="span" sx={{ display: 'block' }}>{deltaDescription}</Box>
          {oldestDescription ? <Box component="span" sx={{ display: 'block' }}>{oldestDescription}</Box> : null}
        </>
      )}
      placement="bottom"
    >
      <Box
        tabIndex={0}
        data-column-flow={status}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          minWidth: 0,
          fontSize: 11,
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          color: 'text.secondary',
          borderRadius: 0.5,
        }}
      >
        <ColumnSparkline flow={flow} color={color} />
        <Box
          component="span"
          aria-hidden="true"
          data-column-flow-delta={flow.tone}
          sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: TONE_COLORS[flow.tone] }}
        >
          {formatColumnFlowDelta(flow.delta)}
        </Box>
        {oldestDays !== null ? (
          <Box
            component="span"
            aria-hidden="true"
            data-column-oldest={oldestDays >= COLUMN_OLDEST_ATTENTION_DAYS ? 'attention' : 'neutral'}
            sx={{
              ml: 'auto',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: oldestDays >= COLUMN_OLDEST_ATTENTION_DAYS ? 500 : 400,
              color: oldestDays >= COLUMN_OLDEST_ATTENTION_DAYS ? 'warning.main' : TERTIARY_TEXT_COLOR,
            }}
          >
            oldest {formatDayCount(oldestDays)}
          </Box>
        ) : null}
        <Box component="span" sx={visuallyHiddenSx}>
          {oldestDescription ? `${deltaDescription}. ${oldestDescription}.` : `${deltaDescription}.`}
        </Box>
      </Box>
    </AppTooltip>
  )
}
