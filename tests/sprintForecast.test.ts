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

test('forecasts cumulative groups from actual starting values, including nonzero Done', () => {
  const result = calculateSprintForecast(args)
  assert.equal(result.status, 'ready')
  assert.equal(result.totalEffort, 100)
  assert.equal(result.startTotalEffort, 100)
  assert.equal(result.addedEffort, 0)
  assert.equal(result.removedEffort, 0)
  assert.deepEqual(result.rows, [
    { label: 'Remaining', start: 90, current: 65, projected: 40 },
    { label: 'Not started', nested: true, start: 60, current: 40, projected: 20 },
    { label: 'Complete', start: 10, current: 35, projected: 60 },
    { label: 'Added', start: 0, current: 0, projected: 0 },
    { label: 'Removed', start: 0, current: 0, projected: 0 },
  ])
})

test('removed effort is reported as its own row and carried forward without trending', () => {
  const result = calculateSprintForecast({
    ...args,
    start: totals({ New: 80, Done: 20 }),
    current: totals({ New: 40, Done: 30 }),
    addedEffort: 5,
    removedEffort: 15,
  })
  assert.equal(result.startTotalEffort, 100)
  assert.equal(result.totalEffort, 70)
  assert.equal(result.addedEffort, 5)
  assert.deepEqual(result.rows[3], { label: 'Added', start: 0, current: 5, projected: 5 })
  assert.deepEqual(result.rows[4], { label: 'Removed', start: 0, current: 15, projected: 15 })
  // Remaining + Complete + Removed − Added reconciles to the committed start scope.
  assert.equal(result.rows[0].start + result.rows[2].start + result.rows[4].start, result.startTotalEffort)
  assert.equal(result.rows[0].current + result.rows[2].current + result.rows[4].current, result.totalEffort + result.removedEffort)
})

test('weekends do not change elapsed or remaining working time', () => {
  const friday = calculateSprintForecast({ ...args, now: new Date(2026, 9, 24) })
  for (const now of [new Date(2026, 9, 24, 12), new Date(2026, 9, 25, 12), new Date(2026, 9, 26)]) {
    assert.deepEqual(calculateSprintForecast({ ...args, now }), friday)
  }
})

test('finish day is included and projections settle to observed effort at sprint end', () => {
  const beforeFinish = calculateSprintForecast({ ...args, now: new Date(2026, 9, 30) })
  assert.ok(beforeFinish.rows[2].projected > beforeFinish.rows[2].current)
  for (const now of [new Date(2026, 9, 31), new Date(2026, 10, 5)]) {
    const result = calculateSprintForecast({ ...args, now })
    for (const row of result.rows) assert.equal(row.projected, row.current)
  }
})

test('negative remaining-work projections floor at zero and Complete caps at current effort', () => {
  const result = calculateSprintForecast({
    ...args,
    start: totals({ New: 100 }),
    current: totals({ New: 10, Done: 90 }),
  })
  assert.deepEqual(result.rows.map((row: { projected: number }) => row.projected), [0, 0, 100, 0, 0])
})

test('scope growth is not hidden by capping unfinished effort or forcing a downward slope', () => {
  const result = calculateSprintForecast({
    ...args,
    start: totals({ New: 10 }),
    current: totals({ New: 30 }),
  })
  assert.deepEqual(result.rows.map((row: { projected: number }) => row.projected), [50, 50, 0, 0, 0])
})

test('regression from Done can trend downward without projecting negative completed effort', () => {
  const result = calculateSprintForecast({
    ...args,
    start: totals({ Done: 100 }),
    current: totals({ New: 80, Done: 20 }),
  })
  assert.equal(result.rows[2].projected, 0)
})

test('flat and zero-effort snapshots project without inventing progress', () => {
  for (const start of [totals(), args.current]) {
    const result = calculateSprintForecast({ ...args, start, current: start })
    assert.equal(result.status, 'ready')
    for (const row of result.rows) assert.equal(row.projected, row.current)
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
