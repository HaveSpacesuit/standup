import { Box } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCheckmark from '@stratakit/icons/checkmark.svg'
import type { ReactNode } from 'react'

type ColumnRailMarkProps = {
  /** The column's status color, drawn as a short bar above the count. */
  color: string
  count: number
  /** Visually hidden text read after the count. */
  children?: ReactNode
}

/**
 * The header of a column collapsed to a rail: its color bar over its card count. An empty column
 * gets a positive check, so a rail that still holds cards never reads as all clear.
 */
export function ColumnRailMark({ color, count, children }: ColumnRailMarkProps) {
  const empty = count === 0

  return (
    <Box component="span" data-column-rail-mark="" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      <Box component="span" aria-hidden="true" sx={{ width: 22, height: 4, borderRadius: 999, bgcolor: color }} />
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          color: empty ? 'var(--stratakit-color-text-positive-base)' : 'text.secondary',
          fontSize: 11,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          '& svg': { color: 'var(--stratakit-color-icon-positive-base)' },
        }}
      >
        {empty ? <Icon href={svgCheckmark} /> : null}
        {count}
        {children}
      </Box>
    </Box>
  )
}
