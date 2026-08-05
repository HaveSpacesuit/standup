import type { Theme } from '@mui/material/styles'

export const STATUS_COLUMNS = ['Blocked', 'New', 'Active', 'Review', 'Done'] as const

export type StatusColumn = (typeof STATUS_COLUMNS)[number]
export type StatusBadgeColor = 'error' | 'info' | 'primary' | 'warning' | 'success'

export function getStatusBadgeColor(status: StatusColumn): StatusBadgeColor {
  switch (status) {
    case 'Blocked':
      return 'error'
    case 'New':
      return 'info'
    case 'Active':
      return 'primary'
    case 'Review':
      return 'warning'
    case 'Done':
      return 'success'
  }
}

export function getStatusColumnColor(status: StatusColumn, palette: Theme['palette']): string {
  switch (status) {
    case 'Blocked':
      return palette.error.main as string
    case 'New':
      return palette.info.main as string
    case 'Active':
      return palette.primary.main as string
    case 'Review':
      return palette.warning.main as string
    case 'Done':
      return palette.success.main as string
  }
}

export function getStatusTint(colorScheme: 'light' | 'dark'): number {
  return colorScheme === 'light' ? 14 : 22
}

export function getTintedStatusColor(
  status: StatusColumn,
  palette: Theme['palette'],
  colorScheme: 'light' | 'dark',
): string {
  const statusColor = getStatusColumnColor(status, palette)
  const tint = getStatusTint(colorScheme)
  return `color-mix(in srgb, ${statusColor} ${tint}%, var(--stratakit-mui-palette-background-paper))`
}

export function getStatusColumnBackground(
  status: StatusColumn,
  columnIndex: number,
  palette: Theme['palette'],
  colorScheme: 'light' | 'dark',
): string {
  const base = getTintedStatusColor(status, palette, colorScheme)
  const previousStatus = STATUS_COLUMNS[columnIndex - 1]
  const nextStatus = STATUS_COLUMNS[columnIndex + 1]

  if (!previousStatus && !nextStatus) {
    return base
  }

  const edgeBlend = 2
  const leftEdge = previousStatus
    ? `color-mix(in srgb, ${getTintedStatusColor(previousStatus, palette, colorScheme)} 45%, ${base})`
    : base
  const rightEdge = nextStatus
    ? `color-mix(in srgb, ${base} 45%, ${getTintedStatusColor(nextStatus, palette, colorScheme)})`
    : base

  return `linear-gradient(to right, ${leftEdge} 0%, ${base} ${edgeBlend}%, ${base} ${100 - edgeBlend}%, ${rightEdge} 100%)`
}
