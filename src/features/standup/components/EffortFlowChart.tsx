import { useLayoutEffect, useMemo, useState } from 'react'
import { Box, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type Chart,
  type TooltipItem,
  type TooltipModel,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { getStatusColumnColor, getTintedStatusColor, STATUS_COLUMNS } from '../utils/statusColumnStyles'
import type { EffortFlowPoint } from '../hooks/useEffortFlowHistory'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip)

type EffortFlowChartProps = {
  points: EffortFlowPoint[]
  isLoading: boolean
  colorScheme: 'light' | 'dark'
}

/** Theme palette colors are CSS custom-property references (e.g. `var(--...)`), which canvas
 * rendering can't parse directly — resolve them to a concrete rgb() string via a probe element. */
function resolveCssColor(value: string): string {
  if (typeof window === 'undefined') {
    return value
  }

  const probe = document.createElement('span')
  probe.style.color = value
  probe.style.position = 'absolute'
  probe.style.pointerEvents = 'none'
  probe.style.opacity = '0'
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()

  return resolved || value
}

function withAlpha(rgbColor: string, alpha: number): string {
  const match = /^rgba?\(([^)]+)\)$/.exec(rgbColor)
  if (!match) {
    return rgbColor
  }

  const [r, g, b] = match[1].split(',').map((part) => part.trim())
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

type ResolvedStatusColors = Record<(typeof STATUS_COLUMNS)[number], { fill: string; line: string }>

function resolveStatusColors(palette: Theme['palette'], colorScheme: 'light' | 'dark'): ResolvedStatusColors {
  return Object.fromEntries(
    STATUS_COLUMNS.map((status) => [
      status,
      {
        // Match the kanban board columns: a subtle tint for the fill, the underlying status color
        // (at low opacity) for the outline.
        fill: resolveCssColor(getTintedStatusColor(status, palette, colorScheme)),
        line: withAlpha(resolveCssColor(getStatusColumnColor(status, palette)), 0.5),
      },
    ]),
  ) as ResolvedStatusColors
}

// The chart lives in a very short footer strip, so a canvas-drawn tooltip has nowhere to render
// without being clipped. This renders the tooltip as a fixed-position DOM element instead, so it
// can float above the chart and stay clamped inside the viewport.
const TOOLTIP_ID = 'effort-flow-chart-tooltip'

function getOrCreateTooltipEl(): HTMLDivElement {
  let el = document.getElementById(TOOLTIP_ID) as HTMLDivElement | null
  if (!el) {
    el = document.createElement('div')
    el.id = TOOLTIP_ID
    Object.assign(el.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '1500',
      opacity: '0',
      transition: 'opacity 0.08s ease',
      padding: '6px 10px',
      borderRadius: '4px',
      background: 'rgba(20, 20, 20, 0.92)',
      color: '#fff',
      fontSize: '11px',
      lineHeight: '1.5',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
      whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>)
    document.body.appendChild(el)
  }

  return el
}

function renderExternalTooltip({ chart, tooltip }: { chart: Chart; tooltip: TooltipModel<'line'> }) {
  const tooltipEl = getOrCreateTooltipEl()

  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = '0'
    return
  }

  const rows = tooltip.dataPoints
    .map((_point, index) => {
      const color = tooltip.labelColors[index]?.borderColor ?? '#fff'
      const line = tooltip.body[index]?.lines?.[0] ?? ''
      return `<div style="display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${String(color)};"></span>
        <span>${line}</span>
      </div>`
    })
    .join('')

  tooltipEl.innerHTML = `${tooltip.title?.length ? `<div style="font-weight:600;margin-bottom:4px;">${tooltip.title.join('')}</div>` : ''}${rows}`

  const canvasRect = chart.canvas.getBoundingClientRect()
  tooltipEl.style.opacity = '1'
  // Reset position before measuring so the previous placement doesn't affect layout/scroll size.
  tooltipEl.style.left = '0px'
  tooltipEl.style.top = '0px'
  const tooltipRect = tooltipEl.getBoundingClientRect()
  const margin = 8

  let left = canvasRect.left + tooltip.caretX + margin
  if (left + tooltipRect.width > window.innerWidth - margin) {
    left = canvasRect.left + tooltip.caretX - tooltipRect.width - margin
  }
  left = Math.max(margin, left)

  // Always place the tooltip above the point — the chart sits at the bottom of the page, so
  // anchoring below would push it off-screen.
  let top = canvasRect.top + tooltip.caretY - tooltipRect.height - margin
  if (top < margin) {
    top = Math.min(canvasRect.top + tooltip.caretY + margin, window.innerHeight - tooltipRect.height - margin)
  }

  tooltipEl.style.left = `${left}px`
  tooltipEl.style.top = `${top}px`
}

export function EffortFlowChart({ points, isLoading, colorScheme }: EffortFlowChartProps) {
  const theme = useTheme()

  // The color-scheme attribute that drives the theme's CSS custom properties is only applied to
  // the DOM after this render commits, so resolving colors during render would read the *previous*
  // scheme. Re-resolve in a layout effect, which runs after that attribute is in place.
  const [statusColors, setStatusColors] = useState(() => resolveStatusColors(theme.palette, colorScheme))

  useLayoutEffect(() => {
    setStatusColors(resolveStatusColors(theme.palette, colorScheme))
  }, [theme.palette, colorScheme])

  useLayoutEffect(() => {
    return () => {
      document.getElementById(TOOLTIP_ID)?.remove()
    }
  }, [])

  const data = useMemo(
    () => ({
      labels: points.map((point) => point.date),
      datasets: STATUS_COLUMNS.map((status, index) => ({
        label: status,
        data: points.map((point) => point[status]),
        borderColor: statusColors[status].line,
        backgroundColor: statusColors[status].fill,
        fill: index === 0 ? 'origin' : '-1',
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 1,
        spanGaps: false,
      })),
    }),
    [points, statusColors],
  )

  const options = useMemo(() => {
    const maxTotal = points.reduce((max, point) => {
      const total = STATUS_COLUMNS.reduce((sum, status) => sum + (point[status] ?? 0), 0)
      return Math.max(max, total)
    }, 0)

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 0 },
      interaction: { mode: 'index' as const, intersect: false },
      scales: {
        x: { stacked: true, display: false, offset: false },
        // Fix min/max to the exact data range (no auto headroom) so the stacked area fills the
        // full canvas height instead of leaving blank space above the tallest band.
        y: { stacked: true, display: false, min: 0, max: maxTotal || 1, grace: 0 },
      },
      plugins: {
        legend: { display: false },
        // Datasets stack bottom-up (Blocked at bottom, Done at top) — reverse so the tooltip
        // reads top-down in the same visual order as the chart.
        tooltip: {
          enabled: false,
          external: renderExternalTooltip,
          itemSort: (a: TooltipItem<'line'>, b: TooltipItem<'line'>) => b.datasetIndex - a.datasetIndex,
        },
      },
    }
  }, [points])

  if (points.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Typography variant="caption-sm" color="text.secondary">
          {isLoading ? 'Loading effort history…' : 'Effort flow unavailable for this sprint.'}
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', width: '100%', minWidth: 0 }}>
      <Line data={data} options={options} />
    </Box>
  )
}
