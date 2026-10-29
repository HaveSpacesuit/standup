import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { SprintEffortTotals } from '../src/features/standup/utils/sprintForecast.ts'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { calculateSprintForecast } = await server.ssrLoadModule('/src/features/standup/utils/sprintForecast.ts')

const totals = (values: Partial<SprintEffortTotals> = {}): SprintEffortTotals =>
  ({ Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0, ...values })

const args = {
  startDate: '2026-10-19',
  finishDate: '2026-10-30',
  start: totals({ Blocked: 10, New: 50, Active: 20, Review: 10, Done: 10 }),
  current: totals({ Blocked: 5, New: 35, Active: 15, Review: 10, Done: 35 }),
  now: new Date(2026, 9, 26),
}

test('splits effort into exclusive buckets and forecasts them from actual starting values, including nonzero Done', () => {
  const result = calculateSprintForecast(args)
  assert.equal(result.status, 'ready')
  assert.equal(result.addedEffort, 0)
  assert.equal(result.removedEffort, 0)
  assert.deepEqual(result.start, { complete: 10, inProgress: 30, notStarted: 60, total: 100 })
  assert.deepEqual(result.current, { complete: 35, inProgress: 25, notStarted: 40, total: 100 })
  assert.deepEqual(result.projected, { complete: 60, inProgress: 20, notStarted: 20, total: 100 })
})

test('scope churn is reported but not trended, and reconciles start scope to current scope', () => {
  const result = calculateSprintForecast({
    ...args,
    start: totals({ New: 80, Done: 20 }),
    current: totals({ New: 40, Done: 30 }),
    addedEffort: 5,
    removedEffort: 35,
  })
  assert.equal(result.addedEffort, 5)
  assert.equal(result.removedEffort, 35)
  assert.equal(result.start.total + result.addedEffort - result.removedEffort, result.current.total)
  // Done only trends +10, so the rest stays unfinished against today's 70 instead of shrinking with past removals.
  assert.deepEqual(result.projected, { complete: 40, inProgress: 30, notStarted: 0, total: 70 })
})

test('every column adds up to its own total', () => {
  for (const [start, current] of [
    [totals({ Blocked: 10, New: 50, Active: 20, Review: 10, Done: 10 }), totals({ Blocked: 5, New: 35, Active: 15, Review: 10, Done: 35 })],
    [totals({ New: 80, Done: 20 }), totals({ New: 40, Done: 30 })],
    [totals({ New: 10 }), totals({ New: 30 })],
    [totals({ Done: 100 }), totals({ New: 80, Done: 20 })],
    [totals({ Active: 100 }), totals({ Review: 3, Done: 41.5 })],
  ]) {
    const result = calculateSprintForecast({ ...args, start, current })
    assert.equal(result.status, 'ready')
    for (const snapshot of [result.start, result.current, result.projected]) {
      assert.ok(Math.abs(snapshot.complete + snapshot.inProgress + snapshot.notStarted - snapshot.total) < 1e-9)
      assert.ok(snapshot.complete >= 0 && snapshot.inProgress >= 0 && snapshot.notStarted >= 0)
    }
    assert.equal(result.projected.total, result.current.total)
  }
})

test('weekends do not change elapsed or remaining working time', () => {
  const friday = calculateSprintForecast({ ...args, now: new Date(2026, 9, 24) })
  for (const now of [new Date(2026, 9, 24, 12), new Date(2026, 9, 25, 12), new Date(2026, 9, 26)]) {
    assert.deepEqual(calculateSprintForecast({ ...args, now }), friday)
  }
})

test('finish day is included and projections settle to observed effort at sprint end', () => {
  const beforeFinish = calculateSprintForecast({ ...args, now: new Date(2026, 9, 30) })
  assert.ok(beforeFinish.projected.complete > beforeFinish.current.complete)
  for (const now of [new Date(2026, 9, 31), new Date(2026, 10, 5)]) {
    const result = calculateSprintForecast({ ...args, now })
    assert.deepEqual(result.projected, result.current)
  }
})

test('unfinished work floors at zero and Complete caps at today\'s scope', () => {
  const result = calculateSprintForecast({
    ...args,
    start: totals({ New: 100 }),
    current: totals({ New: 10, Done: 90 }),
  })
  assert.deepEqual(result.projected, { complete: 100, inProgress: 0, notStarted: 0, total: 100 })
})

test('a growing backlog is not forecast away: unfinished effort stays within today\'s scope', () => {
  const result = calculateSprintForecast({
    ...args,
    start: totals({ New: 10 }),
    current: totals({ New: 30 }),
  })
  assert.deepEqual(result.projected, { complete: 0, inProgress: 0, notStarted: 30, total: 30 })
})

test('Not started cannot be forecast to exceed the effort still unfinished', () => {
  const result = calculateSprintForecast({
    ...args,
    start: totals({ New: 50, Active: 50 }),
    current: totals({ New: 60, Active: 10, Done: 30 }),
  })
  assert.deepEqual(result.projected, { complete: 60, inProgress: 0, notStarted: 40, total: 100 })
})

test('regression from Done can trend downward without projecting negative completed effort', () => {
  const result = calculateSprintForecast({
    ...args,
    start: totals({ Done: 100 }),
    current: totals({ New: 80, Done: 20 }),
  })
  assert.equal(result.projected.complete, 0)
  assert.equal(result.projected.notStarted + result.projected.inProgress, 100)
})

test('flat and zero-effort snapshots project without inventing progress', () => {
  for (const start of [totals(), args.current]) {
    const result = calculateSprintForecast({ ...args, start, current: start })
    assert.equal(result.status, 'ready')
    assert.deepEqual(result.projected, result.current)
  }
})

test('before-start and less-than-one-working-day snapshots have no forecast', () => {
  for (const now of [new Date(2026, 9, 18), new Date(2026, 9, 19), new Date(2026, 9, 19, 23, 59)]) {
    const result = calculateSprintForecast({ ...args, now })
    assert.equal(result.status, 'unavailable')
    assert.match(result.reason, /not started|Not enough history/)
  }
  assert.equal(calculateSprintForecast({ ...args, now: new Date(2026, 9, 20) }).status, 'ready')
})

test('missing, reversed, and weekend-only sprint dates cannot produce a forecast', () => {
  for (const dates of [
    { startDate: undefined },
    { finishDate: 'not-a-date' },
    { finishDate: '2026-10-18' },
    { startDate: '2026-10-24', finishDate: '2026-10-25' },
  ]) {
    assert.equal(calculateSprintForecast({ ...args, ...dates }).status, 'unavailable')
  }
})

test('nonfinite and negative effort data is explicitly unavailable', () => {
  for (const effort of [NaN, Infinity, -1]) {
    assert.equal(calculateSprintForecast({ ...args, current: totals({ Active: effort }) }).status, 'unavailable')
    assert.equal(calculateSprintForecast({ ...args, removedEffort: effort }).status, 'unavailable')
  }
})
