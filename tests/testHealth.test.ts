import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createTestTimeAxis, defaultTestPipelineShortName, fewestTestRunOn, formatPassRate, formatRunDay, formatTestHealthDelta, formatTestUsualRange,
  isTestWeekend, lowestTestRunOn, passRateAtPosition, passRatePosition, testChangeDetail, testChangeTitle, testChanges, testDayIndex, testDayTime,
  testHealthStatusTip, testLinePaths, testMondayIndexes, testPipelineChanges, testPipelineHealth, testPipelineShortName, testRunChanges, testRunUrl,
  testSeriesStyle, testWorkingDaysBetween, type TestHealthEntry,
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

test("a day's tests-ran bar is its run with the fewest tests, which may not be its lowest pass rate", () => {
  const full = { ...at(30, 980), runId: 301 }
  const short = { ...at(30, 540, 540), date: new Date(2026, 9, 30, 14).toISOString(), runId: 302 }
  const health = healthWith(null, [...usualRuns, full, short])
  const today = healthAxis.todayIndex
  assert.equal(fewestTestRunOn(health, today)!.runId, 302)
  assert.equal(fewestTestRunOn(health, today)!.fewer, true)
  assert.equal(lowestTestRunOn(health, today)!.runId, 301)

  const tied = healthWith(null, [...usualRuns, full, { ...full, date: new Date(2026, 9, 30, 14).toISOString(), runId: 303 }])
  assert.equal(fewestTestRunOn(tied, today)!.runId, 301, 'the earliest run on a tie')
  assert.equal(fewestTestRunOn(health, 2), null, 'no run on Saturday')
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

const changesOf = (runs: ReturnType<typeof at>[], healthOptions = options) =>
  testPipelineChanges('web', testPipelineHealth(runs, healthAxis, healthOptions)!, healthAxis, healthOptions)
const summary = (changes: ReturnType<typeof changesOf>) => changes.map((change) => `${change.type}@${change.run.runId}`)
const before = (day: number) => usualRuns.filter((run) => run.runId < day)
const after = (day: number) => usualRuns.filter((run) => run.runId > day)
const usualHealth = testPipelineHealth(usualRuns, healthAxis, options)!

test('a sharp drop is called out once per episode, and its recovery names the lowest run and how long it took', () => {
  const changes = changesOf([...before(22), at(22, 900), at(23, 850), at(26, 993), ...after(26), at(30, 992)])
  assert.deepEqual(summary(changes), ['drop@22', 'recover@26'])
  const [drop, recover] = changes
  assert.equal(drop.id, 'web:drop:22')
  assert.equal(testChangeTitle(drop), 'Sharp drop to 90%')
  assert.equal(testChangeDetail(drop, usualHealth), '100 failed of 1,000 · usually 99–99.4%')
  assert.equal(recover.lowest!.runId, 23)
  assert.equal(recover.days, 4)
  assert.equal(testChangeTitle(recover), 'Recovered after 4 days')
  assert.equal(testChangeDetail(recover, usualHealth), 'back to 99.3% · lowest was 85%')
})

test('failures after five clean runs are called out with the days since the last failure, unless they are a sharp drop', () => {
  const clean = [12, 13, 14, 15, 16].map((day) => at(day, 1000))
  const runs = [...before(12), ...clean, at(19, 990), ...after(19)]
  const [first] = changesOf(runs)
  assert.deepEqual(summary(changesOf(runs)), ['first@19'])
  assert.equal(first.days, 10)
  assert.equal(first.runCount, 5)
  assert.equal(testChangeTitle(first), 'First failures in 10 days')
  assert.equal(testChangeDetail(first, usualHealth), '10 failed of 1,000')

  assert.deepEqual(summary(changesOf([...before(12), ...clean.slice(1), at(19, 990), ...after(19)])), [], 'four clean runs are not a streak')
  assert.deepEqual(summary(changesOf([...before(12), ...clean, at(19, 900), ...after(19)])), ['drop@19', 'recover@20'], 'a sharp drop already says so')

  const sameDay = [6, 7, 8, 9, 10, 11].map((hour, index) => ({ ...at(1, index ? 1000 : 990), runId: 100 + index, date: new Date(2026, 9, 1, hour).toISOString() }))
  const sameDayFirst = changesOf([...sameDay, { ...at(1, 990), runId: 106, date: new Date(2026, 9, 1, 12).toISOString() }, ...after(1)])
    .find((change) => change.type === 'first')!
  assert.equal(testChangeTitle(sameDayFirst), 'First failures after 5 clean runs')
})

test('a streak of runs with fewer tests is one change that counts the streak; below usual is only the latest run', () => {
  const changes = changesOf([...before(26), at(26, 500, 500), at(27, 500, 500), at(28, 500, 500), at(29, 992), at(30, 975)])
  assert.deepEqual(summary(changes), ['fewer@26', 'below@30'])
  const health = usualHealth
  assert.equal(changes[0].runCount, 3)
  assert.equal(testChangeTitle(changes[0]), 'Fewer tests ran')
  assert.equal(testChangeDetail(changes[0], health), '500 of ~1,000 tests · 3 runs in a row')
  assert.equal(testChangeDetail({ ...changes[0], runCount: 1 }, health), '500 of ~1,000 tests')
  assert.equal(testChangeTitle(changes[1]), 'Below usual: 97.5%')

  assert.deepEqual(summary(changesOf([...before(29), at(29, 975), at(30, 993)])), [], 'an earlier run below usual is not a change')
})

test('no recent runs is placed on the working day the pipeline was flagged, past weekends', () => {
  const [stale] = changesOf([...before(23), at(23, 993)])
  assert.equal(stale.type, 'stale')
  assert.equal(stale.id, 'web:stale:23')
  assert.equal(stale.day, 26, 'Fri Oct 23 → Mon 26 → Tue 27')
  assert.equal(stale.t, 26.99)
  assert.equal(testChangeTitle(stale), 'No recent runs')
  assert.equal(testChangeDetail(stale, usualHealth), `last run ${formatRunDay(new Date(2026, 9, 23))}`)
})

test('changes across pipelines are newest first, the most serious first on the same run, and run markers skip no recent runs', () => {
  const entry = (id: string, runs: ReturnType<typeof at>[]) =>
    ({ pipeline: { id }, health: testPipelineHealth(runs, healthAxis, options)! }) as TestHealthEntry
  const changes = testChanges([
    entry('web', [...before(23), at(23, 993)]),
    entry('view', [...usualRuns, at(30, 400, 500)]),
  ], healthAxis, options)
  assert.deepEqual(changes.map((change) => change.id), ['view:drop:30', 'view:fewer:30', 'web:stale:23'])
  assert.deepEqual(testRunChanges(changes, 'view', 30).map((change) => change.type), ['drop', 'fewer'])
  assert.deepEqual(testRunChanges(changes, 'web', 23), [])
})
