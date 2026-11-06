import type { TestPipeline } from './testPipelines'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Consecutive runs this many days apart or more are joined by a dashed line, so outages read as gaps. */
export const TEST_GAP_DAYS = 4

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

/** The pipeline's short label: the parenthetical in its name, as in "ProjectWise Web (PWW)", or the whole name. */
export function testPipelineShortName(pipeline: Pick<TestPipeline, 'name'>): string {
  const match = /\(([^)]+)\)/.exec(pipeline.name)
  return match?.[1].trim() || pipeline.name
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
