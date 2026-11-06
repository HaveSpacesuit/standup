import { useMemo, type ReactElement, type ReactNode, type RefObject } from 'react'
import { Tooltip } from '@mui/material'
import { CHART_PAPER } from './testChartStyles'
import type { TestSeriesShape } from '../utils/testHealth'

type MarkerProps = { shape: TestSeriesShape; x: number; y: number; r: number; color: string; stroke?: string; strokeWidth?: number }

const fixed = (value: number) => Math.round(value * 10) / 10

/** A pipeline's point marker; shapes keep the series apart without relying on color. */
export function SeriesMarker({ shape, x, y, r, color, stroke = CHART_PAPER, strokeWidth = 0.8 }: MarkerProps) {
  const style = { fill: color, stroke, strokeWidth }
  if (shape === 'square') {
    return <rect x={fixed(x - r * 0.9)} y={fixed(y - r * 0.9)} width={fixed(r * 1.8)} height={fixed(r * 1.8)} style={style} />
  }
  if (shape === 'triangle') {
    return <polygon points={`${fixed(x)},${fixed(y - r * 1.2)} ${fixed(x + r * 1.15)},${fixed(y + r * 0.8)} ${fixed(x - r * 1.15)},${fixed(y + r * 0.8)}`} style={style} />
  }
  if (shape === 'diamond') {
    return <polygon points={`${fixed(x)},${fixed(y - r * 1.25)} ${fixed(x + r * 1.25)},${fixed(y)} ${fixed(x)},${fixed(y + r * 1.25)} ${fixed(x - r * 1.25)},${fixed(y)}`} style={style} />
  }
  return <circle cx={fixed(x)} cy={fixed(y)} r={r} style={style} />
}

/** A short line with the pipeline's marker, for legends and tiles. */
export function SeriesSwatch({ shape, color, width = 22, height = 12 }: { shape: TestSeriesShape; color: string; width?: number; height?: number }) {
  return (
    <svg viewBox="0 0 22 12" width={width} height={height} aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <line x1={1} y1={6} x2={21} y2={6} style={{ stroke: color, strokeWidth: 2 }} />
      <SeriesMarker shape={shape} x={11} y={6} r={3.6} color={color} strokeWidth={1} />
    </svg>
  )
}

type ChartTooltipProps = {
  /** The hovered spot, in pixels from the top left of `containerRef`; null hides the tooltip. */
  anchor: { x: number; y: number } | null
  containerRef: RefObject<HTMLElement | null>
  content: ReactNode
  children: ReactElement
}

/**
 * A StrataKit tooltip pinned to a spot inside a chart rather than to an element, opened and closed by the chart's
 * own hover tracking. It always wraps its child, so the chart never remounts as the tooltip comes and goes.
 */
export function ChartTooltip({ anchor, containerRef, content, children }: ChartTooltipProps) {
  const x = anchor?.x
  const y = anchor?.y
  const anchorEl = useMemo(() => {
    if (x === undefined || y === undefined) {
      return null
    }
    return {
      getBoundingClientRect: () => {
        const box = containerRef.current?.getBoundingClientRect()
        const left = (box?.left ?? 0) + x
        const top = (box?.top ?? 0) + y - 6
        return { x: left, y: top, left, top, right: left, bottom: top + 12, width: 0, height: 12, toJSON: () => ({}) } as DOMRect
      },
    }
  }, [containerRef, x, y])

  return (
    <Tooltip
      open={anchorEl !== null}
      title={anchorEl ? content : ''}
      placement="top"
      describeChild
      disableHoverListener
      disableFocusListener
      disableTouchListener
      disableInteractive
      slotProps={{ popper: { anchorEl }, tooltip: { style: { maxWidth: 'none' } } }}
    >
      {children}
    </Tooltip>
  )
}
