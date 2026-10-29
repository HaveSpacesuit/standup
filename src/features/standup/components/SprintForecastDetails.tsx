import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import type { ReadySprintForecast } from '../utils/sprintForecast'
import {
  describeForecastColumns,
  FORECAST_SEGMENTS,
  type ForecastColumnView,
  type ForecastSegmentKey,
} from '../utils/sprintForecastView'

const formatEffort = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const formatSigned = (value: number, sign: '+' | '−') => `${sign}${formatEffort.format(value)}`
const tabular = { fontVariantNumeric: 'tabular-nums' } as const

// CSS-variable palette, so colors follow the active color scheme.
const paletteOf = (theme: Theme) => (theme.vars || theme).palette

function segmentColor(theme: Theme, key: ForecastSegmentKey): string {
  const palette = paletteOf(theme)
  switch (key) {
    case 'complete':
      return palette.success.main
    case 'inProgress':
      return palette.info.main
    case 'notStarted':
      return `color-mix(in srgb, ${palette.text.secondary} 28%, ${palette.background.paper})`
  }
}

function Swatch({ segment }: { segment: ForecastSegmentKey }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={(theme) => ({
        display: 'inline-block',
        width: 10,
        height: 10,
        mr: 1,
        borderRadius: '2px',
        bgcolor: segmentColor(theme, segment),
      })}
    />
  )
}

// The projected column is hatched so a forecast never reads as a measurement.
function StackedBar({ column }: { column: ForecastColumnView }) {
  const isProjected = column.key === 'projected'
  return (
    <Box
      aria-hidden
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        width: 56,
        height: 72,
        mx: 'auto',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: paletteOf(theme).action.hover,
      })}
    >
      {FORECAST_SEGMENTS.map(({ key }) => {
        const { effort, share } = column.segments[key]
        if (effort <= 0) return null
        return (
          <Box
            key={key}
            sx={(theme) => {
              const paper = paletteOf(theme).background.paper
              return {
                flex: `${share} 1 0`,
                minHeight: 3,
                borderTop: 1,
                borderColor: paper,
                bgcolor: segmentColor(theme, key),
                ...(isProjected && {
                  backgroundImage: `repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, ${paper} 40%, transparent) 4px 6px)`,
                }),
              }
            }}
          />
        )
      })}
    </Box>
  )
}

function ShareCell({ percent, effort, hasEffort, strong }: {
  percent: number
  effort: number
  hasEffort: boolean
  strong?: boolean
}) {
  return (
    <TableCell align="center">
      <Typography component="span" variant="body-md" sx={{ ...tabular, fontWeight: strong ? 700 : 600 }}>
        {hasEffort ? `${percent}%` : '–'}
      </Typography>
      <Typography component="span" variant="caption-sm" color="text.secondary" sx={{ ...tabular, ml: 0.75 }}>
        {formatEffort.format(effort)}
      </Typography>
    </TableCell>
  )
}

export function SprintForecastDetails({ forecast }: { forecast: ReadySprintForecast }) {
  const columns = describeForecastColumns(forecast)

  return (
    <>
      <Typography variant="body-sm" color="text.secondary" sx={{ mb: 0.5 }}>
        Effort by status. Each column totals 100% of its own scope.
      </Typography>
      <Table size="small" aria-label="Sprint effort forecast" sx={{ '& th, & td': { px: 1, py: 0.5 } }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: '28%' }}>
              <Box component="span" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                Status
              </Box>
            </TableCell>
            {columns.map((column) => (
              <TableCell key={column.key} component="th" scope="col" align="center" sx={{ verticalAlign: 'bottom' }}>
                <StackedBar column={column} />
                <Typography component="span" variant="body-sm" sx={{ display: 'block', mt: 0.75, fontWeight: 600 }}>
                  {column.label}
                </Typography>
                <Typography component="span" variant="caption-sm" color="text.secondary" sx={{ display: 'block' }}>
                  {column.detail}
                </Typography>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {FORECAST_SEGMENTS.map(({ key, label, detail }) => (
            <TableRow key={key}>
              <TableCell component="th" scope="row">
                <Swatch segment={key} />
                {label}
                <Typography component="span" variant="caption-sm" color="text.secondary" sx={{ display: 'block', ml: 2.25 }}>
                  {detail}
                </Typography>
              </TableCell>
              {columns.map((column) => (
                <ShareCell
                  key={column.key}
                  percent={column.segments[key].percent}
                  effort={column.segments[key].effort}
                  hasEffort={column.total > 0}
                  strong={key === 'complete'}
                />
              ))}
            </TableRow>
          ))}
          <TableRow sx={{ '& th, & td': { borderTop: 1, borderColor: 'divider' } }}>
            <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>Total effort</TableCell>
            {columns.map((column) => (
              <ShareCell key={column.key} percent={100} effort={column.total} hasEffort={column.total > 0} />
            ))}
          </TableRow>
        </TableBody>
      </Table>

      <Box
        component="dl"
        aria-label="Scope since sprint start"
        sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, m: 0, mt: 1.5, px: 1 }}
      >
        {[
          { label: 'Committed at start', value: formatEffort.format(forecast.start.total) },
          { label: 'Added since', value: formatSigned(forecast.addedEffort, '+') },
          { label: 'Removed since', value: formatSigned(forecast.removedEffort, '−') },
          { label: 'In sprint now', value: `= ${formatEffort.format(forecast.current.total)}` },
        ].map(({ label, value }) => (
          <div key={label}>
            <Typography component="dt" variant="caption-sm" color="text.secondary">{label}</Typography>
            <Typography component="dd" variant="body-md" sx={{ ...tabular, m: 0, fontWeight: 600 }}>{value}</Typography>
          </div>
        ))}
      </Box>
    </>
  )
}
