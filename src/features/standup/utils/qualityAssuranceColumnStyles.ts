import type { Theme } from '@mui/material/styles'
import type { QualityAssuranceBucketId } from './qualityAssuranceBuckets'

type QaAccentPaletteKey = 'info' | 'warning' | 'error' | 'success'

const BUCKET_ACCENT: Record<QualityAssuranceBucketId, QaAccentPaletteKey> = {
  new: 'info',
  'needs-testing': 'warning',
  'needs-development': 'error',
  done: 'success',
}

export const QUALITY_ASSURANCE_BUCKET_ORDER: readonly QualityAssuranceBucketId[] = [
  'new',
  'needs-development',
  'needs-testing',
  'done',
]

export function getQaBucketAccentColor(bucketId: QualityAssuranceBucketId, palette: Theme['palette']): string {
  return palette[BUCKET_ACCENT[bucketId]].main as string
}

function getQaHeaderTint(colorScheme: 'light' | 'dark'): number {
  return colorScheme === 'light' ? 16 : 28
}

function getQaBodyTint(colorScheme: 'light' | 'dark'): number {
  return colorScheme === 'light' ? 5 : 12
}

function getQaBorderTint(colorScheme: 'light' | 'dark'): number {
  return colorScheme === 'light' ? 30 : 44
}

function mixWithPaper(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, var(--stratakit-mui-palette-background-paper))`
}

export function getQaHeaderBackground(accentColor: string, colorScheme: 'light' | 'dark'): string {
  return mixWithPaper(accentColor, getQaHeaderTint(colorScheme))
}

export function getQaColumnBackground(accentColor: string, colorScheme: 'light' | 'dark'): string {
  return mixWithPaper(accentColor, getQaBodyTint(colorScheme))
}

export function getQaColumnBorderColor(accentColor: string, colorScheme: 'light' | 'dark'): string {
  return mixWithPaper(accentColor, getQaBorderTint(colorScheme))
}
