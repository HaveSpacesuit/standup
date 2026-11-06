import { Fragment, memo, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Box, ButtonBase } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { CHART_TEXT_PRIMARY, CHART_TEXT_SECONDARY, testChartStyles } from './testChartStyles'
import { ATTENTION_TEXT_COLOR, TEST_HEALTH_STATUS_PRESENTATION, testPointClassName } from './testHealthPresentation'
import { useElementSize } from '../hooks/useElementSize'
import { useSvgId } from '../hooks/useSvgId'
import {
  countTestRunsOn, formatAxisDay, formatPassRate, formatRunDay, formatTestCount, isTestWeekend, lowestTestRunOn,
  passRatePosition, pluralizeTests, TEST_CHANGE_TONES, TEST_HEALTH_STATUS_LABELS, testAxisDate, testChangeTitle, testLinePaths,
  testMondayIndexes, testPipelineShortName, type TestChange, type TestHealthEntry, type TestHealthStatus, type TestRunSelection,
  type TestTimeAxis,
} from '../utils/testHealth'
import { testStageLabel } from '../utils/testPipelines'
import type { TestSprintBand } from '../utils/testSprints'

const LABEL_WIDTH = 150
const ROW = { left: 40, right: 54, top: 14, height: 92, pad: 8 }
const ROW_HEIGHT = ROW.top + ROW.height + ROW.pad
const HEAD_HEIGHT = 24
const AXIS_HEIGHT = 22
/** Where ResizeObserver is missing, as in tests, the rows take a typical width. */
const FALLBACK_SIZE = { width: 1110, height: 0 }
const MIN_PLOT_WIDTH = 320
// Headroom above 100%; runs under 25% sit on the bottom edge, since a row is short and its story is near the top.
const Y_TOP = passRatePosition(100) - 0.06
const Y_BOTTOM = passRatePosition(25)
const ROW_TICKS = [100, 98, 90, 50]
const DIMMED_OPACITY = 0.4
const MIN_SPRINT_LABEL_WIDTH = 56
const MIN_TICK_LABEL_GAP = 52
const MIN_STALE_TEXT_WIDTH = 84
const ACCENT_TINT = 'color-mix(in srgb, var(--stratakit-color-bg-accent-base) 8%, transparent)'

const rowY = (position: number) => ROW.top + ((Math.min(Math.max(position, Y_TOP), Y_BOTTOM) - Y_TOP) / (Y_BOTTOM - Y_TOP)) * ROW.height

const LATEST_TONE: Record<TestHealthStatus, string> = {
  usual: 'tests-latest',
  below: 'tests-latest tests-latest-attention',
  fewer: 'tests-latest tests-latest-attention',
  sharp: 'tests-latest tests-latest-critical',
  stale: 'tests-latest tests-latest-stale',
}

type Scale = { width: number; left: number; right: number; dayWidth: number; x: (t: number) => number }

const NO_CHANGES: TestChange[] = []

type TestRowsChartProps = {
  entries: TestHealthEntry[]
  axis: TestTimeAxis
  sprints: TestSprintBand[]
  lookbackDays: number
  focusId: string | null
  onToggleFocus: (id: string) => void
  changes: TestChange[]
  selection: TestRunSelection | null
  onSelectRun: (pipelineId: string, runId: number) => void
  onSelectChange: (change: TestChange) => void
}

/**
 * Small multiples: one row per pipeline on a shared time axis, each with a neutral line and its usual range. Only
 * exceptions get color. Hovering any row shows a crosshair on every row for that day; markers above a row flag its
 * changes, and clicking a day opens its lowest run in run details.
 */
export function TestRowsChart({
  entries, axis, sprints, lookbackDays, focusId, onToggleFocus, changes, selection, onSelectRun, onSelectChange,
}: TestRowsChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const measured = useElementSize(ref, FALLBACK_SIZE)
  const width = Math.max(MIN_PLOT_WIDTH, measured.width - LABEL_WIDTH)
  const [hoverDay, setHoverDay] = useState<number | null>(null)

  const scale = useMemo<Scale>(() => {
    const left = ROW.left
    const right = width - ROW.right
    return { width, left, right, dayWidth: (right - left) / axis.dayCount, x: (t: number) => left + (t / axis.dayCount) * (right - left) }
  }, [axis, width])

  const changesByPipeline = useMemo(() => {
    const byPipeline = new Map<string, TestChange[]>()
    for (const change of changes) {
      const list = byPipeline.get(change.pipelineId)
      if (list) list.push(change)
      else byPipeline.set(change.pipelineId, [change])
    }
    return byPipeline
  }, [changes])

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const svg = (event.target as Element).closest('svg[data-row]')
    let day: number | null = null
    if (svg) {
      const box = svg.getBoundingClientRect()
      const index = Math.floor(((event.clientX - box.left - scale.left) / (scale.right - scale.left)) * axis.dayCount)
      day = index >= 0 && index < axis.dayCount ? index : null
    }
    if (day !== hoverDay) setHoverDay(day)
  }

  return (
    <Box
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHoverDay(null)}
      sx={{ display: 'grid', gridTemplateColumns: `${LABEL_WIDTH}px minmax(0, 1fr)`, flex: '0 0 auto', minWidth: 0 }}
    >
      <Box />
      <RowsHead axis={axis} sprints={sprints} scale={scale} hoverDay={hoverDay} />
      {entries.map((entry) => {
        const dimmed = focusId !== null && focusId !== entry.pipeline.id
        return (
          <Fragment key={entry.pipeline.id}>
            <RowLabel entry={entry} pressed={focusId === entry.pipeline.id} dimmed={dimmed} onClick={() => onToggleFocus(entry.pipeline.id)} />
            <Box sx={{ borderTop: 1, borderColor: 'divider', minWidth: 0 }} style={{ opacity: dimmed ? DIMMED_OPACITY : 1 }}>
              <RowPlot
                entry={entry}
                axis={axis}
                sprints={sprints}
                scale={scale}
                lookbackDays={lookbackDays}
                hoverDay={hoverDay}
                changes={changesByPipeline.get(entry.pipeline.id) ?? NO_CHANGES}
                selection={selection?.pipelineId === entry.pipeline.id ? selection : null}
                onSelectRun={onSelectRun}
                onSelectChange={onSelectChange}
              />
            </Box>
          </Fragment>
        )
      })}
      <Box />
      <RowsAxis axis={axis} scale={scale} />
    </Box>
  )
}

type PillTone = 'plain' | 'attention' | 'critical' | 'muted'

/** A label on the crosshair; it flips left near the right edge and never leaves `min`–`max`. */
function Pill({ text, x, y, min, max, tone = 'plain', center = false }: { text: string; x: number; y: number; min: number; max: number; tone?: PillTone; center?: boolean }) {
  const width = text.length * 6.1 + 14
  let left = center ? x - width / 2 : x + 7
  if (!center && left + width > max) left = x - 7 - width
  left = Math.max(min, Math.min(left, max - width))
  return (
    <g className={`tests-pill tests-pill-${tone}`}>
      <rect x={left} y={y} width={width} height={17} rx={4} />
      <text x={left + width / 2} y={y + 12} textAnchor="middle">{text}</text>
    </g>
  )
}

function SprintLines({ sprints, scale, y1, y2 }: { sprints: TestSprintBand[]; scale: Scale; y1: number; y2: number }) {
  return sprints.filter((sprint) => !sprint.clipped && sprint.start > 0).map((sprint) => (
    <line key={sprint.start} className="tests-sprint-line" x1={scale.x(sprint.start)} x2={scale.x(sprint.start)} y1={y1} y2={y2} />
  ))
}

function RowsHead({ axis, sprints, scale, hoverDay }: { axis: TestTimeAxis; sprints: TestSprintBand[]; scale: Scale; hoverDay: number | null }) {
  return (
    <Box
      component="svg"
      aria-hidden="true"
      data-testid="tests-rows-head"
      width={scale.width}
      height={HEAD_HEIGHT}
      sx={(theme: Theme) => ({ ...testChartStyles(theme), overflow: 'visible' })}
    >
      <SprintLines sprints={sprints} scale={scale} y1={2} y2={HEAD_HEIGHT} />
      {sprints.map((sprint) => {
        const from = scale.x(sprint.start)
        const to = scale.x(sprint.end)
        const label = sprint.current && to - from >= sprint.label.length * 6 ? sprint.label : sprint.name
        return to - from >= MIN_SPRINT_LABEL_WIDTH ? (
          <text
            key={sprint.start}
            className={sprint.current ? 'tests-sprint-label tests-sprint-label-current' : 'tests-sprint-label'}
            x={(from + to) / 2}
            y={16}
            textAnchor="middle"
          >
            {label}
          </text>
        ) : null
      })}
      {hoverDay !== null ? (
        <Pill text={formatRunDay(testAxisDate(axis, hoverDay))} x={scale.x(hoverDay + 0.5)} y={4} min={0} max={scale.width} center />
      ) : null}
    </Box>
  )
}

function RowsAxis({ axis, scale }: { axis: TestTimeAxis; scale: Scale }) {
  const labelEvery = Math.max(1, Math.ceil(MIN_TICK_LABEL_GAP / (7 * scale.dayWidth)))
  return (
    <Box component="svg" aria-hidden="true" width={scale.width} height={AXIS_HEIGHT} sx={(theme: Theme) => testChartStyles(theme)}>
      {testMondayIndexes(axis).map((index, order) => (
        <Fragment key={index}>
          <line className="tests-grid" x1={scale.x(index)} x2={scale.x(index)} y1={0} y2={4} />
          {order % labelEvery === 0 ? (
            <text className="tests-axis" x={scale.x(index)} y={15} textAnchor="middle">{formatAxisDay(testAxisDate(axis, index))}</text>
          ) : null}
        </Fragment>
      ))}
    </Box>
  )
}

function RowLabel({ entry, pressed, dimmed, onClick }: { entry: TestHealthEntry; pressed: boolean; dimmed: boolean; onClick: () => void }) {
  const { pipeline, health } = entry
  const { latest } = health
  const shortName = testPipelineShortName(pipeline)
  const stage = testStageLabel(pipeline.stageName)
  const rate = formatPassRate(latest.rate)
  const stale = health.status === 'stale'
  const sub = stale
    ? `${pluralizeTests(health.idleDays, 'working day')} ago`
    : latest.fewer ? `${formatTestCount(latest.total)} of ~${formatTestCount(health.usualTotal)} tests` : formatRunDay(new Date(latest.date))
  const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const

  return (
    <ButtonBase
      nativeButton
      aria-pressed={pressed}
      aria-label={`${shortName} ${stage}: ${rate}, ${TEST_HEALTH_STATUS_LABELS[health.status]}`}
      data-pipeline={pipeline.id}
      onClick={onClick}
      style={{ opacity: dimmed ? DIMMED_OPACITY : 1, boxShadow: `inset 3px 0 0 ${TEST_HEALTH_STATUS_PRESENTATION[health.status].edge}` }}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        gap: '1px',
        minWidth: 0,
        p: '10px 10px 8px 12px',
        textAlign: 'left',
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: pressed ? ACCENT_TINT : 'transparent',
        color: CHART_TEXT_SECONDARY,
        fontSize: 12,
        transition: 'opacity 120ms ease',
        '&:hover': { bgcolor: pressed ? ACCENT_TINT : `color-mix(in srgb, transparent, ${CHART_TEXT_PRIMARY} 4%)` },
        '&:focus-visible': { outline: '2px solid var(--stratakit-color-border-accent-base)', outlineOffset: -2 },
      }}
    >
      <Box component="span" sx={{ fontWeight: 650, fontSize: 13, color: CHART_TEXT_PRIMARY, ...ellipsis }}>{shortName}</Box>
      <Box component="span" sx={{ fontSize: 11.5, color: TERTIARY_TEXT_COLOR, ...ellipsis }}>{stage}</Box>
      <Box
        component="span"
        sx={{ mt: 0.5, fontSize: 18, fontWeight: 650, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums', color: stale ? TERTIARY_TEXT_COLOR : CHART_TEXT_PRIMARY }}
      >
        {rate}
      </Box>
      <Box component="span" sx={{ fontSize: 11, color: stale || latest.fewer ? ATTENTION_TEXT_COLOR : TERTIARY_TEXT_COLOR, ...ellipsis }}>{sub}</Box>
    </ButtonBase>
  )
}

type RowPlotProps = {
  entry: TestHealthEntry
  axis: TestTimeAxis
  sprints: TestSprintBand[]
  scale: Scale
  lookbackDays: number
  hoverDay: number | null
  changes: TestChange[]
  /** Only when the selected run is in this row. */
  selection: TestRunSelection | null
  onSelectRun: (pipelineId: string, runId: number) => void
  onSelectChange: (change: TestChange) => void
}

function RowPlot({ entry, axis, sprints, scale, lookbackDays, hoverDay, changes, selection, onSelectRun, onSelectChange }: RowPlotProps) {
  const { pipeline, health } = entry
  const hoverRun = hoverDay === null ? null : lowestTestRunOn(health, hoverDay)
  const selectedRun = selection ? health.runs.find((run) => run.runId === selection.runId) ?? null : null

  return (
    <Box
      component="svg"
      role="img"
      aria-label={`${testPipelineShortName(pipeline)} ${testStageLabel(pipeline.stageName)} pass rate, last ${lookbackDays} days`}
      data-row={pipeline.id}
      width={scale.width}
      height={ROW_HEIGHT}
      sx={(theme: Theme) => ({ ...testChartStyles(theme), overflow: 'visible', cursor: hoverRun ? 'pointer' : 'crosshair' })}
      onClick={() => {
        if (hoverRun) onSelectRun(pipeline.id, hoverRun.runId)
      }}
    >
      <RowContent entry={entry} axis={axis} sprints={sprints} scale={scale} />
      {selectedRun && selectedRun.t >= 0 ? (
        <g data-testid="tests-row-selected">
          <line className="tests-sel-line" x1={scale.x(selectedRun.t)} x2={scale.x(selectedRun.t)} y1={ROW.top} y2={ROW.top + ROW.height} />
          <circle className="tests-sel-ring" cx={scale.x(selectedRun.t)} cy={rowY(selectedRun.position)} r={6} />
        </g>
      ) : null}
      <RowMarkers changes={changes} scale={scale} selectedChangeId={selection?.changeId ?? null} onSelectChange={onSelectChange} />
      {hoverDay !== null ? <RowCrosshair entry={entry} axis={axis} scale={scale} day={hoverDay} /> : null}
    </Box>
  )
}

/** A downward triangle above the row for each run with changes, in the most serious change's tone. */
const RowMarkers = memo(function RowMarkers({ changes, scale, selectedChangeId, onSelectChange }: {
  changes: TestChange[]
  scale: Scale
  selectedChangeId: string | null
  onSelectChange: (change: TestChange) => void
}) {
  const groups = new Map<string, TestChange[]>()
  for (const change of changes) {
    if (change.t < 0) continue
    const key = change.type === 'stale' ? change.id : String(change.run.runId)
    const group = groups.get(key)
    if (group) group.push(change)
    else groups.set(key, [change])
  }
  // Oldest first, so newer markers draw on top.
  return [...groups.values()].reverse().map((group) => {
    const [first] = group
    const cx = scale.x(first.t)
    const selected = group.some((change) => change.id === selectedChangeId)
    return (
      <polygon
        key={first.id}
        data-change={first.id}
        className={`tests-marker tests-marker-${TEST_CHANGE_TONES[first.type]}${selected ? ' tests-marker-selected' : ''}`}
        points={`${cx - 5},1 ${cx + 5},1 ${cx},10`}
        onClick={(event) => {
          event.stopPropagation()
          onSelectChange(first)
        }}
      >
        <title>{group.map(testChangeTitle).join(' · ')}</title>
      </polygon>
    )
  })
})

/** The row's static drawing, kept apart so moving the crosshair doesn't redraw it. */
const RowContent = memo(function RowContent({ entry, axis, sprints, scale }: Pick<RowPlotProps, 'entry' | 'axis' | 'sprints' | 'scale'>) {
  const { health } = entry
  const hatchId = useSvgId('tests-row-hatch')
  const { x, left, right, dayWidth } = scale
  const points = health.runs.filter((run) => run.t >= 0).map((run) => ({ run, t: run.t, x: x(run.t), y: rowY(run.position) }))
  const paths = testLinePaths(points)
  const bandTop = rowY(health.usualHighPosition)
  const staleFrom = health.status === 'stale' ? x(Math.max(0, health.latest.day + 1)) : null
  const weekends = Array.from({ length: axis.dayCount }, (_, index) => index).filter((index) => isTestWeekend(axis, index))

  return (
    <>
      {staleFrom !== null ? (
        <defs>
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line className="tests-hatch-mono" x1="0" y1="0" x2="0" y2="6" />
          </pattern>
        </defs>
      ) : null}
      {weekends.map((index) => <rect key={index} className="tests-weekend" x={x(index)} y={0} width={dayWidth} height={ROW_HEIGHT - ROW.pad} />)}
      <SprintLines sprints={sprints} scale={scale} y1={0} y2={ROW_HEIGHT} />
      {ROW_TICKS.map((percent) => {
        const y = rowY(passRatePosition(percent))
        return (
          <Fragment key={percent}>
            <line className="tests-grid" x1={left} x2={right} y1={y} y2={y} />
            <text className="tests-axis" x={left - 5} y={y + 3.5} textAnchor="end" style={{ fontSize: 10 }}>{percent}%</text>
          </Fragment>
        )
      })}
      <rect className="tests-band" x={left} y={bandTop} width={right - left} height={Math.max(2, rowY(health.usualLowPosition) - bandTop)} />
      {staleFrom !== null ? (
        <>
          <rect data-testid="tests-row-stale" x={staleFrom} y={ROW.top} width={Math.max(0, right - staleFrom)} height={ROW.height} fill={`url(#${hatchId})`} />
          {right - staleFrom >= MIN_STALE_TEXT_WIDTH ? (
            <text className="tests-stale-text" textAnchor="middle">
              <tspan x={(staleFrom + right) / 2} y={ROW.top + ROW.height / 2 - 2}>No runs for</tspan>
              <tspan x={(staleFrom + right) / 2} y={ROW.top + ROW.height / 2 + 11}>{pluralizeTests(health.idleDays, 'working day')}</tspan>
            </text>
          ) : null}
        </>
      ) : null}
      <path className="tests-line" d={paths.solid} />
      {paths.dashed ? <path className="tests-line-gap" d={paths.dashed} /> : null}
      {points.map(({ run, x: cx, y: cy }) => (
        <circle key={run.index} className={testPointClassName(run.cls)} cx={cx} cy={cy} r={run.cls !== 'ok' ? 3.4 : run === health.latest ? 2.8 : 1.6} />
      ))}
      <text className={LATEST_TONE[health.status]} x={right + 6} y={rowY(health.latest.position) + 4}>{formatPassRate(health.latest.rate)}</text>
    </>
  )
})

function RowCrosshair({ entry, axis, scale, day }: { entry: TestHealthEntry; axis: TestTimeAxis; scale: Scale; day: number }) {
  const { health } = entry
  const center = scale.x(day + 0.5)
  const lowest = lowestTestRunOn(health, day)
  const count = countTestRunsOn(health, day)
  let text: string
  let tone: PillTone
  if (lowest) {
    text = `${formatPassRate(lowest.rate)}${count > 1 ? ` · lowest of ${count}` : ''}`
    tone = lowest.cls === 'sharp' ? 'critical' : lowest.cls === 'ok' ? 'plain' : 'attention'
  } else {
    text = day === axis.todayIndex && health.status !== 'stale' ? 'not run yet' : 'no run'
    tone = 'muted'
  }
  return (
    <g data-testid="tests-row-crosshair">
      <line className="tests-crosshair" x1={center} x2={center} y1={ROW.top} y2={ROW.top + ROW.height} />
      {lowest ? <circle className="tests-crosshair-point" cx={scale.x(lowest.t)} cy={rowY(lowest.position)} r={5} /> : null}
      <Pill text={text} x={center} y={ROW.top + 2} min={scale.left} max={scale.right} tone={tone} />
    </g>
  )
}
