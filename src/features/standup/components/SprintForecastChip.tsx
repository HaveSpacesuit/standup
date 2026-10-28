import { useEffect, useId, useRef, useState } from 'react'
import { Box, Chip, Popover, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgInfo from '@stratakit/icons/info.svg'
import type { SprintForecast } from '../utils/sprintForecast'

const formatEffort = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const formatPercent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })

function EffortValue({ value, scope }: { value: number; scope: number }) {
  return (
    <>
      {formatEffort.format(value)}
      {scope > 0 ? (
        <Typography component="span" variant="caption-sm" color="text.secondary" sx={{ ml: 0.5 }}>
          ({formatPercent.format(value / scope)})
        </Typography>
      ) : null}
    </>
  )
}

export function SprintForecastChip({ daysRemaining, forecast }: {
  daysRemaining: number | null
  forecast: SprintForecast
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()
  const label = daysRemaining === null ? 'Days: unavailable' : `Days remaining: ${daysRemaining}`
  // Every column is a share of sprint-start commitment, so added scope can push Now past 100%.
  const committedEffort = forecast.status === 'ready' ? forecast.startTotalEffort : 0

  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  useEffect(() => () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
  }, [])

  const show = () => {
    cancelClose()
    setOpen(true)
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => {
      if (!anchor.current?.contains(document.activeElement) && !paper.current?.contains(document.activeElement)) {
        setOpen(false)
      }
    }, 150)
  }

  return (
    <>
      <Box
        component="span"
        ref={anchor}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={scheduleClose}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            cancelClose()
            setOpen(false)
          }
        }}
        sx={{ display: 'inline-flex', flexShrink: 0 }}
      >
        <Chip
          size="small"
          variant="outlined"
          onClick={show}
          slotProps={{
            label: {
              'aria-label': `${label}. Sprint forecast`,
              'aria-haspopup': 'dialog',
              'aria-expanded': open,
              'aria-controls': open ? id : undefined,
            },
          }}
          label={(
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              {label}
              <Icon href={svgInfo} />
            </Box>
          )}
        />
      </Box>
      <Popover
        open={open}
        anchorEl={anchor.current}
        onClose={() => { cancelClose(); setOpen(false) }}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
        hideBackdrop
        sx={{ pointerEvents: 'none' }}
        slotProps={{
          paper: {
            ref: paper,
            id,
            'aria-labelledby': `${id}-title`,
            onMouseEnter: cancelClose,
            onMouseLeave: scheduleClose,
            onBlur: scheduleClose,
            sx: {
              pointerEvents: 'auto',
              p: 2,
              width: 480,
              maxWidth: (theme) => `calc(100vw - ${theme.spacing(4)})`,
              boxSizing: 'border-box',
            },
          },
        }}
      >
        <Typography id={`${id}-title`} render={<h2 />} variant="body-md" sx={{ fontWeight: 700, mb: 1 }}>
          Current sprint forecast
        </Typography>
        {forecast.status === 'ready' ? (
          <>
            <Table size="small" aria-label="Sprint effort forecast" sx={{ '& th, & td': { px: 1, py: 0.5 } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Effort</TableCell>
                  <TableCell align="right">Start</TableCell>
                  <TableCell align="right">Now</TableCell>
                  <TableCell align="right">Projected end</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {forecast.rows.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell component="th" scope="row" sx={row.nested ? { pl: 3, color: 'text.secondary' } : undefined}>
                      {row.label}
                    </TableCell>
                    <TableCell align="right"><EffortValue value={row.start} scope={committedEffort} /></TableCell>
                    <TableCell align="right"><EffortValue value={row.current} scope={committedEffort} /></TableCell>
                    <TableCell align="right"><EffortValue value={row.projected} scope={committedEffort} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Typography variant="body-sm" sx={{ mt: 1 }}>
              Remaining = Blocked + New + Active + Review; Not started (Blocked + New) is part of Remaining.
              {' '}Complete = Done. Added = effort that joined after sprint start (already counted in Remaining or Complete).
              {' '}Removed = sprint-start effort of items moved out of the sprint.
            </Typography>
            <Typography variant="body-sm" sx={{ mt: 1 }}>
              Scope: {formatEffort.format(forecast.startTotalEffort)} committed at start,
              {' '}+{formatEffort.format(forecast.addedEffort)} added, −{formatEffort.format(forecast.removedEffort)} removed,
              {' '}{formatEffort.format(forecast.totalEffort)} now.
              {' '}Percentages are of effort committed at start; added work can push a column past 100%.
              {' '}Independent linear trends over weekdays, not a delivery guarantee.
            </Typography>
          </>
        ) : (
          <Typography role="status" variant="body-sm">
            {forecast.status === 'loading' ? 'Loading sprint history...' : forecast.reason}
          </Typography>
        )}
        <Typography variant="body-sm" color="text.secondary" sx={{ mt: 1 }}>
          Uses current-sprint work items matching the member and text filters; PR-only cards are excluded.
          {' '}Start uses sprint membership as of the sprint start date; an item added and then removed mid-sprint isn't counted.
          {' '}Estimate changes can distort the trend.
        </Typography>
      </Popover>
    </>
  )
}
