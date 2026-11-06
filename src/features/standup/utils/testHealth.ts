import type { TestPoint } from '../../../ado/testPipelinesApi'
import type { TestHealthOptions, TestPipeline } from './testPipelines'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Consecutive runs this many days apart or more are joined by a dashed line, so outages read as gaps. */
export const TEST_GAP_DAYS = 4

export const PASS_RATE_TICKS = [0, 50, 75, 90, 95, 98, 100]

/** Log-scales the failure rate so differences near 100% are visible; larger means more failures. */
export const passRatePosition = (percent: number) => Math.log10(1 + 100 - percent)
export const passRateAtPosition = (position: number) => 101 - 10 ** position

/** "99.4%", "100%"; never rounds a failing run up to 100%. */
export function formatPassRate(rate: number): string {
  let rounded = Math.round(rate * 10) / 10
  if (rounded >= 100 && rate < 100) {
    rounded = 99.9
  }
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`
}

export function formatTestCount(count: number): string {
  return Math.round(count).toLocaleString('en-US')
}

export function pluralizeTests(count: number, word: string, plural = `${word}s`): string {
  return `${formatTestCount(count)} ${count === 1 ? word : plural}`
}

const RUN_DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const RUN_TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const AXIS_DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

/** "Thu, Nov 5" */
export const formatRunDay = (date: Date) => RUN_DAY.format(date)
/** "6:10 AM" */
export const formatRunTime = (date: Date) => RUN_TIME.format(date)
/** "Nov 5" */
export const formatAxisDay = (date: Date) => AXIS_DAY.format(date)

/** The parenthetical in a pipeline name, as in "ProjectWise Web (PWW)", or the whole name. */
export function defaultTestPipelineShortName(name: string): string {
  const match = /\(([^)]+)\)/.exec(name)
  return match?.[1].trim() || name
}

/** The pipeline's short label: its saved short name, or the default from its name. */
export function testPipelineShortName(pipeline: Pick<TestPipeline, 'name' | 'shortName'>): string {
  return pipeline.shortName?.trim() || defaultTestPipelineShortName(pipeline.name)
}

/** The run's build Tests tab, or its release summary. */
export function testRunUrl(pipeline: Pick<TestPipeline, 'orgName' | 'projectName' | 'kind'>, runId: number): string {
  const base = `https://dev.azure.com/${encodeURIComponent(pipeline.orgName)}/${encodeURIComponent(pipeline.projectName)}`
  return pipeline.kind === 'build'
    ? `${base}/_build/results?buildId=${runId}&view=ms.vss-test-web.build-test-results-tab`
    : `${base}/_releaseProgress?releaseId=${runId}&_a=release-pipeline-progress`
}

export type TestSeriesShape = 'circle' | 'square' | 'triangle' | 'diamond'

const SERIES_COLORS = [
  'var(--stratakit-color-bg-accent-base)',
  'var(--stratakit-color-bg-info-base)',
  // StrataKit has no categorical palette, so the third series is a deliberate violet; the page defines it per scheme.
  'var(--tests-series-violet, oklch(55% 0.16 305))',
  'var(--stratakit-color-bg-mono-base)',
] as const
const SERIES_SHAPES: readonly TestSeriesShape[] = ['circle', 'square', 'triangle', 'diamond']

/** A color and a marker shape per pipeline; the shape shifts each round of colors, so 16 pipelines stay distinct. */
export function testSeriesStyle(index: number): { color: string; shape: TestSeriesShape } {
  return {
    color: SERIES_COLORS[index % SERIES_COLORS.length],
    shape: SERIES_SHAPES[(index + Math.floor(index / SERIES_COLORS.length)) % SERIES_SHAPES.length],
  }
}

/** Calendar days on a chart: day 0 starts at local midnight of the lookback start, and the last day is today. */
export type TestTimeAxis = {
  /** Local midnight of day 0, in ms. */
  start: number
  dayCount: number
  todayIndex: number
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function createTestTimeAxis(range: { start: number; end: number }): TestTimeAxis {
  const start = startOfLocalDay(range.start)
  const todayIndex = Math.max(0, Math.round((startOfLocalDay(range.end) - start) / MS_PER_DAY))
  return { start, dayCount: todayIndex + 1, todayIndex }
}

/** The day's index; rounding absorbs the 23- and 25-hour days around daylight saving changes. */
export function testDayIndex(axis: TestTimeAxis, ms: number): number {
  return Math.round((startOfLocalDay(ms) - axis.start) / MS_PER_DAY)
}

/** A run's position on the axis in days, such as 12.25 for 6 AM on day 12. */
export function testDayTime(axis: TestTimeAxis, ms: number): number {
  const date = new Date(ms)
  return testDayIndex(axis, ms) + (date.getHours() * 60 + date.getMinutes()) / 1440
}

export function testAxisDate(axis: TestTimeAxis, index: number): Date {
  const start = new Date(axis.start)
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
}

export function isTestWeekend(axis: TestTimeAxis, index: number): boolean {
  const day = testAxisDate(axis, index).getDay()
  return day === 0 || day === 6
}

/** Day indexes that fall on a Monday, for week ticks. */
export function testMondayIndexes(axis: TestTimeAxis): number[] {
  return Array.from({ length: axis.dayCount }, (_, index) => index)
    .filter((index) => testAxisDate(axis, index).getDay() === 1)
}

/** Weekdays after `fromIndex` up to and including `toIndex`. */
export function testWorkingDaysBetween(axis: TestTimeAxis, fromIndex: number, toIndex: number): number {
  let count = 0
  for (let index = fromIndex + 1; index <= toIndex; index++) {
    if (!isTestWeekend(axis, index)) count++
  }
  return count
}

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * SVG path data through the points in order: solid between nearby runs, and a separate dashed path across
 * gaps of `TEST_GAP_DAYS` or more.
 */
export function testLinePaths(points: ReadonlyArray<{ t: number; x: number; y: number }>): { solid: string; dashed: string } {
  let solid = ''
  let dashed = ''
  points.forEach((point, index) => {
    const at = `${round1(point.x)},${round1(point.y)}`
    const previous = points[index - 1]
    if (!previous) {
      solid += `M${at}`
    } else if (point.t - previous.t >= TEST_GAP_DAYS) {
      dashed += `M${round1(previous.x)},${round1(previous.y)}L${at}`
      solid += `M${at}`
    } else {
      solid += `L${at}`
    }
  })
  return { solid, dashed }
}

/** A run with about 4× (10^0.6) the failure rate of the pipeline's median run is a sharp drop. */
export const TEST_SHARP_DROP = 0.6
/** "Below usual" must clear the usual range by about 1.26× its failure rate, so noise at the edge isn't flagged. */
export const TEST_BELOW_MARGIN = 0.1
/** Sparklines show the last three weeks. */
export const TEST_SPARKLINE_DAYS = 21

/** How one run compares with its pipeline's usual results; a sharp drop outranks fewer tests, which outranks below usual. */
export type TestRunClass = 'ok' | 'below' | 'fewer' | 'sharp'
export type TestHealthStatus = 'usual' | 'below' | 'fewer' | 'sharp' | 'stale'

export type TestRun = TestPoint & {
  /** The run's order among its pipeline's runs, oldest first. */
  index: number
  failed: number
  rate: number
  position: number
  day: number
  t: number
  sharp: boolean
  fewer: boolean
  below: boolean
  cls: TestRunClass
}

export type TestPipelineHealth = {
  runs: TestRun[]
  latest: TestRun
  medianPosition: number
  /** The usual range: the middle 80% of the runs that weren't sharp drops, as pass rates and as scale positions. */
  usualLow: number
  usualHigh: number
  usualLowPosition: number
  usualHighPosition: number
  medianTotal: number
  /** The median test count, rounded to tens from 200 up, for "~1,180 tests". */
  usualTotal: number
  /** The median pass rate of the runs before the latest; null when there is only one run. */
  medianRate: number | null
  /** Working days since the day of the latest run. */
  idleDays: number
  status: TestHealthStatus
}

export type TestHealthEntry = { pipeline: TestPipeline; color: string; shape: TestSeriesShape; health: TestPipelineHealth }

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  const at = (sorted.length - 1) * q
  const low = Math.floor(at)
  const high = Math.ceil(at)
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low)
}

/**
 * Compares every run with the pipeline's own normal, on the failure scale: a sharp drop is far past the median run,
 * below usual is past the usual range by a margin, and fewer tests means under `fewerPercent` of the median count.
 * Returns null when there are no runs.
 */
export function testPipelineHealth(points: readonly TestPoint[], axis: TestTimeAxis, options: TestHealthOptions): TestPipelineHealth | null {
  if (points.length === 0) {
    return null
  }
  const measured = [...points]
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date) || left.runId - right.runId)
    .map((point, index) => {
      const ms = Date.parse(point.date)
      const rate = (point.passed / point.total) * 100
      return { ...point, index, failed: point.total - point.passed, rate, position: passRatePosition(rate), day: testDayIndex(axis, ms), t: testDayTime(axis, ms) }
    })
  const medianPosition = median(measured.map((run) => run.position))
  const isSharp = (position: number) => position - medianPosition >= TEST_SHARP_DROP
  // At least half the runs sit at or under the median, so some runs are always calm.
  const calm = measured.map((run) => run.position).filter((position) => !isSharp(position))
  const usualHighPosition = quantile(calm, 0.1)
  const usualLowPosition = quantile(calm, 0.9)
  const medianTotal = median(measured.map((run) => run.total))
  const runs = measured.map((run): TestRun => {
    const sharp = isSharp(run.position)
    const fewer = run.total < (options.fewerPercent / 100) * medianTotal
    const below = !sharp && run.position - usualLowPosition >= TEST_BELOW_MARGIN
    return { ...run, sharp, fewer, below, cls: sharp ? 'sharp' : fewer ? 'fewer' : below ? 'below' : 'ok' }
  })
  const latest = runs[runs.length - 1]
  const idleDays = testWorkingDaysBetween(axis, latest.day, axis.todayIndex)
  return {
    runs,
    latest,
    medianPosition,
    usualLow: passRateAtPosition(usualLowPosition),
    usualHigh: passRateAtPosition(usualHighPosition),
    usualLowPosition,
    usualHighPosition,
    medianTotal,
    usualTotal: medianTotal >= 200 ? Math.round(medianTotal / 10) * 10 : Math.round(medianTotal),
    medianRate: runs.length > 1 ? median(runs.slice(0, -1).map((run) => run.rate)) : null,
    idleDays,
    status: idleDays >= options.staleDays ? 'stale' : latest.cls === 'ok' ? 'usual' : latest.cls,
  }
}

export const TEST_HEALTH_STATUS_LABELS: Record<TestHealthStatus, string> = {
  usual: 'Usual',
  below: 'Below usual',
  fewer: 'Fewer tests',
  sharp: 'Sharp drop',
  stale: 'No recent runs',
}

/** The day's run with the lowest pass rate (the earliest on a tie), or null when the pipeline didn't run that day. */
export function lowestTestRunOn(health: Pick<TestPipelineHealth, 'runs'>, day: number): TestRun | null {
  let lowest: TestRun | null = null
  for (const run of health.runs) {
    if (run.day === day && (!lowest || run.rate < lowest.rate)) lowest = run
  }
  return lowest
}

export function countTestRunsOn(health: Pick<TestPipelineHealth, 'runs'>, day: number): number {
  return health.runs.reduce((count, run) => count + (run.day === day ? 1 : 0), 0)
}

/** "98.6–99.4%" */
export function formatTestUsualRange(health: Pick<TestPipelineHealth, 'usualLow' | 'usualHigh'>): string {
  const low = formatPassRate(health.usualLow)
  const high = formatPassRate(health.usualHigh)
  return low === high ? low : `${low.slice(0, -1)}–${high}`
}

/** "+0.4 vs median 99.1%"; "last result" when the pipeline is stale, since the number is old news. */
export function formatTestHealthDelta(health: TestPipelineHealth): string {
  if (health.status === 'stale') return 'last result'
  if (health.medianRate === null) return 'only run'
  const difference = Math.round((health.latest.rate - health.medianRate) * 10) / 10
  return `${difference < 0 ? '−' : '+'}${Math.abs(difference).toFixed(1)} vs median ${formatPassRate(health.medianRate)}`
}

/** Why a pipeline has its status, naming the rule and where to tune it. */
export function testHealthStatusTip(health: TestPipelineHealth, options: TestHealthOptions, lookbackDays: number): string {
  const { latest } = health
  switch (health.status) {
    case 'usual':
      return `Latest run is within or above this pipeline's usual range, ${formatTestUsualRange(health)} (the middle 80% of its runs in the last ${lookbackDays} days).`
    case 'below':
      return `Latest run (${formatPassRate(latest.rate)}) is below this pipeline's usual range of ${formatTestUsualRange(health)} by more than the noise margin.`
    case 'fewer':
      return `Latest run executed ${formatTestCount(latest.total)} tests; this pipeline usually runs ~${formatTestCount(health.usualTotal)}. Runs with fewer than ${options.fewerPercent}% of the usual count are flagged (Test options).`
    case 'sharp':
      return `Latest run (${formatPassRate(latest.rate)}) failed far more tests than usual, about 4× this pipeline's median failure rate or worse. Its usual range is ${formatTestUsualRange(health)}.`
    case 'stale':
      return `No results for ${pluralizeTests(health.idleDays, 'working day')}. Pipelines are flagged after ${pluralizeTests(options.staleDays, 'working day')} without a run (Test options).`
  }
}
