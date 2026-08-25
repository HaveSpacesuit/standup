import { useState } from 'react'
import { Box, Chip, Dialog, DialogContent, DialogTitle, IconButton, Skeleton, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgWindowExpand from '@stratakit/icons/window-expand.svg'
import type { IterationWindowInfo } from '../../../ado/queryEngine'
import { EffortFlowChart } from './EffortFlowChart'
import type { EffortFlowPoint } from '../hooks/useEffortFlowHistory'

type SprintSummaryBarProps = {
  iterationWindow: IterationWindowInfo
  isLoading?: boolean
  effortFlowPoints: EffortFlowPoint[]
  effortFlowLoading: boolean
  colorScheme: 'light' | 'dark'
}

function parseDateOnly(value?: string): Date | null {
  if (!value) {
    return null
  }

  const datePart = value.slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart)
  if (!match) {
    const fallback = new Date(value)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return new Date(year, month - 1, day)
}

function formatDateRange(startDate?: string, finishDate?: string): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const start = parseDateOnly(startDate)
  const finish = parseDateOnly(finishDate)

  const hasValidStart = start !== null && !Number.isNaN(start.getTime())
  const hasValidFinish = finish !== null && !Number.isNaN(finish.getTime())

  if (hasValidStart && hasValidFinish) {
    return `${formatter.format(start)} – ${formatter.format(finish)}`
  }

  if (hasValidStart) {
    return `Starts ${formatter.format(start)}`
  }

  if (hasValidFinish) {
    return `Ends ${formatter.format(finish)}`
  }

  return 'Dates unavailable'
}

function getDaysRemainingInSprint(finishDate?: string): number | null {
  const finish = parseDateOnly(finishDate)
  if (!finish) {
    return null
  }

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const endOfFinish = new Date(finish.getFullYear(), finish.getMonth(), finish.getDate())

  if (endOfFinish < startOfToday) {
    return 0
  }

  const millisPerDay = 24 * 60 * 60 * 1000
  const diff = endOfFinish.getTime() - startOfToday.getTime()
  return Math.floor(diff / millisPerDay) + 1
}

export function SprintSummaryBar({
  iterationWindow,
  isLoading = false,
  effortFlowPoints,
  effortFlowLoading,
  colorScheme,
}: SprintSummaryBarProps) {
  const current = iterationWindow.current
  const next = iterationWindow.next
  const daysRemaining = getDaysRemainingInSprint(current?.finishDate)
  const [isChartDialogOpen, setIsChartDialogOpen] = useState(false)

  if (isLoading) {
    return (
      <Box
        sx={{
          px: 2,
          py: 0.5,
          height: 56,
          flexShrink: 0,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body-sm" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            Loading sprint info...
          </Typography>
          <Skeleton variant="text" width={220} />
          <Skeleton variant="rounded" width={150} height={24} />
        </Box>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        px: 2,
        py: 0.5,
        height: 56,
        flexShrink: 0,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          columnGap: 2,
          flex: '1 1 0',
          minWidth: 0,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
              Current sprint: {current ? formatDateRange(current.startDate, current.finishDate) : 'Dates unavailable'}
            </Typography>
          </Box>
          <Typography variant="caption-sm" color="text.secondary">
            {current?.fullName ?? 'Unavailable'}
          </Typography>
        </Box>
        <Chip
          size="small"
          variant="outlined"
          label={
            daysRemaining === null
              ? 'Days remaining: unavailable'
              : `Days remaining: ${daysRemaining}`
          }
        />
      </Box>

      <Box
        sx={{
          flex: '1 1 0',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minWidth: 0,
          height: '100%',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            height: '100%',
            width: '100%',
            borderLeft: '1px solid',
            borderRight: '1px solid',
            borderColor: 'divider',
            px: 3,
          }}
        >
          <Box sx={{ height: '100%', flex: 1, minWidth: 0 }}>
            <EffortFlowChart points={effortFlowPoints} isLoading={effortFlowLoading} colorScheme={colorScheme} />
          </Box>
          <IconButton
            size="small"
            label="Effort flow"
            onClick={() => setIsChartDialogOpen(true)}
          >
            <Icon href={svgWindowExpand} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ flex: '1 1 0', minWidth: 0, textAlign: 'right' }}>
        <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
          Next sprint: {next ? formatDateRange(next.startDate, next.finishDate) : 'Dates unavailable'}
        </Typography>
        <Typography variant="caption-sm" color="text.secondary">
          {next?.fullName ?? 'Unavailable'}
        </Typography>
      </Box>

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
