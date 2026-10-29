import { useEffect, useId, useRef, useState } from 'react'
import { Box, Chip, Popover, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgInfo from '@stratakit/icons/info.svg'
import type { SprintForecast } from '../utils/sprintForecast'
import { SprintForecastDetails } from './SprintForecastDetails'

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
          <SprintForecastDetails forecast={forecast} />
        ) : (
          <Typography role="status" variant="body-sm">
            {forecast.status === 'loading' ? 'Loading sprint history...' : forecast.reason}
          </Typography>
        )}
        <Typography variant="caption-sm" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          Projected end continues each status&apos;s weekday trend against today&apos;s scope: a pace check, not a delivery guarantee.
          {' '}Start is sprint membership on the start date; work added then removed mid-sprint isn&apos;t counted.
          {' '}Uses current-sprint work items matching the member and text filters, excluding PR-only cards.
          {' '}Estimate changes can distort the trend.
        </Typography>
      </Popover>
    </>
  )
}
