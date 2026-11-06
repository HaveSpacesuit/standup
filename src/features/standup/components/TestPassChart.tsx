import { useMemo, useRef, useState, type MouseEvent } from 'react'
import { Box, Chip, Typography } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { ChartTooltip, SeriesMarker, SeriesSwatch } from './testChartParts'
import { testChartStyles } from './testChartStyles'
import { TipLines } from './TipLines'
import { useElementSize } from '../hooks/useElementSize'
import { PASS_RATE_TICKS, passRatePosition, testPointPassRate, testStageLabel, type TestChartPoint, type TestPipeline } from '../utils/testPipelines'
import {
  createTestTimeAxis, formatAxisDay, formatPassRate, formatRunDay, formatRunTime, formatTestCount, isTestWeekend,
  testAxisDate, testDayTime, testLinePaths, testMondayIndexes, testPipelineShortName, testRunUrl, type TestSeriesShape,
} from '../utils/testHealth'

export type TestSeries = { pipeline: TestPipeline; points: TestChartPoint[]; color: string; shape: TestSeriesShape }
export type TestChartRange = { start: number; end: number }

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

const HIDDEN_CHIP_STYLE = { borderStyle: 'dashed', backgroundColor: 'transparent', color: TERTIARY_TEXT_COLOR } as const

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

/** Every pipeline's pass rate over time on one log-scaled chart, with legend chips to show or hide each. */
export function TestPassChart({ series, range }: { series: TestSeries[]; range: TestChartRange }) {
  const plotRef = useRef<HTMLDivElement>(null)
  const measured = useElementSize(plotRef, FALLBACK_SIZE)
  const width = Math.max(MIN_WIDTH, measured.width)
  const height = measured.height || FALLBACK_SIZE.height
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const [hover, setHover] = useState<PlotPoint | null>(null)
  const axis = useMemo(() => createTestTimeAxis(range), [range])

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
    const lines = series.filter(({ pipeline }) => !hidden.has(pipeline.id)).map((entry) => {
      const points = entry.points.flatMap((point, index) => {
        const t = testDayTime(axis, Date.parse(point.date))
        return t >= 0 ? [{ key: `${entry.pipeline.id}:${index}`, series: entry, point, t, x: x(t), y: y(passRatePosition(testPointPassRate(point))) }] : []
      })
      return { entry, points, paths: testLinePaths(points) }
    })
    return {
      left, right, top, bottom, x, y, dayWidth, lines,
      weekends: Array.from({ length: axis.dayCount }, (_, index) => index).filter((index) => isTestWeekend(axis, index)),
      mondays: mondays.map((index, order) => ({ index, x: x(index), label: order % labelEvery === 0 ? formatAxisDay(testAxisDate(axis, index)) : null })),
    }
  }, [axis, series, hidden, width, height])

  const findNearest = (event: MouseEvent<SVGSVGElement>): PlotPoint | null => {
    const box = event.currentTarget.getBoundingClientRect()
    const pointerX = event.clientX - box.left
    const pointerY = event.clientY - box.top
    let nearest: PlotPoint | null = null
    let nearestDistance = HOVER_RADIUS
    for (const { points } of plot.lines) {
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

  const toggle = (id: string) => {
    setHover(null)
    setHidden((previous) => {
      const next = new Set(previous)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <Box role="group" aria-label="Pipelines" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
        {series.map((entry) => {
          const shown = !hidden.has(entry.pipeline.id)
          return (
            <Chip
              key={entry.pipeline.id}
              size="small"
              variant="outlined"
              onClick={() => toggle(entry.pipeline.id)}
              style={shown ? undefined : HIDDEN_CHIP_STYLE}
              slotProps={{ label: { 'aria-pressed': shown } }}
              label={(
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }}>
                  <Box component="span" sx={{ display: 'flex', opacity: shown ? 1 : 0.3 }}>
                    <SeriesSwatch shape={entry.shape} color={entry.color} />
                  </Box>
                  <Box component="span" sx={{ fontWeight: 650 }}>{testPipelineShortName(entry.pipeline)}</Box>
                  <Box component="span" sx={{ color: TERTIARY_TEXT_COLOR }}>{testStageLabel(entry.pipeline.stageName)}</Box>
                </Box>
              )}
            />
          )
        })}
        <Typography variant="caption-md" sx={{ color: TERTIARY_TEXT_COLOR, ml: 0.5 }}>Click to show or hide</Typography>
      </Box>

      <ChartTooltip anchor={hover} containerRef={plotRef} content={hover ? <PointTip entry={hover} /> : null}>
        <Box ref={plotRef} sx={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
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
              cursor: hover?.point.runId !== undefined ? 'pointer' : 'default',
            })}
            onMouseMove={(event: MouseEvent<SVGSVGElement>) => {
              const nearest = findNearest(event)
              if (nearest?.key !== hover?.key) setHover(nearest)
            }}
            onMouseLeave={() => setHover(null)}
            onClick={() => {
              const runId = hover?.point.runId
              if (hover && runId !== undefined) window.open(testRunUrl(hover.series.pipeline, runId), '_blank', 'noopener,noreferrer')
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
              {plot.lines.map(({ entry, points, paths }) => (
                <g key={entry.pipeline.id}>
                  <path d={paths.solid} style={{ fill: 'none', stroke: entry.color, strokeWidth: 1.75, strokeLinejoin: 'round' }} />
                  {paths.dashed ? <path d={paths.dashed} style={{ fill: 'none', stroke: entry.color, strokeWidth: 1.5, strokeDasharray: '4 4' }} /> : null}
                  {points.map((point) => (
                    <SeriesMarker key={point.key} shape={entry.shape} x={point.x} y={point.y} r={3.1} color={entry.color} />
                  ))}
                </g>
              ))}
              {hover ? <circle className="tests-hover-ring" cx={hover.x} cy={hover.y} r={6.5} style={{ stroke: hover.series.color }} /> : null}
            </g>
          </Box>
        </Box>
      </ChartTooltip>
    </Box>
  )
}
