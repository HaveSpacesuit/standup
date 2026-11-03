import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(() => server.close())

const {
  buildSprintJourney,
  getJourneyCaption,
  getJourneyGhost,
  getJourneyTrail,
  hasMovedBack,
  isBackwardMove,
  journeyStatusAt,
} = await server.ssrLoadModule('/src/features/standup/utils/sprintJourney.ts')
const { getSprintLensRows, NO_SPRINT_ROW_KEY } = await server.ssrLoadModule('/src/features/standup/utils/sprintLens.ts')
const { formatSprintDate, formatSprintDateRange } = await server.ssrLoadModule('/src/features/standup/utils/sprintDates.ts')

type Journey = import('../src/features/standup/utils/sprintJourney.ts').SprintJourney

// Monday 5 October 2026, 9am local time.
const sprintStart = new Date(2026, 9, 5, 9).getTime()
const day = (offset: number) => sprintStart + offset * 24 * 60 * 60 * 1000
const short = (offset: number) => formatSprintDate(new Date(day(offset)))

function journey(steps: Array<[string, number]>, addedAt: number | null = null, firstStepSince = steps[0][1]): Journey {
  return { steps: steps.map(([status, at]) => ({ status, at })), addedAt, sprintStart, firstStepSince } as Journey
}

test('a committed card replays its moves from the sprint start and remembers how long it held its first column', () => {
  const result = buildSprintJourney([
    { timestamp: day(-4), status: 'Active' },
    { timestamp: day(1), status: 'Review' },
    { timestamp: day(3), status: 'Active' },
  ], { sprintStart, now: day(5), committed: true, currentStatus: 'Active' })

  assert.equal(result.addedAt, null)
  assert.equal(result.firstStepSince, day(-4))
  assert.deepEqual(result.steps, [
    { status: 'Active', at: sprintStart },
    { status: 'Review', at: day(1) },
    { status: 'Active', at: day(3) },
  ])
  assert.ok(hasMovedBack(result))
})

test('a card moved into the sprint later starts its journey when it arrived', () => {
  const result = buildSprintJourney([
    { timestamp: day(-10), status: 'New', iterationPath: 'Project\\Sprint 0' },
    { timestamp: day(2), status: 'New', iterationPath: 'Project\\Sprint 1' },
    { timestamp: day(3), status: 'Active', iterationPath: 'Project\\Sprint 1' },
  ], { sprintStart, now: day(4), iterationPath: 'Project\\Sprint 1', currentStatus: 'Active' })

  assert.equal(result.addedAt, day(2))
  assert.deepEqual(result.steps.map((step: { status: string }) => step.status), ['New', 'Active'])
})

test('a card known to be outside the sprint at its start counts as added at the start', () => {
  const result = buildSprintJourney(
    [{ timestamp: day(-10), status: 'New' }],
    { sprintStart, now: day(4), committed: false, currentStatus: 'New' },
  )

  assert.equal(result.addedAt, sprintStart)
})

test('a current status the history has not caught up with yet becomes the last step', () => {
  const result = buildSprintJourney(
    [{ timestamp: day(-1), status: 'New' }],
    { sprintStart, now: day(2), currentStatus: 'Active' },
  )

  assert.deepEqual(result.steps.at(-1), { status: 'Active', at: day(2) })
})

test('Blocked sits outside forward progress, so moving to or from it is never backward', () => {
  assert.equal(isBackwardMove('Review', 'Active'), true)
  assert.equal(isBackwardMove('Active', 'Review'), false)
  assert.equal(isBackwardMove('Review', 'Blocked'), false)
  assert.equal(isBackwardMove('Blocked', 'New'), false)
})

test('journey captions say where the card stands in its sprint', () => {
  const caption = (value: Journey, now: number, options?: { skipBack?: boolean }) => {
    const { text, tone } = getJourneyCaption(value, now, options)
    return `${tone}: ${text}`
  }

  assert.equal(caption(journey([['Done', sprintStart]], null, day(-3)), day(4)), 'positive: Done at start')
  assert.equal(caption(journey([['Active', sprintStart], ['Done', day(3)]]), day(4)), `positive: Done ${short(3)}`)
  assert.equal(caption(journey([['Review', sprintStart], ['Active', day(2)]]), day(4)), 'attention: Back from Review · 2d')
  assert.equal(caption(journey([['Review', sprintStart], ['Active', day(4)]]), day(4)), 'attention: Back from Review · today')
  assert.equal(caption(journey([['Review', sprintStart], ['Active', day(2)]]), day(4), { skipBack: true }), 'neutral: 2d in Active')
  assert.equal(caption(journey([['New', day(4)]], day(4)), day(4)), 'info: Added today')
  assert.equal(caption(journey([['Active', sprintStart]]), sprintStart), 'neutral: Active at start')
  assert.equal(caption(journey([['New', sprintStart], ['Active', day(4)]]), day(4)), 'info: Into Active today')
  assert.equal(caption(journey([['New', sprintStart], ['Active', day(1)]]), day(6)), 'attention: 5d in Active')
  assert.equal(caption(journey([['New', sprintStart]], null, day(-1)), day(6)), 'neutral: 7d in New')
})

test('journey trails size each column by working days and lead in for cards added later', () => {
  // Wed 7 Oct to Mon 12 Oct: the weekend doesn't stretch the Active stretch.
  const committed = getJourneyTrail(journey([['New', sprintStart], ['Active', day(2)]]), day(7))
  assert.equal(committed.lead, 0)
  assert.deepEqual(committed.segments, [{ status: 'New', weight: 2 }, { status: 'Active', weight: 3 }])
  assert.equal(committed.label, `Journey: New from ${short(0)}, then Active from ${short(2)}`)

  const added = getJourneyTrail(journey([['New', day(3)]], day(3)), day(3))
  assert.equal(added.lead, 3)
  assert.deepEqual(added.segments, [{ status: 'New', weight: 0.4 }])
  assert.equal(added.label, `Journey: added ${short(3)}, New from ${short(3)}`)
})

test('the hover ghost marks where the card started, or else the farthest column it reached', () => {
  assert.deepEqual(
    getJourneyGhost(journey([['New', sprintStart], ['Active', day(2)]])),
    { status: 'New', label: `Started here · ${short(0)}` },
  )
  assert.deepEqual(
    getJourneyGhost(journey([['New', day(1)], ['Active', day(2)]], day(1))),
    { status: 'New', label: `Added here · ${short(1)}` },
  )
  assert.deepEqual(
    getJourneyGhost(journey([['Active', sprintStart], ['Review', day(1)], ['Done', day(2)], ['Active', day(3)]])),
    { status: 'Done', label: `In Done · ${short(2)}–${short(3)}` },
  )
  assert.equal(getJourneyGhost(journey([['Active', sprintStart]])), null)
})

test('a journey answers which column the card was in on any day of the sprint', () => {
  const value = journey([['New', day(1)], ['Active', day(3)]], day(1))
  assert.equal(journeyStatusAt(value, day(0)), null)
  assert.equal(journeyStatusAt(value, day(2)), 'New')
  assert.equal(journeyStatusAt(value, day(3)), 'Active')
})

test('sprint lanes put the current sprint first and open, later sprints collapsed, and No sprint last', () => {
  const item = (id: number, sprintName?: string) => ({ id, title: `Card ${id}`, status: 'New', sprintName })
  const rows = getSprintLensRows([
    item(1, 'Sprint 10'),
    item(2, 'Sprint 9'),
    item(3, 'Sprint 11'),
    item(4),
    { id: -5, kind: 'pull-request', title: 'PR', status: 'Review', sprintName: 'Sprint 12' },
  ], {
    currentIterationName: 'Sprint 10',
    iterationWindow: {
      current: { name: 'Sprint 10', startDate: '2026-10-05', finishDate: '2026-10-16' },
      next: { name: 'Sprint 11', startDate: '2026-10-19', finishDate: '2026-10-30' },
    },
  })

  assert.deepEqual(
    rows.map((row: { key: string; label: string; defaultCollapsed?: boolean }) => [row.label, row.defaultCollapsed]),
    [['Sprint 10', false], ['Sprint 9', true], ['Sprint 11', true], ['No sprint', true]],
  )
  assert.equal(rows.at(-1).key, NO_SPRINT_ROW_KEY)
  assert.equal(rows[0].subtitle, formatSprintDateRange('2026-10-05', '2026-10-16', { short: true }))
  assert.equal(rows[1].subtitle, undefined)
  assert.ok(rows.every((row: { countsAllItems?: boolean }) => row.countsAllItems))
})

test('without the current sprint on the board no sprint lane starts collapsed', () => {
  const rows = getSprintLensRows(
    [{ id: 1, title: 'Card', status: 'New', sprintName: 'Sprint 3' }, { id: 2, title: 'Card', status: 'New' }],
    { currentIterationName: 'Sprint 4' },
  )

  assert.deepEqual(rows.map((row: { defaultCollapsed?: boolean }) => row.defaultCollapsed), [false, false])
})
