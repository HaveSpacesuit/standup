import type { Theme } from '@mui/material/styles'

export const STATUS_COLUMNS = ['Blocked', 'New', 'Active', 'Review', 'Done'] as const

export type StatusColumn = (typeof STATUS_COLUMNS)[number]

export function getStatusColumnColor(status: StatusColumn, palette: Theme['palette']): string {
  switch (status) {
    case 'Blocked':
      return palette.error.main as string
    case 'New':
      return 'var(--stratakit-color-icon-neutral-secondary)'
    case 'Active':
      return palette.info.main as string
    case 'Review':
      // StrataKit has no categorical violet; tune it separately for each surface scheme.
      return 'light-dark(rgb(116, 65, 171), rgb(190, 156, 233))'
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
