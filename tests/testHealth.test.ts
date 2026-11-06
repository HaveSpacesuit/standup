import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createTestTimeAxis, defaultTestPipelineShortName, formatPassRate, formatTestHealthDelta, formatTestUsualRange, isTestWeekend,
  passRateAtPosition, passRatePosition, testDayIndex, testDayTime, testHealthStatusTip, testLinePaths, testMondayIndexes,
  testPipelineHealth, testPipelineShortName, testRunUrl, testSeriesStyle, testWorkingDaysBetween,
} from '../src/features/standup/utils/testHealth.ts'

test('pass rates keep one decimal, drop it for whole numbers, and never round a failing run up to 100%', () => {
  assert.equal(formatPassRate(100), '100%')
  assert.equal(formatPassRate(95), '95%')
  assert.equal(formatPassRate(90.86), '90.9%')
  assert.equal(formatPassRate(99.96), '99.9%')
})

test('the short name is the parenthetical in the pipeline name, or the whole name', () => {
  assert.equal(testPipelineShortName({ name: 'ProjectWise Web (PWW)' }), 'PWW')
  assert.equal(testPipelineShortName({ name: 'Nightly E2E' }), 'Nightly E2E')
  assert.equal(defaultTestPipelineShortName('WebView ( WV )'), 'WV')
})

test('a saved short name overrides the default unless it is blank', () => {
  assert.equal(testPipelineShortName({ name: 'ProjectWise Web (PWW)', shortName: ' Web ' }), 'Web')
  assert.equal(testPipelineShortName({ name: 'ProjectWise Web (PWW)', shortName: '  ' }), 'PWW')
})

test('the pass rate scale maps back to pass rates', () => {
  for (const percent of [0, 50, 98, 99.4, 100]) assert.ok(Math.abs(passRateAtPosition(passRatePosition(percent)) - percent) < 1e-9)
})

test('runs link to the build Tests tab or the release summary', () => {
  const where = { orgName: 'example org', projectName: 'Example' }
  assert.equal(
    testRunUrl({ ...where, kind: 'build' }, 13),
    'https://dev.azure.com/example%20org/Example/_build/results?buildId=13&view=ms.vss-test-web.build-test-results-tab',
  )
  assert.equal(
    testRunUrl({ ...where, kind: 'release' }, 21),
    'https://dev.azure.com/example%20org/Example/_releaseProgress?releaseId=21&_a=release-pipeline-progress',
  )
})

test('series styles avoid status colors and stay distinct for 16 pipelines', () => {
  const styles = Array.from({ length: 16 }, (_, index) => testSeriesStyle(index))
  assert.deepEqual(styles[0], { color: 'var(--stratakit-color-bg-accent-base)', shape: 'circle' })
  assert.equal(new Set(styles.map(({ color, shape }) => `${color}|${shape}`)).size, 16)
  for (const { color } of styles) {
    assert.doesNotMatch(color, /success|positive|critical|attention|warning|danger/)
  }
})

test('the time axis counts local calendar days from the lookback start through today', () => {
  // Thu Oct 1 through Wed Oct 14, 2026.
  const axis = createTestTimeAxis({ start: new Date(2026, 9, 1, 10).getTime(), end: new Date(2026, 9, 14, 15).getTime() })
  assert.equal(axis.dayCount, 14)
  assert.equal(axis.todayIndex, 13)
  assert.equal(testDayIndex(axis, new Date(2026, 9, 5, 23, 30).getTime()), 4)
  assert.equal(testDayTime(axis, new Date(2026, 9, 5, 6).getTime()), 4.25)
  assert.deepEqual(testMondayIndexes(axis), [4, 11])
  assert.deepEqual([2, 3, 4].map((index) => isTestWeekend(axis, index)), [true, true, false])
  assert.equal(testWorkingDaysBetween(axis, 1, 4), 1, 'Friday to Monday is one working day')
  assert.equal(testWorkingDaysBetween(axis, 4, 4), 0)
})

test('the time axis ignores daylight saving changes', () => {
  const axis = createTestTimeAxis({ start: new Date(2026, 2, 6).getTime(), end: new Date(2026, 2, 10, 12).getTime() })
  assert.equal(axis.dayCount, 5)
  assert.equal(testDayIndex(axis, new Date(2026, 2, 9, 0, 30).getTime()), 3)
  const fall = createTestTimeAxis({ start: new Date(2026, 9, 30).getTime(), end: new Date(2026, 10, 3, 23).getTime() })
  assert.equal(fall.dayCount, 5)
})

test('runs four or more days apart are joined by a dashed segment instead of a solid one', () => {
  const paths = testLinePaths([
    { t: 0, x: 0, y: 10 },
    { t: 1, x: 10, y: 12 },
    { t: 5, x: 50, y: 11 },
    { t: 6.5, x: 65, y: 10 },
  ])
  assert.equal(paths.solid, 'M0,10L10,12M50,11L65,10')
  assert.equal(paths.dashed, 'M10,12L50,11')
  assert.deepEqual(testLinePaths([{ t: 0, x: 1, y: 2 }]), { solid: 'M1,2', dashed: '' })
})

// Thu Oct 1 through Fri Oct 30, 2026: 21 weekday runs from 99.0% to 99.4% of 1,000 tests.
const healthAxis = createTestTimeAxis({ start: new Date(2026, 9, 1, 9).getTime(), end: new Date(2026, 9, 30, 9).getTime() })
const at = (day: number, passed: number, total = 1000) => ({ date: new Date(2026, 9, day, 6).toISOString(), passed, total, runId: day })
const usualRuns = [1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29]
  .map((day, index) => at(day, [990, 992, 994, 991, 993][index % 5]))
const options = { staleDays: 2, fewerPercent: 80 }
const healthWith = (latest: ReturnType<typeof at> | null, runs = usualRuns, healthOptions = options) =>
  testPipelineHealth(latest ? [...runs, latest] : runs, healthAxis, healthOptions)!

test('a pipeline with no runs has no health', () => {
  assert.equal(testPipelineHealth([], healthAxis, options), null)
})

test("the usual range is the middle 80% of a pipeline's runs, and the latest run is compared with the median of the earlier ones", () => {
  const health = healthWith(at(30, 993))
  assert.ok(Math.abs(health.usualLow - 99) < 1e-9)
  assert.ok(Math.abs(health.usualHigh - 99.4) < 1e-9)
  assert.equal(formatTestUsualRange(health), '99–99.4%')
  assert.equal(health.usualHighPosition < health.usualLowPosition, true, 'positions grow with failures')
  assert.equal(health.medianRate, 99.2)
  assert.equal(health.usualTotal, 1000)
  assert.equal(health.idleDays, 0)
  assert.equal(health.status, 'usual')
  assert.equal(health.latest.runId, 30)
  assert.deepEqual(health.runs.map((run) => run.index), health.runs.map((_, index) => index), 'runs are sorted oldest first')
  assert.equal(formatTestHealthDelta(health), '+0.1 vs median 99.2%')
  assert.match(testHealthStatusTip(health, options, 60), /within or above this pipeline's usual range, 99–99\.4% \(the middle 80% of its runs in the last 60 days\)/)
})

test('a run far past the median is a sharp drop, and sharp drops do not widen the usual range', () => {
  const health = healthWith(at(30, 900))
  assert.equal(health.status, 'sharp')
  assert.equal(health.latest.cls, 'sharp')
  assert.ok(Math.abs(health.usualLow - 99) < 1e-9)
  assert.equal(formatTestHealthDelta(health), '−9.2 vs median 99.2%')
  assert.match(testHealthStatusTip(health, options, 60), /\(90%\) failed far more tests than usual/)
})

test('a run clearly under the usual range is below usual; one just under it is noise', () => {
  assert.equal(healthWith(at(30, 975)).status, 'below')
  assert.match(testHealthStatusTip(healthWith(at(30, 975)), options, 60), /\(97\.5%\) is below this pipeline's usual range of 99–99\.4%/)
  assert.equal(healthWith(at(30, 988)).status, 'usual')
})

test('a run with fewer than the threshold share of the usual test count is fewer tests, even at 100%', () => {
  const health = healthWith(at(30, 500, 500))
  assert.equal(health.status, 'fewer')
  assert.equal(health.latest.fewer, true)
  assert.match(testHealthStatusTip(health, options, 60), /executed 500 tests; this pipeline usually runs ~1,000\. Runs with fewer than 80% of the usual count/)
  assert.equal(healthWith(at(30, 500, 500), usualRuns, { ...options, fewerPercent: 50 }).status, 'usual')
})

test('usual test counts round to tens from 200 up', () => {
  assert.equal(healthWith(null, usualRuns.map((run) => ({ ...run, total: 1183, passed: 1180 }))).usualTotal, 1180)
  assert.equal(healthWith(null, usualRuns.map((run) => ({ ...run, total: 153, passed: 150 }))).usualTotal, 153)
})

test('no run for the stale threshold in working days is no recent runs, which outranks the last result', () => {
  const runs = usualRuns.filter((run) => Date.parse(run.date) < new Date(2026, 9, 28).getTime())
  const health = healthWith(at(27, 900), runs)
  assert.equal(health.idleDays, 3, 'Wed, Thu, and Fri')
  assert.equal(health.status, 'stale')
  assert.equal(formatTestHealthDelta(health), 'last result')
  assert.match(testHealthStatusTip(health, options, 60), /No results for 3 working days\. Pipelines are flagged after 2 working days/)
  assert.equal(healthWith(at(27, 900), runs, { ...options, staleDays: 4 }).status, 'sharp')
})

test('a single run is its own median', () => {
  const health = healthWith(null, [at(30, 990)])
  assert.equal(health.status, 'usual')
  assert.equal(health.medianRate, null)
  assert.equal(formatTestHealthDelta(health), 'only run')
})
