import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { ReadySprintForecast } from '../src/features/standup/utils/sprintForecast.ts'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { describeForecastColumns, roundToSum } = await server.ssrLoadModule('/src/features/standup/utils/sprintForecastView.ts')

const snapshot = (complete: number, inProgress: number, notStarted: number) =>
  ({ complete, inProgress, notStarted, total: complete + inProgress + notStarted })

const forecast = (overrides: Partial<ReadySprintForecast> = {}): ReadySprintForecast => ({
  status: 'ready',
  start: snapshot(20, 224, 520),
  current: snapshot(560, 116, 8),
  projected: snapshot(656.5, 20.25, 7.25),
  addedEffort: 176,
  removedEffort: 256,
  ...overrides,
})

test('roundToSum hands spare units to the largest fractions so parts add up to the target', () => {
  assert.deepEqual(roundToSum([33.34, 33.33, 33.33], 100), [34, 33, 33])
  assert.deepEqual(roundToSum([10, 20, 70], 100), [10, 20, 70])
  assert.deepEqual(roundToSum([0.5, 0.5], 1), [1, 0])
  assert.deepEqual(roundToSum([0, 0, 0], 0), [0, 0, 0])
})

test('percentages in every column add up to exactly 100', () => {
  for (const columns of [
    describeForecastColumns(forecast()),
    describeForecastColumns(forecast({ start: snapshot(1, 1, 1), current: snapshot(1, 1, 1), projected: snapshot(1, 1, 1) })),
    describeForecastColumns(forecast({ current: snapshot(0.3, 0.3, 0.4), projected: snapshot(7, 11, 13) })),
  ]) {
    for (const column of columns) {
      const percents = Object.values(column.segments).map((segment: { percent: number }) => segment.percent)
      assert.equal(percents.reduce((sum: number, percent: number) => sum + percent, 0), 100, column.key)
    }
  }
})

test('describes start, now and projected end against each column\'s own total', () => {
  const [start, current, projected] = describeForecastColumns(forecast())
  assert.deepEqual([start.key, current.key, projected.key], ['start', 'current', 'projected'])
  assert.equal(start.total, 764)
  assert.equal(start.segments.complete.percent, 3)
  assert.equal(start.segments.inProgress.percent, 29)
  assert.equal(start.segments.notStarted.percent, 68)
  // 560 of today's 684, not of the 764 committed at start.
  assert.equal(current.total, 684)
  assert.equal(current.segments.complete.percent, 82)
})

test('projected effort is shown in whole numbers that add up to the total; actuals are untouched', () => {
  const [, current, projected] = describeForecastColumns(forecast({ current: snapshot(560.5, 116, 7.5) }))
  assert.equal(current.segments.complete.effort, 560.5)
  const shown = Object.values(projected.segments).map((segment: { effort: number }) => segment.effort)
  assert.ok(shown.every((effort: number) => Number.isInteger(effort)))
  assert.equal(shown.reduce((sum: number, effort: number) => sum + effort, 0), Math.round(projected.total))
})

test('an empty column has no shares to show', () => {
  const empty = snapshot(0, 0, 0)
  const columns = describeForecastColumns(forecast({ start: empty, current: empty, projected: empty }))
  for (const column of columns) {
    assert.equal(column.total, 0)
    for (const segment of Object.values(column.segments) as { percent: number; share: number }[]) {
      assert.equal(segment.percent, 0)
      assert.equal(segment.share, 0)
    }
  }
})
