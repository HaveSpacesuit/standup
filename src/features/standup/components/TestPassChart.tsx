import { useMemo, useRef, useState, type MouseEvent } from 'react'
import { Box } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { ChartTooltip, SeriesMarker } from './testChartParts'
import { testChartStyles } from './testChartStyles'
import { TipLines } from './TipLines'
import { useElementSize } from '../hooks/useElementSize'
import { testPointPassRate, testStageLabel, type TestChartPoint, type TestPipeline } from '../utils/testPipelines'
import {
  createTestTimeAxis, formatAxisDay, formatPassRate, formatRunDay, formatRunTime, formatTestCount, isTestWeekend,
  PASS_RATE_TICKS, passRatePosition, testAxisDate, testDayTime, testLinePaths, testMondayIndexes, testPipelineShortName,
  testRunUrl, type TestSeriesShape,
} from '../utils/testHealth'

export type TestSeries = { pipeline: TestPipeline; points: TestChartPoint[]; color: string; shape: TestSeriesShape }
export type TestChartRange = { start: number; end: number }
/** The focused pipeline and the failure-scale positions of its usual range. */
export type TestChartFocus = { id: string; highPosition: number; lowPosition: number }

const MARGIN = { top: 10, right: 16, bottom: 26, left: 62 }
/** Where ResizeObserver is missing, as in tests, the plot takes a typical size. */
const FALLBACK_SIZE = { width: 960, height: 440 }
const MIN_WIDTH = 420
/** The pointer only has to come this close to a run, so small points are easy to hover. */
const HOVER_RADIUS = 24
// Headroom above the 100% gridline, so points at 100% aren't clipped.
const Y_TOP = passRatePosition(100) - 0.06
const Y_BOTTOM = passRatePosition(0)
const MIN_TICK_LABEL_GAP = 52
const FADED_OPACITY = 0.18

type PlotPoint = { key: string; series: TestSeries; point: TestChartPoint; x: number; y: number }

function PointTip({ entry }: { entry: PlotPoint }) {
  const { series, point } = entry
  const date = new Date(point.date)
  const lines = [`${testPipelineShortName(series.pipeline)} · ${testStageLabel(series.pipeline.stageName)}`]
  if ('passRate' in point) {
    lines.push(formatRunDay(date), `Average of ${point.runCount} runs · ${formatPassRate(point.passRate)} passed`)
  } else {
    lines.push(
      `${formatRunDay(date)} · ${formatRunTime(date)}`,
      `${formatTestCount(point.total - point.passed)} failed of ${formatTestCount(point.total)} · ${formatPassRate(testPointPassRate(point))} passed`,
    )
  }
  return (
    <Box component="span" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
      <TipLines lines={lines} boldFirst />
      <Box component="span" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
        {point.runId !== undefined ? 'Click to open in Azure DevOps' : 'An average has no single run to open'}
      </Box>
    </Box>
  )
}

/**
 * Every pipeline's pass rate over time on one log-scaled chart. Focusing a pipeline fades the others, shades its usual
 * range, and limits hover to its runs.
 */
export function TestPassChart({ series, range, focus = null }: { series: TestSeries[]; range: TestChartRange; focus?: TestChartFocus | null }) {
  const plotRef = useRef<HTMLDivElement>(null)
  const measured = useElementSize(plotRef, FALLBACK_SIZE)
  const width = Math.max(MIN_WIDTH, measured.width)
  const height = measured.height || FALLBACK_SIZE.height
  const [hover, setHover] = useState<PlotPoint | null>(null)
  const axis = useMemo(() => createTestTimeAxis(range), [range])
  const focusId = focus?.id ?? null

  const plot = useMemo(() => {
    const left = MARGIN.left
    const right = width - MARGIN.right
    const top = MARGIN.top
    const bottom = height - MARGIN.bottom
    const x = (t: number) => left + (t / axis.dayCount) * (right - left)
    const y = (position: number) => top + ((position - Y_TOP) / (Y_BOTTOM - Y_TOP)) * (bottom - top)
    const dayWidth = (right - left) / axis.dayCount
    const mondays = testMondayIndexes(axis)
    const labelEvery = Math.max(1, Math.ceil(MIN_TICK_LABEL_GAP / (7 * dayWidth)))
    const lines = series.map((entry) => {
      const points = entry.points.flatMap((point, index) => {
        const t = testDayTime(axis, Date.parse(point.date))
        return t >= 0 ? [{ key: `${entry.pipeline.id}:${index}`, series: entry, point, t, x: x(t), y: y(passRatePosition(testPointPassRate(point))) }] : []
      })
      return { entry, points, paths: testLinePaths(points), faded: focusId !== null && entry.pipeline.id !== focusId }
    })
    // The focused line draws last, on top of the faded ones.
    lines.sort((a, b) => Number(b.faded) - Number(a.faded))
    return {
      left, right, top, bottom, x, y, dayWidth, lines,
      weekends: Array.from({ length: axis.dayCount }, (_, index) => index).filter((index) => isTestWeekend(axis, index)),
      mondays: mondays.map((index, order) => ({ index, x: x(index), label: order % labelEvery === 0 ? formatAxisDay(testAxisDate(axis, index)) : null })),
    }
  }, [axis, series, focusId, width, height])

  const findNearest = (event: MouseEvent<SVGSVGElement>): PlotPoint | null => {
    const box = event.currentTarget.getBoundingClientRect()
    const pointerX = event.clientX - box.left
    const pointerY = event.clientY - box.top
    let nearest: PlotPoint | null = null
    let nearestDistance = HOVER_RADIUS
    for (const { points, faded } of plot.lines) {
      if (faded) continue
      for (const candidate of points) {
        const distance = Math.hypot(candidate.x - pointerX, candidate.y - pointerY)
        if (distance <= nearestDistance) {
          nearestDistance = distance
          nearest = candidate
        }
      }
    }
    return nearest
  }
  // A focus change can fade the hovered line.
  const activeHover = hover && hover.series.pipeline.id !== focusId && focusId !== null ? null : hover

  return (
    <ChartTooltip anchor={activeHover} containerRef={plotRef} content={activeHover ? <PointTip entry={activeHover} /> : null}>
      <Box ref={plotRef} sx={{ position: 'relative', height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
        <Box
          component="svg"
          role="img"
          aria-label="E2E test pass percentage by pipeline over time"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          sx={(theme: Theme) => ({
            ...testChartStyles(theme),
            position: 'absolute',
            top: 0,
            left: 0,
            cursor: activeHover?.point.runId !== undefined ? 'pointer' : 'default',
          })}
          onMouseMove={(event: MouseEvent<SVGSVGElement>) => {
            const nearest = findNearest(event)
            if (nearest?.key !== activeHover?.key) setHover(nearest)
          }}
          onMouseLeave={() => setHover(null)}
          onClick={() => {
            const runId = activeHover?.point.runId
            if (activeHover && runId !== undefined) window.open(testRunUrl(activeHover.series.pipeline, runId), '_blank', 'noopener,noreferrer')
          }}
        >
          <g aria-hidden="true">
            {plot.weekends.map((index) => (
              <rect key={index} className="tests-weekend" x={plot.x(index)} y={plot.top} width={plot.dayWidth} height={plot.bottom - plot.top} />
            ))}
            <g className="tests-grid">
              {PASS_RATE_TICKS.map((percent) => (
                <line key={percent} x1={plot.left} x2={plot.right} y1={plot.y(passRatePosition(percent))} y2={plot.y(passRatePosition(percent))} />
              ))}
              {plot.mondays.map(({ index, x }) => <line key={index} x1={x} x2={x} y1={plot.top} y2={plot.bottom} />)}
            </g>
            <g className="tests-axis">
              {PASS_RATE_TICKS.map((percent) => (
                <text key={percent} x={plot.left - 6} y={plot.y(passRatePosition(percent))} dy=".35em" textAnchor="end">{percent}%</text>
              ))}
              {plot.mondays.map(({ index, x, label }) => label
                ? <text key={index} x={x} y={plot.bottom + 17} textAnchor="middle">{label}</text>
                : null)}
            </g>
            <text
              className="tests-axis-title"
              transform={`translate(14 ${((plot.top + plot.bottom) / 2).toFixed(1)}) rotate(-90)`}
              textAnchor="middle"
            >
              Tests passed
            </text>
            {focus ? (
              <rect
                className="tests-band"
                data-testid="tests-focus-band"
                x={plot.left}
                y={plot.y(focus.highPosition)}
                width={plot.right - plot.left}
                height={Math.max(1.5, plot.y(focus.lowPosition) - plot.y(focus.highPosition))}
              />
            ) : null}
            {plot.lines.map(({ entry, points, paths, faded }) => (
              <g key={entry.pipeline.id} data-pipeline={entry.pipeline.id} style={{ opacity: faded ? FADED_OPACITY : 1 }}>
                <path d={paths.solid} style={{ fill: 'none', stroke: entry.color, strokeWidth: 1.75, strokeLinejoin: 'round' }} />
                {paths.dashed ? <path d={paths.dashed} style={{ fill: 'none', stroke: entry.color, strokeWidth: 1.5, strokeDasharray: '4 4' }} /> : null}
                {points.map((point) => (
                  <SeriesMarker key={point.key} shape={entry.shape} x={point.x} y={point.y} r={3.1} color={entry.color} />
                ))}
              </g>
            ))}
            {activeHover ? <circle className="tests-hover-ring" cx={activeHover.x} cy={activeHover.y} r={6.5} style={{ stroke: activeHover.series.color }} /> : null}
          </g>
        </Box>
      </Box>
    </ChartTooltip>
  )
}
