import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_TEST_DAILY_OPTIONS, filterTestPointsByPassRate, groupTestPointsByDay,
  loadTestDailyOptions, saveTestDailyOptions, testPointPassRate,
} from '../src/features/standup/utils/testPipelines.ts'

const point = (day: number, hour: number, passed: number, total: number, runId: number) => ({
  date: new Date(2026, 9, day, hour).toISOString(), passed, total, runId,
})
const points = [point(15, 8, 1, 10, 1), point(15, 16, 90, 100, 2), point(16, 8, 2, 4, 3)]

test('disabled daily grouping preserves every original point', () => {
  assert.equal(groupTestPointsByDay(points, DEFAULT_TEST_DAILY_OPTIONS), points)
})

test('lowest/highest select actual runs per local day with links and sorted dates', () => {
  const reversed = [...points].reverse()
  assert.deepEqual(groupTestPointsByDay(reversed, { enabled: true, mode: 'lowest' }), [points[0], points[2]])
  assert.deepEqual(groupTestPointsByDay(reversed, { enabled: true, mode: 'highest' }), [points[1], points[2]])
  assert.deepEqual(reversed, [...points].reverse())
})

test('average weights run percentages equally, not test counts; single runs retain links', () => {
  const result = groupTestPointsByDay(points, { enabled: true, mode: 'average' })
  assert.equal(result.length, 2)
  assert.equal(testPointPassRate(result[0]), 50)
  assert.equal(result[0].runId, undefined)
  assert.ok('runCount' in result[0] && result[0].runCount === 2)
  assert.equal(result[1], points[2])
})

test('local midnight separates days, including month/year and DST boundaries', () => {
  for (const [year, month, day] of [[2026, 11, 31], [2026, 2, 7], [2026, 9, 31]]) {
    const runs = [23, 25].map((hour, index) => ({
      date: new Date(year, month, day, hour).toISOString(), passed: 1, total: 2, runId: index + 1,
    }))
    assert.equal(groupTestPointsByDay(runs, { enabled: true, mode: 'average' }).length, 2)
  }
})

test('percentage filtering happens before averaging and singleton results keep links', () => {
  const filtered = filterTestPointsByPassRate(points, { enabled: true, threshold: 20 })
  assert.deepEqual(groupTestPointsByDay(filtered, { enabled: true, mode: 'average' }), [points[1], points[2]])
  assert.deepEqual(groupTestPointsByDay([], { enabled: true, mode: 'average' }), [])
})

test('ties consistently retain earliest run then smallest ID', () => {
  const early = point(15, 8, 1, 2, 1)
  const runs = [point(15, 12, 50, 100, 3), { ...early, runId: 2 }, early]
  for (const mode of ['lowest', 'highest'] as const) {
    assert.deepEqual(groupTestPointsByDay(runs, { enabled: true, mode }), [early])
  }
})

test('daily settings default disabled, persist all modes, and reject invalid stored values', () => {
  const storage = new Map<string, string>()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  })
  try {
    assert.deepEqual(loadTestDailyOptions(), DEFAULT_TEST_DAILY_OPTIONS)
    for (const mode of ['lowest', 'average', 'highest'] as const) {
      saveTestDailyOptions({ enabled: true, mode })
      assert.deepEqual(loadTestDailyOptions(), { enabled: true, mode })
    }
    for (const value of ['null', '{}', '{"enabled":true,"mode":"invalid"}', 'not json']) {
      storage.set('standup:test-daily-options', value)
      assert.throws(() => loadTestDailyOptions())
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
