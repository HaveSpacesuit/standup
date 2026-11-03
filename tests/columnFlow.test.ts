import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(() => server.close())

const {
  describeColumnFlowDelta,
  formatColumnFlowDelta,
  getColumnFlows,
  getColumnFlowTone,
} = await server.ssrLoadModule('/src/features/standup/utils/columnFlow.ts')

const DAY = 24 * 60 * 60 * 1000

function point(date: string, totals: Partial<Record<string, number | null>>) {
  return { date, Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0, ...totals }
}

const future = (date: string) => ({ date, Blocked: null, New: null, Active: null, Review: null, Done: null })

function card(id: number, status: string) {
  return { id, title: `Card ${id}`, state: status, status, workItemType: 'Task', effort: 1, sprintName: 'Sprint 1' }
}

test('Done growing is good news, Blocked growing is bad news, and other columns stay neutral', () => {
  assert.equal(getColumnFlowTone('Done', 3), 'positive')
  assert.equal(getColumnFlowTone('Done', -2), 'neutral')
  assert.equal(getColumnFlowTone('Blocked', 2), 'critical')
  assert.equal(getColumnFlowTone('Blocked', -2), 'positive')
  assert.equal(getColumnFlowTone('Blocked', 0), 'neutral')
  assert.equal(getColumnFlowTone('Review', 8), 'neutral')
  assert.equal(getColumnFlowTone('Active', -8), 'neutral')
})

test('flow deltas read as arrows with points, and as words for screen readers', () => {
  assert.equal(formatColumnFlowDelta(3), '▲3 pts')
  assert.equal(formatColumnFlowDelta(-2.5), '▼2.5 pts')
  assert.equal(formatColumnFlowDelta(0), '±0 pts')
  assert.equal(formatColumnFlowDelta(1e-12), '±0 pts')
  assert.equal(describeColumnFlowDelta(3), '3 pts more than at sprint start')
  assert.equal(describeColumnFlowDelta(-1), '1 pts fewer than at sprint start')
  assert.equal(describeColumnFlowDelta(0), 'No change since sprint start')
})

test('column flows follow each column through the elapsed days and leave room for the rest', () => {
  const points = [
    point('2026-10-26', { New: 8, Active: 3, Done: 0 }),
    point('2026-10-27', { New: 5, Active: 4, Done: 2 }),
    point('2026-10-28', { New: 2, Active: 5, Review: 1, Done: 3 }),
    future('2026-10-29'),
    future('2026-10-30'),
  ]

  const flows = getColumnFlows({ points, items: [], journeysByItemId: {}, now: Date.now() })

  assert.deepEqual(flows.New.series, [8, 5, 2])
  assert.equal(flows.New.dayCount, 5)
  assert.equal(flows.New.delta, -6)
  assert.equal(flows.Done.delta, 3)
  assert.equal(flows.Done.tone, 'positive')
  assert.deepEqual(flows.Review.series, [0, 0, 1])
  assert.equal(flows.Active.oldestDays, null)
})

test('column flows are null until the sprint has a day of history', () => {
  assert.equal(getColumnFlows({ points: [], items: [], journeysByItemId: {}, now: Date.now() }), null)
  assert.equal(getColumnFlows({ points: [future('2026-10-26')], items: [], journeysByItemId: {}, now: Date.now() }), null)
})

test('Active and Review report how long their longest-staying card has been there', () => {
  const now = new Date(2026, 9, 30, 12).getTime()
  const sprintStart = new Date(2026, 9, 26, 9).getTime()
  const points = [point('2026-10-26', {})]
  const items = [card(1, 'Active'), card(2, 'Active'), card(3, 'Review'), card(4, 'New'), card(5, 'Review'), card(6, 'Active')]
  const journeysByItemId = {
    // Never moved this sprint: counted from when it entered Active, before the sprint.
    1: { steps: [{ status: 'Active', at: sprintStart }], addedAt: null, sprintStart, firstStepSince: sprintStart - 5 * DAY },
    2: { steps: [{ status: 'New', at: sprintStart }, { status: 'Active', at: now - 2 * DAY }], addedAt: null, sprintStart, firstStepSince: sprintStart },
    3: { steps: [{ status: 'Active', at: sprintStart }, { status: 'Review', at: now - DAY }], addedAt: null, sprintStart, firstStepSince: sprintStart },
    4: { steps: [{ status: 'New', at: sprintStart }], addedAt: null, sprintStart, firstStepSince: sprintStart - 20 * DAY },
    // A journey that disagrees with the card's current column is ignored.
    6: { steps: [{ status: 'Review', at: sprintStart }], addedAt: null, sprintStart, firstStepSince: sprintStart - 30 * DAY },
  }

  const flows = getColumnFlows({ points, items, journeysByItemId, now })

  assert.equal(flows.Active.oldestDays, 9)
  assert.equal(flows.Review.oldestDays, 1)
  assert.equal(flows.New.oldestDays, null, 'New does not report an oldest card')
  assert.equal(flows.Done.oldestDays, null)
})
