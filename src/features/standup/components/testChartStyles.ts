import type { Theme } from '@mui/material/styles'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'

export const CHART_TEXT_PRIMARY = 'var(--stratakit-color-text-neutral-primary)'
export const CHART_TEXT_SECONDARY = 'var(--stratakit-color-text-neutral-secondary)'
export const CHART_PAPER = 'var(--stratakit-mui-palette-background-paper)'

/** Text, gridlines, and weekend shading shared by the Tests charts; spread into an svg's `sx`. */
export const testChartStyles = (theme: Theme) => ({
  display: 'block',
  '& text': { fontFamily: 'inherit' },
  '& .tests-axis text, & text.tests-axis': { fill: TERTIARY_TEXT_COLOR, fontSize: 11, fontVariantNumeric: 'tabular-nums' },
  '& .tests-axis-title': { fill: CHART_TEXT_SECONDARY, fontSize: 11 },
  '& .tests-grid line, & line.tests-grid': { stroke: 'var(--stratakit-color-border-neutral-muted)', strokeOpacity: 0.6 },
  '& .tests-weekend': { fill: CHART_TEXT_PRIMARY, opacity: 0.035 },
  '& .tests-hover-ring': { fill: 'none', strokeWidth: 2, pointerEvents: 'none' },
  // applyStyles is typed as emotion's CSSObject, which sx doesn't accept as is.
  ...(theme.applyStyles('dark', { '& .tests-weekend': { opacity: 0.06 } }) as object),
})
