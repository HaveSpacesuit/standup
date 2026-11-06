import type { CSSProperties } from 'react'
import svgArrowDown from '@stratakit/icons/arrow-down.svg'
import svgChartBar from '@stratakit/icons/chart-bar.svg'
import svgClock from '@stratakit/icons/clock.svg'
import svgStatusError from '@stratakit/icons/status-error.svg'
import svgStatusSuccess from '@stratakit/icons/status-success.svg'
import { CHART_TEXT_SECONDARY } from './testChartStyles'
import type { TestHealthStatus, TestRunClass } from '../utils/testHealth'

export const ATTENTION_TEXT_COLOR = 'var(--stratakit-color-text-attention-base)'
export const CRITICAL_TEXT_COLOR = 'var(--stratakit-color-text-critical-base)'
/** Health tiles: up to four per row, each at least 240px wide (10px gaps). */
export const TEST_TILE_GRID_COLUMNS = 'repeat(auto-fill, minmax(max(240px, calc((100% - 30px) / 4)), 1fr))'

type StatusPresentation = {
  icon: string
  iconColor: string
  /** The leading edge on a tile or row label; usual pipelines have none. */
  edge: string
  chip: CSSProperties
}

const ATTENTION: Omit<StatusPresentation, 'icon'> = {
  iconColor: 'var(--stratakit-color-icon-attention-base)',
  edge: 'var(--stratakit-color-border-attention-base)',
  chip: { color: ATTENTION_TEXT_COLOR, background: 'var(--stratakit-color-bg-attention-muted)' },
}

export const TEST_HEALTH_STATUS_PRESENTATION: Record<TestHealthStatus, StatusPresentation> = {
  usual: {
    icon: svgStatusSuccess,
    iconColor: 'var(--stratakit-color-icon-positive-base)',
    edge: 'transparent',
    chip: { color: CHART_TEXT_SECONDARY, background: 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)' },
  },
  below: { icon: svgArrowDown, ...ATTENTION },
  fewer: { icon: svgChartBar, ...ATTENTION },
  sharp: {
    icon: svgStatusError,
    iconColor: 'var(--stratakit-color-icon-critical-base)',
    edge: 'var(--stratakit-color-border-critical-base)',
    chip: { color: CRITICAL_TEXT_COLOR, background: 'var(--stratakit-color-bg-critical-muted)' },
  },
  stale: {
    icon: svgClock,
    iconColor: 'var(--stratakit-color-icon-neutral-secondary)',
    edge: 'var(--stratakit-color-border-mono-base)',
    chip: { color: CHART_TEXT_SECONDARY, border: '1px dashed var(--stratakit-color-border-neutral-muted)' },
  },
}

/** The chart class for a run's point: neutral, amber, red, or hollow amber. */
export function testPointClassName(cls: TestRunClass): string {
  return cls === 'ok' ? 'tests-point' : `tests-point tests-point-${cls}`
}
