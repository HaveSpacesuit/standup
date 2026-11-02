import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const {
  countWorkingDays,
  formatSprintDateRange,
  getSprintProgress,
} = await server.ssrLoadModule('/src/features/standup/utils/sprintDates.ts')

// 2026-10-19 is a Monday; the sprint runs two working weeks through Friday 2026-10-30.
const START = '2026-10-19'
const FINISH = '2026-10-30'
const day = (date: number, hours = 0) => new Date(2026, 9, date, hours)
const long = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const short = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

test('formats a sprint range in long or short form and falls back to whichever end is known', () => {
  assert.equal(formatSprintDateRange(START, FINISH), `${long.format(day(19))} – ${long.format(day(30))}`)
  assert.equal(formatSprintDateRange(START, FINISH, { short: true }), `${short.format(day(19))} – ${short.format(day(30))}`)
  assert.equal(formatSprintDateRange(START, undefined), `Starts ${long.format(day(19))}`)
  assert.equal(formatSprintDateRange(undefined, FINISH, { short: true }), `Ends ${short.format(day(30))}`)
  assert.equal(formatSprintDateRange(undefined, undefined), 'Dates unavailable')
  assert.equal(formatSprintDateRange('not a date', ''), 'Dates unavailable')
})

test('counts weekdays inclusively and never goes negative', () => {
  assert.equal(countWorkingDays(day(19), day(30)), 10)
  assert.equal(countWorkingDays(day(24), day(25)), 0)
  assert.equal(countWorkingDays(day(30, 18), day(30)), 1)
  assert.equal(countWorkingDays(day(30), day(19)), 0)
})

test('sprint progress reports the working day, length, and days left while the sprint is active', () => {
  assert.deepEqual(getSprintProgress(START, FINISH, day(19)), { status: 'active', day: 1, totalDays: 10, daysLeft: 10 })
  assert.deepEqual(getSprintProgress(START, FINISH, day(26, 15)), { status: 'active', day: 6, totalDays: 10, daysLeft: 5 })
  assert.deepEqual(getSprintProgress(START, FINISH, day(30, 23)), { status: 'active', day: 10, totalDays: 10, daysLeft: 1 })
  // A weekend inside the sprint holds at Friday's day count.
  assert.deepEqual(getSprintProgress(START, FINISH, day(24)), { status: 'active', day: 5, totalDays: 10, daysLeft: 5 })
})

test('sprint progress distinguishes upcoming, ended, and unknown sprints', () => {
  assert.deepEqual(getSprintProgress(START, FINISH, day(18)), { status: 'upcoming', startsOn: day(19) })
  assert.deepEqual(getSprintProgress(START, FINISH, day(31)), { status: 'ended' })
  assert.deepEqual(getSprintProgress(undefined, FINISH, day(26)), { status: 'unavailable' })
  assert.deepEqual(getSprintProgress(FINISH, START, day(26)), { status: 'unavailable' })
})
