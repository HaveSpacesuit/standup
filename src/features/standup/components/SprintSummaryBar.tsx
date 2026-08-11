import { Box, Chip, FormControlLabel, Skeleton, Switch, Typography } from '@mui/material'
import type { IterationWindowInfo } from '../../../ado/queryEngine'

type SprintSummaryBarProps = {
  iterationWindow: IterationWindowInfo
  isLoading?: boolean
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
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
  colorScheme,
  onToggleColorScheme,
}: SprintSummaryBarProps) {
  const current = iterationWindow.current
  const next = iterationWindow.next
  const daysRemaining = getDaysRemainingInSprint(current?.finishDate)

  if (isLoading) {
    return (
      <Box
        sx={{
          px: 2,
          py: 1,
          minHeight: 52,
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
        <Box sx={{ ml: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch
                size="small"
                checked={colorScheme === 'dark'}
                onChange={onToggleColorScheme}
              />
            }
            label={<Typography variant="body-sm">Dark mode</Typography>}
          />
        </Box>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        minHeight: 52,
        flexShrink: 0,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.default',
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: 8,
        rowGap: 1,
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          columnGap: 2,
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

      <Box sx={{ minWidth: 320, flex: '0 1 320px' }}>
        <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
          Next sprint: {next ? formatDateRange(next.startDate, next.finishDate) : 'Dates unavailable'}
        </Typography>
        <Typography variant="caption-sm" color="text.secondary">
          {next?.fullName ?? 'Unavailable'}
        </Typography>
      </Box>

      <Box sx={{ ml: 'auto', display: 'flex', justifyContent: 'flex-end', alignSelf: 'center' }}>
        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Switch
              size="small"
              checked={colorScheme === 'dark'}
              onChange={onToggleColorScheme}
            />
          }
          label={<Typography variant="body-sm">Dark mode</Typography>}
        />
      </Box>
    </Box>
  )
}
