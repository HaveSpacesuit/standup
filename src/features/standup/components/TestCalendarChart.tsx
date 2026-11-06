import { Fragment, memo, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Box } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { ChartTooltip } from './testChartParts'
import { CHART_TEXT_SECONDARY, testChartStyles } from './testChartStyles'
import { TEST_ROW_DIMMED_OPACITY, TEST_ROW_LABEL_WIDTH } from './testHealthPresentation'
import { TestRowLabel } from './TestRowLabel'
import { TipLines } from './TipLines'
import { useElementSize } from '../hooks/useElementSize'
import { useSvgId } from '../hooks/useSvgId'
import {
  countTestRunsOn, formatAxisDay, formatPassRate, formatRunDay, formatTestCount, isTestWeekend, pluralizeTests, testAxisDate,
  testChangeTitle, testMondayIndexes, testPipelineShortName, testRunChanges, worstTestRunOn,
  type TestChange, type TestHealthEntry, type TestPipelineHealth, type TestRun, type TestRunClass, type TestRunSelection, type TestTimeAxis,
} from '../utils/testHealth'
import { testStageLabel } from '../utils/testPipelines'
import type { TestSprintBand } from '../utils/testSprints'

const ROW_MIN_HEIGHT = 84
const CELL_HEIGHT = 40
const CELL_GAP = 2
const INSET = 6
const WEEKEND_WEIGHT = 0.4
const HEAD_HEIGHT = 36
/** The top of the date row in the head, which sprint lines stop above where they would cross a date. */
const DATE_ROW_TOP = 20
/** Where ResizeObserver is missing, as in tests, the calendar takes a typical width. */
const FALLBACK_SIZE = { width: 1110, height: 0 }
const MIN_PLOT_WIDTH = 320
const MIN_SPRINT_LABEL_WIDTH = 56
const MIN_TICK_LABEL_GAP = 52
const DATE_LABEL_WIDTH = 36

type CellKind = TestRunClass | 'miss' | 'today'
type Cell = { day: number; kind: CellKind; run: TestRun | null }

const CELL_LABELS: Record<TestRunClass, string> = { ok: 'Usual', below: 'Below usual', fewer: 'Fewer tests ran', sharp: 'Sharp drop' }
const KEY: ReadonlyArray<readonly [CellKind, string]> = [
  ['ok', 'Usual'], ['below', 'Below usual'], ['sharp', 'Sharp drop'], ['fewer', 'Fewer tests ran'], ['miss', 'No run'], ['today', 'Not run yet today'],
]

/** Day columns weighted so weekends take less room: `edges[day]` is a day's left edge, and `edges[dayCount]` the right edge. */
type CalendarScale = { width: number; unit: number; edges: number[] }

function calendarScale(axis: TestTimeAxis, width: number): CalendarScale {
  const weights = Array.from({ length: axis.dayCount }, (_, day) => (isTestWeekend(axis, day) ? WEEKEND_WEIGHT : 1))
  const unit = (width - INSET * 2) / weights.reduce((sum, weight) => sum + weight, 0)
  const edges = [INSET]
  weights.forEach((weight, day) => edges.push(edges[day] + weight * unit))
  return { width, unit, edges }
}

const fixed = (value: number) => Math.round(value * 10) / 10

/**
 * One cell per day, in the class of the day's worst run. A day without a run gets a dashed outline, or an accent one for
 * today while the pipeline still reports; weekends get one only for pipelines that have run on a weekend. The first
 * day gets none: the lookback window opens partway through it, so a missing run there means nothing.
 */
function calendarCells(health: TestPipelineHealth, axis: TestTimeAxis): Cell[] {
  const runsOnWeekends = health.runs.some((run) => run.day >= 0 && isTestWeekend(axis, run.day))
  const cells: Cell[] = []
  for (let day = 0; day < axis.dayCount; day++) {
    const run = worstTestRunOn(health, day)
    if (run) cells.push({ day, kind: run.cls, run })
    else if (day === axis.todayIndex && health.status !== 'stale') cells.push({ day, kind: 'today', run: null })
    else if (day > 0 && (runsOnWeekends || !isTestWeekend(axis, day))) cells.push({ day, kind: 'miss', run: null })
  }
  return cells
}

/** "18 usual days, 2 days below usual, 1 sharp drop, 3 days without a run" for screen readers. */
function calendarSummary(cells: readonly Cell[]): string {
  const count = (kind: CellKind) => cells.filter((cell) => cell.kind === kind).length
  const parts = [
    [count('ok'), pluralizeTests(count('ok'), 'usual day')],
    [count('below'), `${pluralizeTests(count('below'), 'day')} below usual`],
    [count('sharp'), pluralizeTests(count('sharp'), 'sharp drop')],
    [count('fewer'), `${pluralizeTests(count('fewer'), 'day')} with fewer tests`],
    [count('miss'), `${pluralizeTests(count('miss'), 'day')} without a run`],
  ] as const
  return parts.filter(([total]) => total > 0).map(([, text]) => text).join(', ')
}

type CalendarHover = { pipelineId: string; day: number; x: number; y: number }

type TestCalendarChartProps = {
  entries: TestHealthEntry[]
  axis: TestTimeAxis
  sprints: TestSprintBand[]
  lookbackDays: number
  focusId: string | null
  onToggleFocus: (id: string) => void
  changes: TestChange[]
  selection: TestRunSelection | null
  onSelectRun: (pipelineId: string, runId: number) => void
}

/**
 * A heatmap of pipeline health: one row per pipeline and one cell per day, colored by that day's worst run, so a
 * streak of bad days or missing runs stands out at a glance. Hover a cell for the day; click it to open its worst run.
 */
export function TestCalendarChart({ entries, axis, sprints, lookbackDays, focusId, onToggleFocus, changes, selection, onSelectRun }: TestCalendarChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const measured = useElementSize(ref, FALLBACK_SIZE)
  const width = Math.max(MIN_PLOT_WIDTH, measured.width - TEST_ROW_LABEL_WIDTH)
  const scale = useMemo(() => calendarScale(axis, width), [axis, width])
  const [hover, setHover] = useState<CalendarHover | null>(null)
  const hoverEntry = hover ? entries.find((entry) => entry.pipeline.id === hover.pipelineId) ?? null : null

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const cell = (event.target as Element).closest('rect[data-day]')
    const pipelineId = cell?.closest('svg[data-calendar]')?.getAttribute('data-calendar')
    if (!cell || !pipelineId) {
      if (hover) setHover(null)
      return
    }
    const day = Number(cell.getAttribute('data-day'))
    if (hover?.pipelineId === pipelineId && hover.day === day) return
    const box = ref.current?.getBoundingClientRect()
    const rect = cell.getBoundingClientRect()
    setHover({ pipelineId, day, x: rect.left + rect.width / 2 - (box?.left ?? 0), y: rect.top - (box?.top ?? 0) })
  }

  return (
    <ChartTooltip
      anchor={hoverEntry ? hover : null}
      containerRef={ref}
      content={hover && hoverEntry ? <CellTip entry={hoverEntry} axis={axis} day={hover.day} changes={changes} /> : null}
    >
      <Box ref={ref} data-testid="tests-calendar" onMouseMove={onMouseMove} onMouseLeave={() => setHover(null)} sx={{ flex: '0 0 auto', minWidth: 0 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: `${TEST_ROW_LABEL_WIDTH}px minmax(0, 1fr)` }}>
          <Box />
          <CalendarHead axis={axis} sprints={sprints} scale={scale} />
          {entries.map((entry) => {
            const { pipeline, health } = entry
            const dimmed = focusId !== null && focusId !== pipeline.id
            const selectedRun = selection?.pipelineId === pipeline.id ? health.runs.find((run) => run.runId === selection.runId) : undefined
            return (
              <Fragment key={pipeline.id}>
                <TestRowLabel entry={entry} pressed={focusId === pipeline.id} dimmed={dimmed} onClick={() => onToggleFocus(pipeline.id)} />
                <Box sx={{ position: 'relative', borderTop: 1, borderColor: 'divider', minWidth: 0, minHeight: ROW_MIN_HEIGHT }} style={{ opacity: dimmed ? TEST_ROW_DIMMED_OPACITY : 1 }}>
                  <CalendarRow
                    entry={entry}
                    axis={axis}
                    sprints={sprints}
                    scale={scale}
                    lookbackDays={lookbackDays}
                    selectedDay={selectedRun?.day ?? null}
                    onSelectRun={onSelectRun}
                  />
                </Box>
              </Fragment>
            )
          })}
        </Box>
        <CalendarKey />
      </Box>
    </ChartTooltip>
  )
}

function CellTip({ entry, axis, day, changes }: { entry: TestHealthEntry; axis: TestTimeAxis; day: number; changes: TestChange[] }) {
  const { pipeline, health } = entry
  const title = `${formatRunDay(testAxisDate(axis, day))} · ${testPipelineShortName(pipeline)} ${testStageLabel(pipeline.stageName)}`
  const run = worstTestRunOn(health, day)
  if (!run) {
    return <TipLines lines={[title, day === axis.todayIndex && health.status !== 'stale' ? 'Not run yet today' : 'No run']} boldFirst />
  }
  const count = countTestRunsOn(health, day)
  const usual = run.fewer ? ` (usually ~${formatTestCount(health.usualTotal)})` : ''
  const runChanges = testRunChanges(changes, pipeline.id, run.runId)
  return (
    <Box component="span" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
      <TipLines
        lines={[
          title,
          `${CELL_LABELS[run.cls]}${count > 1 ? ` · ${run.cls === 'ok' ? 'lowest' : 'worst'} of ${count} runs` : ''}`,
          `${formatPassRate(run.rate)} passed · ${formatTestCount(run.failed)} failed of ${formatTestCount(run.total)}${usual}`,
        ]}
        boldFirst
      />
      {runChanges.length ? (
        <Box component="span" sx={{ display: 'block', mt: 0.5, fontWeight: 600 }}>{runChanges.map(testChangeTitle).join(' · ')}</Box>
      ) : null}
      <Box component="span" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>Click for run details</Box>
    </Box>
  )
}

function SprintLines({ sprints, scale, y1, y2, clearOf = [] }: { sprints: TestSprintBand[]; scale: CalendarScale; y1: number; y2: number | string; clearOf?: number[] }) {
  return sprints.filter((sprint) => !sprint.clipped && sprint.start > 0).map((sprint) => {
    const x = fixed(scale.edges[sprint.start] - CELL_GAP / 2)
    // A sprint starting midweek stops above the date row rather than strike through that week's date.
    const crossesLabel = clearOf.some((left) => x >= left && x <= left + DATE_LABEL_WIDTH)
    return <line key={sprint.start} className="tests-sprint-line" x1={x} x2={x} y1={y1} y2={crossesLabel ? DATE_ROW_TOP : y2} />
  })
}

function CalendarHead({ axis, sprints, scale }: { axis: TestTimeAxis; sprints: TestSprintBand[]; scale: CalendarScale }) {
  const { edges } = scale
  const weekWidth = scale.unit * (5 + 2 * WEEKEND_WEIGHT)
  const labelEvery = Math.max(1, Math.ceil(MIN_TICK_LABEL_GAP / weekWidth))
  const dates = testMondayIndexes(axis)
    .filter((index, order) => order % labelEvery === 0 && scale.width - edges[index] >= DATE_LABEL_WIDTH)
    .map((index) => ({ index, x: fixed(edges[index] + 1) }))
  return (
    <Box
      component="svg"
      aria-hidden="true"
      data-testid="tests-calendar-head"
      width={scale.width}
      height={HEAD_HEIGHT}
      sx={(theme: Theme) => testChartStyles(theme)}
    >
      <SprintLines sprints={sprints} scale={scale} y1={2} y2={HEAD_HEIGHT} clearOf={dates.map((date) => date.x)} />
      {sprints.map((sprint) => {
        const from = edges[sprint.start]
        const to = edges[sprint.end]
        const label = sprint.current && to - from >= sprint.label.length * 6 ? sprint.label : sprint.name
        return to - from >= MIN_SPRINT_LABEL_WIDTH ? (
          <text
            key={sprint.start}
            className={sprint.current ? 'tests-sprint-label tests-sprint-label-current' : 'tests-sprint-label'}
            x={fixed((from + to) / 2)}
            y={13}
            textAnchor="middle"
          >
            {label}
          </text>
        ) : null
      })}
      {dates.map(({ index, x }) => (
        <text key={index} className="tests-axis" x={x} y={32} style={{ fontSize: 10.5 }}>
          {formatAxisDay(testAxisDate(axis, index))}
        </text>
      ))}
    </Box>
  )
}

type CalendarRowProps = {
  entry: TestHealthEntry
  axis: TestTimeAxis
  sprints: TestSprintBand[]
  scale: CalendarScale
  lookbackDays: number
  /** The day of the selected run, only when it's in this row. */
  selectedDay: number | null
  onSelectRun: (pipelineId: string, runId: number) => void
}

const CalendarRow = memo(function CalendarRow({ entry, axis, sprints, scale, lookbackDays, selectedDay, onSelectRun }: CalendarRowProps) {
  const { pipeline, health } = entry
  const hatchId = useSvgId('tests-cal-hatch')
  const cells = useMemo(() => calendarCells(health, axis), [health, axis])
  // The selected cell draws last, so its outline sits over its neighbors.
  const ordered = selectedDay === null ? cells : [...cells.filter((cell) => cell.day !== selectedDay), ...cells.filter((cell) => cell.day === selectedDay)]
  // The row is as tall as its label, so cells center on it rather than on a fixed height.
  const center = { y: '50%', transform: `translate(0 ${-CELL_HEIGHT / 2})` }

  return (
    <Box
      component="svg"
      role="img"
      aria-label={`${testPipelineShortName(pipeline)} ${testStageLabel(pipeline.stageName)}, one cell per day for the last ${lookbackDays} days: ${calendarSummary(cells)}`}
      data-calendar={pipeline.id}
      width={scale.width}
      sx={(theme: Theme) => ({ ...testChartStyles(theme), position: 'absolute', top: 0, left: 0, height: '100%' })}
    >
      {cells.some((cell) => cell.kind === 'fewer') ? <defs><HatchPattern id={hatchId} /></defs> : null}
      <SprintLines sprints={sprints} scale={scale} y1={0} y2="100%" />
      {ordered.map(({ day, kind, run }) => {
        const x = fixed(scale.edges[day] + CELL_GAP / 2)
        const width = fixed(Math.max(1, scale.edges[day + 1] - scale.edges[day] - CELL_GAP))
        if (!run) {
          return <rect key={day} data-day={day} className={`tests-cal-${kind}`} x={x} {...center} width={width} height={CELL_HEIGHT} rx={2} />
        }
        return (
          <rect
            key={day}
            data-day={day}
            className={`tests-cal-cell tests-cal-${kind}${day === selectedDay ? ' tests-cal-selected' : ''}`}
            fill={kind === 'fewer' ? `url(#${hatchId})` : undefined}
            x={x}
            {...center}
            width={width}
            height={CELL_HEIGHT}
            rx={2}
            onClick={() => onSelectRun(pipeline.id, run.runId)}
          />
        )
      })}
    </Box>
  )
})

function HatchPattern({ id }: { id: string }) {
  return (
    <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect className="tests-cal-hatch-bg" width="5" height="5" />
      <line className="tests-cal-hatch" x1="0" y1="0" x2="0" y2="5" />
    </pattern>
  )
}

function CalendarKey() {
  const hatchId = useSvgId('tests-cal-key-hatch')
  return (
    <Box
      data-testid="tests-calendar-key"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', pt: 1, pl: `${TEST_ROW_LABEL_WIDTH}px`, fontSize: 11.5, color: CHART_TEXT_SECONDARY }}
    >
      {KEY.map(([kind, label]) => (
        <Box key={kind} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <Box component="svg" viewBox="0 0 14 14" width={14} height={14} aria-hidden="true" sx={(theme: Theme) => testChartStyles(theme)}>
            {kind === 'fewer' ? <defs><HatchPattern id={hatchId} /></defs> : null}
            <rect className={`tests-cal-${kind}`} fill={kind === 'fewer' ? `url(#${hatchId})` : undefined} x={1.5} y={1.5} width={11} height={11} rx={2} />
          </Box>
          {label}
        </Box>
      ))}
    </Box>
  )
}
