import type { Theme } from '@mui/material/styles'

export const STATUS_COLUMNS = ['Blocked', 'New', 'Active', 'Review', 'Done'] as const

export type StatusColumn = (typeof STATUS_COLUMNS)[number]

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

function getStatusTint(colorScheme: 'light' | 'dark'): number {
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
