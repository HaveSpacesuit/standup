import { useState } from 'react'
import { Box, Dialog, DialogContent, DialogTitle, Divider, IconButton, Skeleton, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgWindowExpand from '@stratakit/icons/window-expand.svg'
import type { IterationWindowInfo } from '../../../ado/queryEngine'
import type { IterationInfo } from '../../../ado/types'
import type { EffortFlowPoint } from '../hooks/useEffortFlowHistory'
import { parseDateOnly } from '../utils/dateOnly'
import { formatSprintDate, formatSprintDateRange, getSprintProgress, type SprintProgress } from '../utils/sprintDates'
import type { SprintEffortTotals, SprintForecast } from '../utils/sprintForecast'
import { formatEffort, formatEffortPoints } from '../utils/sprintEffortTotals'
import { getStatusColumnColor, STATUS_COLUMNS } from '../utils/statusColumnStyles'
import { AppTooltip } from './AppTooltip'
import { visuallyHiddenSx } from './developmentCardDisplay'
import { EffortFlowChart } from './EffortFlowChart'
import { SprintForecastChip } from './SprintForecastChip'

type SprintRibbonProps = {
  iterationWindow: IterationWindowInfo
  isLoading?: boolean
  error?: string | null
  /** Effort per status for the visible current-sprint items. */
  effortTotals: SprintEffortTotals
  effortFlowPoints: EffortFlowPoint[]
  effortFlowLoading: boolean
  sprintForecast: SprintForecast
  colorScheme: 'light' | 'dark'
}

const TRACK_COLOR = 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)'

// Lower-priority groups drop out as the ribbon narrows, so it always stays on one line.
const hideBelow = (width: number) => ({ [`@container (max-width: ${width}px)`]: { display: 'none' } })

const ribbonSx = {
  containerType: 'inline-size',
  height: 44,
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
} as const

const groupSx = { display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 } as const

function RibbonDivider({ hideBelowWidth }: { hideBelowWidth?: number }) {
  return (
    <Divider
      orientation="vertical"
      flexItem
      sx={{ my: 1.5, ...(hideBelowWidth ? hideBelow(hideBelowWidth) : {}) }}
    />
  )
}

function SprintIdentity({ current }: { current: IterationInfo | null }) {
  const shortRange = formatSprintDateRange(current?.startDate, current?.finishDate, { short: true })

  return (
    <AppTooltip
      title={current ? `${current.fullName} · ${formatSprintDateRange(current.startDate, current.finishDate)}` : undefined}
    >
      <Box tabIndex={current ? 0 : undefined} sx={{ ...groupSx, flexShrink: 1, minWidth: 0 }}>
        <Icon href={svgCalendar} style={{ color: 'var(--stratakit-color-icon-neutral-secondary)', flexShrink: 0 }} />
        <Typography
          component="span"
          variant="body-sm"
          sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
        >
          {current?.name ?? 'Current sprint'}
        </Typography>
        <Typography component="span" variant="body-sm" color="text.secondary">
          {shortRange}
        </Typography>
      </Box>
    </AppTooltip>
  )
}

function SprintProgressSummary({ progress }: { progress: SprintProgress }) {
  if (progress.status === 'active') {
    const { day, totalDays, daysLeft } = progress
    return (
      <Box sx={groupSx}>
        <Typography component="span" variant="body-sm" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          Day {day} of {totalDays}
        </Typography>
        <Box
          aria-hidden="true"
          sx={{ width: 96, height: 6, borderRadius: 999, bgcolor: TRACK_COLOR, overflow: 'hidden', ...hideBelow(640) }}
        >
          <Box
            sx={{
              width: `${Math.round((day / totalDays) * 100)}%`,
              height: '100%',
              borderRadius: 999,
              bgcolor: 'var(--stratakit-color-bg-mono-base)',
            }}
          />
        </Box>
        <Typography component="span" variant="body-sm" color="text.secondary">
          {daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}
        </Typography>
      </Box>
    )
  }

  const label = progress.status === 'upcoming'
    ? `Starts ${formatSprintDate(progress.startsOn)}`
    : progress.status === 'ended'
      ? 'Sprint ended'
      : 'Days: unavailable'

  return (
    <Typography component="span" variant="body-sm" color="text.secondary" sx={{ flexShrink: 0 }}>
      {label}
    </Typography>
  )
}

function SprintEffortSummary({ totals }: { totals: SprintEffortTotals }) {
  const theme = useTheme()
  const total = STATUS_COLUMNS.reduce((sum, status) => sum + totals[status], 0)
  const breakdown = STATUS_COLUMNS.map((status) => `${status} ${formatEffort(totals[status])}`).join(', ')

  return (
    <Box sx={groupSx}>
      <Typography component="span" variant="body-sm" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        <Box component="span" sx={visuallyHiddenSx}>Current sprint effort: </Box>
        {formatEffortPoints(total)}
      </Typography>
      <AppTooltip
        title={
          <Box component="span" sx={{ display: 'grid', gridTemplateColumns: 'auto auto auto', columnGap: 1, alignItems: 'center' }}>
            {STATUS_COLUMNS.map((status) => (
              <Box key={status} component="span" sx={{ display: 'contents' }}>
                <Box component="span" sx={{ width: 8, height: 8, borderRadius: 0.5, bgcolor: getStatusColumnColor(status, theme.palette) }} />
                <span>{status}</span>
                <Box component="span" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatEffort(totals[status])}
                </Box>
              </Box>
            ))}
          </Box>
        }
      >
        <Box
          role="img"
          tabIndex={0}
          aria-label={`Current sprint effort by status: ${breakdown}`}
          sx={{
            display: 'flex',
            width: 120,
            height: 8,
            borderRadius: 999,
            overflow: 'hidden',
            bgcolor: TRACK_COLOR,
            ...hideBelow(820),
          }}
        >
          {total > 0
            ? STATUS_COLUMNS.map((status) => totals[status] > 0 ? (
                <Box key={status} sx={{ flex: `${totals[status]} 0 0px`, bgcolor: getStatusColumnColor(status, theme.palette) }} />
              ) : null)
            : null}
        </Box>
      </AppTooltip>
    </Box>
  )
}

function NextSprint({ next }: { next: IterationInfo }) {
  const start = parseDateOnly(next.startDate)
  const startsOn = start && !Number.isNaN(start.getTime()) ? ` · starts ${formatSprintDate(start)}` : ''

  return (
    <AppTooltip title={`${next.fullName} · ${formatSprintDateRange(next.startDate, next.finishDate)}`}>
      <Typography
        component="span"
        variant="body-sm"
        color="text.secondary"
        tabIndex={0}
        sx={{ ml: 'auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', ...hideBelow(1150) }}
      >
        Next: {next.name}{startsOn}
      </Typography>
    </AppTooltip>
  )
}

/** One-line sprint context above the Development board: dates, progress, effort, forecast, and flow. */
export function SprintRibbon({
  iterationWindow,
  isLoading = false,
  error,
  effortTotals,
  effortFlowPoints,
  effortFlowLoading,
  sprintForecast,
  colorScheme,
}: SprintRibbonProps) {
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false)

  if (isLoading) {
    return (
      <Box component="section" aria-label="Current sprint" aria-busy="true" sx={ribbonSx}>
        <Typography component="span" variant="body-sm" color="text.secondary">
          Loading sprint info...
        </Typography>
        <Skeleton variant="text" width={220} />
        <Skeleton variant="rounded" width={150} height={24} />
      </Box>
    )
  }

  if (error) {
    return (
      <Box component="section" aria-label="Current sprint" sx={ribbonSx}>
        <Typography role="status" component="span" variant="body-sm" color="error">
          Sprint summary unavailable — team iteration metadata could not be loaded.
        </Typography>
      </Box>
    )
  }

  const { current, next } = iterationWindow
  const progress = getSprintProgress(current?.startDate, current?.finishDate)

  return (
    <Box component="section" aria-label="Current sprint" sx={ribbonSx}>
      <SprintIdentity current={current} />
      <RibbonDivider />
      <SprintProgressSummary progress={progress} />
      <RibbonDivider />
      <SprintEffortSummary totals={effortTotals} />
      <Box sx={{ flexShrink: 0, display: 'flex' }}>
        <SprintForecastChip forecast={sprintForecast} />
      </Box>
      <RibbonDivider hideBelowWidth={980} />
      <Box sx={{ ...groupSx, gap: 0.5, ...hideBelow(980) }}>
        <Box sx={{ width: effortFlowPoints.length > 0 ? 120 : 'auto', height: 28 }}>
          <EffortFlowChart points={effortFlowPoints} isLoading={effortFlowLoading} colorScheme={colorScheme} />
        </Box>
        <IconButton size="small" label="Effort flow" onClick={() => setIsChartDialogOpen(true)}>
          <Icon href={svgWindowExpand} />
        </IconButton>
      </Box>
      {next ? <NextSprint next={next} /> : null}

      <Dialog open={isChartDialogOpen} onClose={() => setIsChartDialogOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>Effort flow — current sprint</DialogTitle>
        <DialogContent sx={{ height: 480, pb: 3 }}>
          <EffortFlowChart
            points={effortFlowPoints}
            isLoading={effortFlowLoading}
            colorScheme={colorScheme}
            variant="detailed"
          />
        </DialogContent>
      </Dialog>
    </Box>
  )
}
