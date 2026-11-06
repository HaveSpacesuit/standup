import type { CSSProperties } from 'react'
import svgArrowDown from '@stratakit/icons/arrow-down.svg'
import svgChartBar from '@stratakit/icons/chart-bar.svg'
import svgClock from '@stratakit/icons/clock.svg'
import svgStatusError from '@stratakit/icons/status-error.svg'
import svgStatusSuccess from '@stratakit/icons/status-success.svg'
import svgWarning from '@stratakit/icons/warning.svg'
import { CHART_TEXT_SECONDARY } from './testChartStyles'
import { TEST_CHANGE_TONES, type TestChangeTone, type TestChangeType, type TestHealthStatus, type TestRunClass } from '../utils/testHealth'

export const ATTENTION_TEXT_COLOR = 'var(--stratakit-color-text-attention-base)'
export const CRITICAL_TEXT_COLOR = 'var(--stratakit-color-text-critical-base)'
/** Health tiles: up to four per row, each at least 240px wide (10px gaps). */
export const TEST_TILE_GRID_COLUMNS = 'repeat(auto-fill, minmax(max(240px, calc((100% - 30px) / 4)), 1fr))'
/** Below this page width, the Changes panel moves under the charts. */
export const TESTS_PANEL_STACK_QUERY = '@container (max-width: 900px)'

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

type ChangePresentation = {
  icon: string
  iconColor: string
  /** The leading edge and chart marker colour. */
  edge: string
  /** The callout background in run details. */
  wash: string
}

const TONE_COLORS: Record<TestChangeTone, Omit<ChangePresentation, 'icon'>> = {
  critical: {
    iconColor: 'var(--stratakit-color-icon-critical-base)',
    edge: 'var(--stratakit-color-border-critical-base)',
    wash: 'var(--stratakit-color-bg-critical-muted)',
  },
  positive: {
    iconColor: 'var(--stratakit-color-icon-positive-base)',
    edge: 'var(--stratakit-color-border-positive-base)',
    wash: 'var(--stratakit-color-bg-positive-muted)',
  },
  attention: {
    iconColor: 'var(--stratakit-color-icon-attention-base)',
    edge: 'var(--stratakit-color-border-attention-base)',
    wash: 'var(--stratakit-color-bg-attention-muted)',
  },
  neutral: {
    iconColor: 'var(--stratakit-color-icon-neutral-secondary)',
    edge: 'var(--stratakit-color-border-neutral-base)',
    wash: 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)',
  },
}

const CHANGE_ICONS: Record<TestChangeType, string> = {
  drop: svgStatusError,
  recover: svgStatusSuccess,
  first: svgWarning,
  fewer: svgChartBar,
  below: svgArrowDown,
  stale: svgClock,
}

export function testChangePresentation(type: TestChangeType): ChangePresentation {
  return { icon: CHANGE_ICONS[type], ...TONE_COLORS[TEST_CHANGE_TONES[type]] }
}
