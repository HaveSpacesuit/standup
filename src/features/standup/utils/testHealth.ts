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

/** The day's run that ran the fewest tests (the earliest on a tie), so one full run can't hide a short one. */
export function fewestTestRunOn(health: Pick<TestPipelineHealth, 'runs'>, day: number): TestRun | null {
  let fewest: TestRun | null = null
  for (const run of health.runs) {
    if (run.day === day && (!fewest || run.total < fewest.total)) fewest = run
  }
  return fewest
}

const RUN_CLASS_RANK: Record<TestRunClass, number> = { ok: 0, below: 1, fewer: 2, sharp: 3 }

/**
 * The day's most serious run: a sharp drop, then fewer tests, then below usual, with the lowest pass rate (the earliest)
 * on a tie. When every run is usual, that's the lowest.
 */
export function worstTestRunOn(health: Pick<TestPipelineHealth, 'runs'>, day: number): TestRun | null {
  let worst: TestRun | null = null
  for (const run of health.runs) {
    if (run.day !== day) continue
    if (!worst || RUN_CLASS_RANK[run.cls] > RUN_CLASS_RANK[worst.cls] || (run.cls === worst.cls && run.rate < worst.rate)) worst = run
  }
  return worst
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

export type TestChangeType = 'drop' | 'recover' | 'first' | 'fewer' | 'below' | 'stale'
export type TestChangeTone = 'critical' | 'positive' | 'attention' | 'neutral'

export const TEST_CHANGE_TONES: Record<TestChangeType, TestChangeTone> = {
  drop: 'critical',
  recover: 'positive',
  first: 'attention',
  fewer: 'attention',
  below: 'attention',
  stale: 'neutral',
}

/** Failures after at least this many clean runs in a row are called out. */
export const TEST_CLEAN_STREAK_RUNS = 5

/** A detected change in a pipeline's results, worth a look at standup. */
export type TestChange = {
  /** Unique across pipelines and stable across refreshes, such as "web:drop:20412". */
  id: string
  type: TestChangeType
  pipelineId: string
  /** The run the change is about; for no recent runs, the last run. */
  run: TestRun
  /** The day it happened; for no recent runs, the day the pipeline was flagged. */
  day: number
  /** Its position on the time axis, for ordering and markers. */
  t: number
  /** A sharp-drop episode's lowest run, for a recovery. */
  lowest?: TestRun
  /** Calendar days since the drop (recovery) or the last failure (first failures). */
  days?: number
  /** Clean runs before first failures, or runs in a row with fewer tests. */
  runCount?: number
}

/**
 * Walks a pipeline's runs, oldest first, for the moments that matter: a sharp drop starts (once per episode) and
 * recovers, failures return after a clean streak, a streak of runs with fewer tests starts, the latest run is below
 * usual, and the pipeline stops reporting.
 */
export function testPipelineChanges(pipelineId: string, health: TestPipelineHealth, axis: TestTimeAxis, options: TestHealthOptions): TestChange[] {
  const changes: TestChange[] = []
  const add = (type: TestChangeType, run: TestRun, extra: Partial<TestChange> = {}) => {
    const change: TestChange = { id: `${pipelineId}:${type}:${run.runId}`, type, pipelineId, run, day: run.day, t: run.t, ...extra }
    changes.push(change)
    return change
  }
  let episode: { start: TestRun; lowest: TestRun } | null = null
  let clean = 0
  let cleanStart: TestRun | null = null
  let lastFailure: TestRun | null = null
  let fewerStreak: TestChange | null = null
  for (const run of health.runs) {
    if (run.sharp) {
      if (!episode) {
        episode = { start: run, lowest: run }
        add('drop', run)
      } else if (run.rate < episode.lowest.rate) {
        episode.lowest = run
      }
    } else if (episode) {
      add('recover', run, { lowest: episode.lowest, days: run.day - episode.start.day })
      episode = null
    }
    if (run.failed > 0) {
      // A sharp drop already says failures are back.
      if (clean >= TEST_CLEAN_STREAK_RUNS && cleanStart && !run.sharp) {
        add('first', run, { days: run.day - (lastFailure ?? cleanStart).day, runCount: clean })
      }
      clean = 0
      cleanStart = null
      lastFailure = run
    } else {
      if (clean === 0) cleanStart = run
      clean++
    }
    if (!run.fewer) {
      fewerStreak = null
    } else if (fewerStreak) {
      fewerStreak.runCount = (fewerStreak.runCount ?? 1) + 1
    } else {
      fewerStreak = add('fewer', run, { runCount: 1 })
    }
  }
  if (health.latest.cls === 'below') add('below', health.latest)
  if (health.status === 'stale') {
    let day = health.latest.day
    for (let working = 0; working < options.staleDays && day < axis.todayIndex;) {
      day++
      if (!isTestWeekend(axis, day)) working++
    }
    changes.push({ id: `${pipelineId}:stale:${health.latest.runId}`, type: 'stale', pipelineId, run: health.latest, day, t: day + 0.99 })
  }
  return changes
}

/** Every pipeline's changes, newest first; on the same run, the most serious first. */
export function testChanges(entries: readonly TestHealthEntry[], axis: TestTimeAxis, options: TestHealthOptions): TestChange[] {
  return entries
    .flatMap(({ pipeline, health }) => testPipelineChanges(pipeline.id, health, axis, options))
    .sort((left, right) => right.t - left.t || CHANGE_ORDER[left.type] - CHANGE_ORDER[right.type] || left.id.localeCompare(right.id))
}

const CHANGE_ORDER: Record<TestChangeType, number> = { drop: 0, recover: 1, first: 2, below: 3, fewer: 4, stale: 5 }

/** The changes a run is marked with on the charts, most serious first; no recent runs is about the days after it, so it doesn't count. */
export function testRunChanges(changes: readonly TestChange[], pipelineId: string, runId: number): TestChange[] {
  return changes.filter((change) => change.pipelineId === pipelineId && change.run.runId === runId && change.type !== 'stale')
}

/** The run open in run details, and the change it was opened from, if any. */
export type TestRunSelection = { pipelineId: string; runId: number; changeId: string | null }

export function testChangeTitle(change: TestChange): string {
  const { run } = change
  switch (change.type) {
    case 'drop':
      return `Sharp drop to ${formatPassRate(run.rate)}`
    case 'recover':
      return change.days ? `Recovered after ${pluralizeTests(change.days, 'day')}` : 'Recovered the same day'
    case 'first':
      return change.days
        ? `First failures in ${pluralizeTests(change.days, 'day')}`
        : `First failures after ${pluralizeTests(change.runCount ?? TEST_CLEAN_STREAK_RUNS, 'clean run')}`
    case 'fewer':
      return 'Fewer tests ran'
    case 'below':
      return `Below usual: ${formatPassRate(run.rate)}`
    case 'stale':
      return 'No recent runs'
  }
}

export function testChangeDetail(change: TestChange, health: Pick<TestPipelineHealth, 'usualLow' | 'usualHigh' | 'usualTotal'>): string {
  const { run } = change
  switch (change.type) {
    case 'drop':
      return `${formatTestCount(run.failed)} failed of ${formatTestCount(run.total)} · usually ${formatTestUsualRange(health)}`
    case 'recover':
      return `back to ${formatPassRate(run.rate)} · lowest was ${formatPassRate((change.lowest ?? run).rate)}`
    case 'first':
      return `${formatTestCount(run.failed)} failed of ${formatTestCount(run.total)}`
    case 'fewer': {
      const streak = (change.runCount ?? 1) > 1 ? ` · ${formatTestCount(change.runCount!)} runs in a row` : ''
      return `${formatTestCount(run.total)} of ~${formatTestCount(health.usualTotal)} tests${streak}`
    }
    case 'below':
      return `${formatTestCount(run.failed)} failed · usually ${formatTestUsualRange(health)}`
    case 'stale':
      return `last run ${formatRunDay(new Date(run.date))}`
  }
}
