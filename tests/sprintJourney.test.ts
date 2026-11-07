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
  getSprintDeparture,
  hasMovedBack,
  isBackwardMove,
} = await server.ssrLoadModule('/src/features/standup/utils/sprintJourney.ts')
const {
  getRemovedCardStatus,
  getSprintLensRowKey,
  getSprintLensRows,
  getSprintRemovals,
  NO_SPRINT_ROW_KEY,
  resolveSprintLensScope,
  SCOPE_ADDED_ROW_KEY,
  SCOPE_COMMITTED_ROW_KEY,
  SCOPE_REMOVED_ROW_KEY,
} = await server.ssrLoadModule('/src/features/standup/utils/sprintLens.ts')
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

test('a long wait reads in coarser units, with the exact date and day count in its tooltip', () => {
  const recent = getJourneyCaption(journey([['New', sprintStart]], null, day(-1)), day(6))
  assert.doesNotMatch(recent.tooltip, /\d{4}|days\)/, 'a recent date needs no year or day count')

  const backlog = getJourneyCaption(journey([['New', sprintStart]], null, day(-437)), day(6))
  assert.equal(backlog.text, '1y in New')
  assert.equal(backlog.tone, 'neutral')
  assert.match(backlog.tooltip, /^In New since .*2025 \(443 days\)$/)

  const active = getJourneyCaption(journey([['New', sprintStart], ['Active', day(1)]]), day(31))
  assert.equal(active.text, '4w in Active')
  assert.equal(active.tone, 'attention')
  assert.match(active.tooltip, /\(30 days\)$/)
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

test('a card moved out of the sprint remembers when it left and the column it left from', () => {
  const timeline = [
    { timestamp: day(-6), status: 'New', iterationPath: 'Project\\Sprint 0' },
    { timestamp: day(-3), status: 'New', iterationPath: 'Project\\Sprint 1' },
    { timestamp: day(2), status: 'Active', iterationPath: 'Project\\Sprint 1' },
    { timestamp: day(6), status: 'New', iterationPath: 'Project\\Sprint 2' },
  ]

  assert.deepEqual(
    getSprintDeparture(timeline, { sprintStart, iterationPath: 'Project\\Sprint 1', currentStatus: 'New' }),
    { leftAt: day(6), status: 'Active' },
  )
  // Leaving Sprint 0 before this sprint started is not a departure from this sprint.
  assert.deepEqual(
    getSprintDeparture(timeline, { sprintStart, iterationPath: 'Project\\Sprint 0', currentStatus: 'New' }),
    { leftAt: null, status: 'New' },
  )
  assert.deepEqual(
    getSprintDeparture(timeline, { sprintStart, currentStatus: 'Review' }),
    { leftAt: null, status: 'Review' },
  )
})

const scopeItem = (id: number, sprintName: string | undefined, extra: Record<string, unknown> = {}) => (
  { id, title: `Card ${id}`, status: 'Active', effort: 2, sprintName, ...extra }
)
const scopeIterations = {
  currentIterationName: 'Sprint 10',
  iterationWindow: {
    current: { name: 'Sprint 10', fullName: 'Project\\Sprint 10', startDate: '2026-10-05', finishDate: '2026-10-16' },
    next: { name: 'Sprint 11', fullName: 'Project\\Sprint 11', startDate: '2026-10-19', finishDate: '2026-10-30' },
  },
  teamIterations: [
    { id: 'a', name: 'Sprint 9', path: 'Project\\Sprint 9', startDate: '2026-09-21', finishDate: '2026-10-02', timeFrame: 'past' },
    { id: 'b', name: 'Sprint 8', path: 'Project\\Sprint 8', startDate: '2026-09-07', finishDate: '2026-09-18', timeFrame: 'past' },
    { id: 'c', name: 'Sprint 10', path: 'Project\\Sprint 10', startDate: '2026-10-05', finishDate: '2026-10-16', timeFrame: 'current' },
    { id: 'd', name: 'Sprint 11', path: 'Project\\Sprint 11', startDate: '2026-10-19', finishDate: '2026-10-30', timeFrame: 'future' },
  ],
}

test('sprint scope splits the current sprint into committed, added, and removed lanes with scope notes', () => {
  const items = [
    scopeItem(1, 'Sprint 10', { effort: 5 }),
    scopeItem(2, 'Sprint 10', { effort: 3 }),
    scopeItem(3, 'Sprint 10', { effort: 2 }),
    scopeItem(4, 'Sprint 11'),
  ]
  const removedItems = [
    scopeItem(5, 'Sprint 11', { effort: 2, iterationPath: 'Project\\Sprint 11' }),
    scopeItem(6, 'Sprint 11', { effort: 1, iterationPath: 'Project\\Sprint 11' }),
    scopeItem(7, 'Project', { effort: 1, iterationPath: 'Project' }),
  ]
  const scope = { startItemIds: new Set([1, 2, 5, 6, 7]), removedItems }
  const rows = getSprintLensRows(items, { ...scopeIterations, scope, rolledOverItemIds: { 2: true } })

  assert.deepEqual(
    rows.map((row: { key: string; label: string; defaultCollapsed?: boolean; ghost?: boolean }) => [row.key, row.label, Boolean(row.defaultCollapsed), Boolean(row.ghost)]),
    [
      [SCOPE_COMMITTED_ROW_KEY, 'Committed at start', false, false],
      [SCOPE_ADDED_ROW_KEY, 'Added during sprint', false, false],
      [SCOPE_REMOVED_ROW_KEY, 'Removed from sprint', true, true],
      ['sprint:sprint 11', 'Sprint 11', true, false],
    ],
  )
  const notes = (index: number) => rows[index].notes.map((note: { label: string; tone: string }) => [note.label, note.tone])
  assert.equal(rows[0].subtitle, `Planned ${formatSprintDate(new Date(2026, 9, 5))}`)
  assert.deepEqual(notes(0), [['1 from Sprint 9', 'info']])
  // 2 pts added to the 8 committed plus 4 since removed.
  assert.deepEqual(notes(1), [['Scope +17%', 'attention']])
  assert.equal(rows[1].notes[0].description, '2 pts added to the 12 pts planned')
  assert.deepEqual(notes(2), [['2 to Sprint 11', 'neutral'], ['1 moved out', 'neutral']])
})

test('sprint scope only applies while the current sprint is on the board', () => {
  const scope = { startItemIds: new Set([1]), removedItems: [] }
  assert.equal(resolveSprintLensScope([scopeItem(1, 'Sprint 10')], 'Sprint 10', scope), scope)
  assert.equal(resolveSprintLensScope([scopeItem(1, 'Sprint 11')], 'Sprint 10', scope), null)
  assert.equal(resolveSprintLensScope([scopeItem(1, 'Sprint 10')], 'Sprint 10', undefined), null)

  const options = { currentIterationName: 'Sprint 10', scope }
  assert.equal(getSprintLensRowKey(scopeItem(1, 'Sprint 10'), options), SCOPE_COMMITTED_ROW_KEY)
  assert.equal(getSprintLensRowKey(scopeItem(2, 'Sprint 10'), options), SCOPE_ADDED_ROW_KEY)
  assert.equal(getSprintLensRowKey(scopeItem(3, 'Sprint 11'), options), 'sprint:sprint 11')
  assert.equal(getSprintLensRowKey(scopeItem(1, 'Sprint 10'), { currentIterationName: 'Sprint 10' }), 'sprint:sprint 10')
})

test('removed cards say which team sprint they went to and sit in the column they left from', () => {
  const moved = scopeItem(5, 'Sprint 11', { iterationPath: 'Project\\Sprint 11', status: 'New' })
  const outside = scopeItem(6, 'Project', { iterationPath: 'Project' })
  const removals = getSprintRemovals([moved, outside], { 5: { leftAt: day(3), status: 'Review' } }, scopeIterations)

  assert.deepEqual(removals.get(5), { to: 'Sprint 11', at: day(3) })
  assert.deepEqual(removals.get(6), { to: null, at: null })
  assert.equal(getRemovedCardStatus(moved, { leftAt: day(3), status: 'Review' }), 'Review')
  assert.equal(getRemovedCardStatus(moved, undefined), 'New')
})
