import type { Theme } from '@mui/material/styles'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'

export const CHART_TEXT_PRIMARY = 'var(--stratakit-color-text-neutral-primary)'
export const CHART_TEXT_SECONDARY = 'var(--stratakit-color-text-neutral-secondary)'
export const CHART_PAPER = 'var(--stratakit-mui-palette-background-paper)'
export const CHART_DIVIDER = 'var(--stratakit-mui-palette-divider)'
const ACCENT = 'var(--stratakit-color-bg-accent-base)'
const ATTENTION = 'var(--stratakit-color-bg-attention-base)'

/** Text, gridlines, weekend shading, usual bands, and status points shared by the Tests charts; spread into an svg's `sx`. */
export const testChartStyles = (theme: Theme) => ({
  display: 'block',
  '& text': { fontFamily: 'inherit' },
  '& .tests-axis text, & text.tests-axis': { fill: TERTIARY_TEXT_COLOR, fontSize: 11, fontVariantNumeric: 'tabular-nums' },
  '& .tests-axis-title': { fill: CHART_TEXT_SECONDARY, fontSize: 11 },
  '& .tests-grid line, & line.tests-grid': { stroke: 'var(--stratakit-color-border-neutral-muted)', strokeOpacity: 0.6 },
  '& .tests-weekend': { fill: CHART_TEXT_PRIMARY, opacity: 0.035 },
  '& .tests-hover-ring': { fill: 'none', strokeWidth: 2, pointerEvents: 'none' },
  '& .tests-band': { fill: `color-mix(in srgb, ${ACCENT} 14%, transparent)` },
  '& .tests-band-edge': { stroke: `color-mix(in srgb, ${ACCENT} 45%, transparent)`, strokeWidth: 1 },
  '& .tests-line': { fill: 'none', stroke: CHART_TEXT_SECONDARY, strokeWidth: 1.5, strokeLinejoin: 'round' },
  '& .tests-line-gap': { fill: 'none', stroke: TERTIARY_TEXT_COLOR, strokeWidth: 1.2, strokeDasharray: '3 4' },
  '& .tests-point': { fill: CHART_TEXT_SECONDARY },
  '& .tests-point-below': { fill: ATTENTION },
  '& .tests-point-sharp': { fill: 'var(--stratakit-color-bg-critical-base)' },
  '& .tests-point-fewer': { fill: CHART_PAPER, stroke: ATTENTION, strokeWidth: 1.8 },
  '& .tests-hatch-mono': { stroke: CHART_DIVIDER, strokeWidth: 1.5 },
  '& .tests-sprint-line': { stroke: CHART_DIVIDER },
  '& .tests-sprint-label': { fill: TERTIARY_TEXT_COLOR, fontSize: 10.5, fontWeight: 600 },
  '& .tests-sprint-label-current': { fill: 'var(--stratakit-color-text-accent-strong)' },
  '& .tests-latest': { fill: CHART_TEXT_PRIMARY, fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  '& .tests-latest-stale': { fill: TERTIARY_TEXT_COLOR },
  '& .tests-latest-attention': { fill: 'var(--stratakit-color-text-attention-base)' },
  '& .tests-latest-critical': { fill: 'var(--stratakit-color-text-critical-base)' },
  '& .tests-stale-text': { fill: CHART_TEXT_SECONDARY, fontSize: 10.5, fontWeight: 600 },
  '& .tests-crosshair': { stroke: CHART_TEXT_PRIMARY, strokeOpacity: 0.5, pointerEvents: 'none' },
  '& .tests-crosshair-point': { fill: 'none', stroke: CHART_TEXT_PRIMARY, strokeWidth: 1.5, pointerEvents: 'none' },
  '& .tests-pill': { pointerEvents: 'none' },
  '& .tests-pill text': { fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  '& .tests-pill-plain rect': { fill: 'var(--stratakit-color-bg-elevation-emphasis)' },
  '& .tests-pill-plain text': { fill: 'var(--stratakit-color-text-neutral-emphasis)' },
  '& .tests-pill-attention rect': { fill: 'var(--stratakit-color-bg-attention-muted)', stroke: 'var(--stratakit-color-border-attention-base)' },
  '& .tests-pill-attention text': { fill: 'var(--stratakit-color-text-attention-base)' },
  '& .tests-pill-critical rect': { fill: 'var(--stratakit-color-bg-critical-muted)', stroke: 'var(--stratakit-color-border-critical-base)' },
  '& .tests-pill-critical text': { fill: 'var(--stratakit-color-text-critical-base)' },
  '& .tests-pill-muted rect': { fill: CHART_PAPER, stroke: 'var(--stratakit-color-border-neutral-muted)' },
  '& .tests-pill-muted text': { fill: CHART_TEXT_SECONDARY },
  // applyStyles is typed as emotion's CSSObject, which sx doesn't accept as is.
  ...(theme.applyStyles('dark', {
    '& .tests-weekend': { opacity: 0.06 },
    '& .tests-band': { fill: `color-mix(in srgb, ${ACCENT} 22%, transparent)` },
    '& .tests-pill-plain rect': { stroke: 'var(--stratakit-color-border-elevation-base)' },
  }) as object),
})
