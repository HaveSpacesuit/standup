import { useState } from 'react'
import { Box, Chip, Dialog, DialogContent, DialogTitle, IconButton, Skeleton, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgWindowExpand from '@stratakit/icons/window-expand.svg'
import type { IterationWindowInfo } from '../../../ado/queryEngine'
import { EffortFlowChart } from './EffortFlowChart'
import type { EffortFlowPoint } from '../hooks/useEffortFlowHistory'
import { parseDateOnly } from '../utils/dateOnly'

type SprintSummaryBarProps = {
  iterationWindow: IterationWindowInfo
  isLoading?: boolean
  effortFlowPoints: EffortFlowPoint[]
  effortFlowLoading: boolean
  colorScheme: 'light' | 'dark'
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

  let workingDays = 0
  const current = new Date(startOfToday)
  while (current <= endOfFinish) {
    const dayOfWeek = current.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++
    }
    current.setDate(current.getDate() + 1)
  }

  return workingDays
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
          borderTop: '1px solid',
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
        containerType: 'inline-size',
        px: 2,
        py: 0.5,
        height: 56,
        minHeight: 56,
        flexShrink: 0,
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        justifyContent: 'space-between',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flex: '1 1 0px',
          minWidth: 0,
          justifyContent: 'flex-start',
        }}
      >
        <Box sx={{ minWidth: 0, flex: '0 1 auto' }}>
          <Typography
            variant="body-sm"
            sx={{
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={current ? `Current sprint: ${formatDateRange(current.startDate, current.finishDate)}` : undefined}
          >
            <Box component="span" sx={{ '@container (max-width: 800px)': { display: 'none' } }}>
              Current sprint:{' '}
            </Box>
            {current ? formatDateRange(current.startDate, current.finishDate) : 'Dates unavailable'}
          </Typography>
          <Typography
            variant="caption-sm"
            color="text.secondary"
            sx={{
              display: 'block',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={current?.fullName ?? undefined}
          >
            {current?.fullName ?? 'Unavailable'}
          </Typography>
        </Box>
        <Chip
          size="small"
          variant="outlined"
          sx={{
            flexShrink: 0,
            '@container (max-width: 600px)': {
              '& .MuiChip-label': {
                px: 1,
              },
            },
          }}
          label={
            daysRemaining === null
              ? 'Days: unavailable'
              : `Days remaining: ${daysRemaining}`
          }
        />
      </Box>

      <Box
        sx={{
          flex: '1 1 0px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minWidth: 0,
          height: '100%',
          '@container (max-width: 500px)': {
            display: 'none',
          },
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
            px: 1.5,
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

      <Box sx={{ flex: '1 1 0px', minWidth: 0, textAlign: 'right' }}>
        <Typography
          variant="body-sm"
          sx={{
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={next ? `Next sprint: ${formatDateRange(next.startDate, next.finishDate)}` : undefined}
        >
          <Box component="span" sx={{ '@container (max-width: 800px)': { display: 'none' } }}>
            Next sprint:{' '}
          </Box>
          {next ? formatDateRange(next.startDate, next.finishDate) : 'Dates unavailable'}
        </Typography>
        <Typography
          variant="caption-sm"
          color="text.secondary"
          sx={{
            display: 'block',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={next?.fullName ?? undefined}
        >
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
