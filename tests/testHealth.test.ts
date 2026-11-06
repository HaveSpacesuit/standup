import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createTestTimeAxis, formatPassRate, isTestWeekend, testDayIndex, testDayTime, testLinePaths, testMondayIndexes,
  testPipelineShortName, testRunUrl, testSeriesStyle, testWorkingDaysBetween,
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
