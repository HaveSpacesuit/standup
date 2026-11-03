import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())

const {
  getReplayFlowPoints,
  getSprintReplayBoard,
  getSprintReplayTimeline,
  journeyAsOf,
} = await server.ssrLoadModule('/src/features/standup/utils/sprintReplay.ts')

const point = (date: string, done: number | null) => ({ date, Blocked: done === null ? null : 0, New: done === null ? null : 1, Active: done === null ? null : 2, Review: done === null ? null : 0, Done: done })
const POINTS = [point('2025-10-27', 0), point('2025-10-28', 1), point('2025-10-29', 3), point('2025-10-30', null), point('2025-10-31', null)]
const at = (date: string, hours = 12) => new Date(`${date}T${String(hours).padStart(2, '0')}:00:00`).getTime()
const SPRINT_START = at('2025-10-27', 0)
const CURRENT = 'Sprint 12'

test('the replay timeline has a day per working day and ends at the last day with history', () => {
  const timeline = getSprintReplayTimeline(POINTS)
  assert.equal(timeline.days.length, 5)
  assert.equal(timeline.todayIndex, 2)
  assert.deepEqual(timeline.days.map((day: { day: number }) => day.day), [1, 2, 3, 4, 5])
  const wednesday = timeline.days[2]
  assert.equal(wednesday.at, at('2025-10-30', 0) - 1, 'a day is shown as it stood at its end')
  assert.equal(getSprintReplayTimeline([point('2025-10-27', null)]), null, 'nothing to replay before the first day ends')
  assert.equal(getSprintReplayTimeline([]), null)
})

test('replayed flow points blank out the days after the one shown', () => {
  const day2 = getSprintReplayTimeline(POINTS).days[1]
  const points = getReplayFlowPoints(POINTS, day2.at)
  assert.deepEqual(points.map((entry: { Done: number | null }) => entry.Done), [0, 1, null, null, null])
  assert.equal(points[0], POINTS[0], 'days already shown keep their point')
})

test('a journey as of a moment keeps only the steps taken by then', () => {
  const journey = {
    steps: [{ status: 'New', at: SPRINT_START }, { status: 'Active', at: at('2025-10-28') }, { status: 'Review', at: at('2025-10-29') }],
    addedAt: null,
    sprintStart: SPRINT_START,
    firstStepSince: SPRINT_START - 86_400_000,
  }
  assert.deepEqual(journeyAsOf(journey, at('2025-10-28', 18)).steps.map((step: { status: string }) => step.status), ['New', 'Active'])
  assert.equal(journeyAsOf(journey, at('2025-10-30')), journey, 'nothing to drop returns the same journey')
  assert.deepEqual(journeyAsOf(journey, SPRINT_START - 1).steps.map((step: { status: string }) => step.status), ['New'], 'a committed card keeps its first step')

  const added = { ...journey, addedAt: at('2025-10-28'), steps: [{ status: 'New', at: at('2025-10-28') }] }
  assert.equal(journeyAsOf(added, at('2025-10-27', 23)), null, 'a card added later was not in the sprint yet')
  assert.ok(journeyAsOf(added, at('2025-10-28', 23)))
})

test('the replayed board puts cards back where they stood, without later additions or other sprints', () => {
  const journey = (steps: Array<[string, number]>, addedAt: number | null = null) => ({
    steps: steps.map(([status, stepAt]) => ({ status, at: stepAt })),
    addedAt,
    sprintStart: SPRINT_START,
    firstStepSince: SPRINT_START,
  })
  const item = (id: number, status: string, sprintName = CURRENT) => ({ id, title: `Card ${id}`, state: status, status, sprintName, effort: 2 })
  const moved = item(1, 'Done')
  const addedLater = item(2, 'Active')
  const noHistory = item(3, 'Review')
  const nextSprint = item(4, 'New', 'Sprint 13')
  const removedLater = item(5, 'New', 'Sprint 13')
  const removedEarly = item(6, 'New', 'Sprint 13')
  const scope = { startItemIds: new Set([1, 3, 5, 6]), removedItems: [removedLater, removedEarly] }
  const day2End = at('2025-10-29', 0) - 1

  const board = getSprintReplayBoard({
    items: [moved, addedLater, noHistory, nextSprint],
    journeysByItemId: {
      1: journey([['New', SPRINT_START], ['Active', at('2025-10-28')], ['Done', at('2025-10-29')]]),
      2: journey([['Active', at('2025-10-29')]], at('2025-10-29')),
      4: journey([['New', SPRINT_START]]),
    },
    scope,
    departuresByItemId: {
      5: { leftAt: at('2025-10-29'), status: 'Active', journey: journey([['New', SPRINT_START], ['Active', at('2025-10-28', 9)]]) },
      6: { leftAt: at('2025-10-27'), status: 'New', journey: journey([['New', SPRINT_START]]) },
    },
    currentIterationName: CURRENT,
    at: day2End,
  })

  assert.deepEqual(
    board.items.map((entry: { id: number; status: string; sprintName: string }) => [entry.id, entry.status, entry.sprintName]),
    [[1, 'Active', CURRENT], [5, 'Active', CURRENT]],
    'card 1 was still Active, card 5 was back in the sprint, and the rest drop out',
  )
  assert.deepEqual(board.journeysByItemId[1].steps.map((step: { status: string }) => step.status), ['New', 'Active'])
  assert.deepEqual(board.scope.removedItems.map((entry: { id: number }) => entry.id), [6], 'only cards removed by then stay removed')
  assert.equal(board.scope.startItemIds, scope.startItemIds)

  const unscoped = getSprintReplayBoard({ items: [moved], journeysByItemId: board.journeysByItemId, scope: null, currentIterationName: CURRENT, at: day2End })
  assert.equal(unscoped.scope, null)
  assert.equal(unscoped.items.length, 1)
})
