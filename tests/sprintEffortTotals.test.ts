import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const {
  formatEffort,
  formatEffortPoints,
  getCurrentSprintEffortTotals,
} = await server.ssrLoadModule('/src/features/standup/utils/sprintEffortTotals.ts')

const items = [
  { id: 1, title: 'a', status: 'Active', effort: 3, sprintName: 'Sprint 12' },
  { id: 2, title: 'b', status: 'Done', effort: 5, sprintName: 'Sprint 12' },
  { id: 3, title: 'c', status: 'Done', effort: 8, sprintName: 'Sprint 11' },
  { id: 4, title: 'd', status: 'Blocked', sprintName: 'Sprint 12' },
  { id: 5, title: 'e', status: 'Review', effort: 0.5, sprintName: 'Sprint 12' },
]

test('sums numeric effort per status for current-sprint items only', () => {
  assert.deepEqual(getCurrentSprintEffortTotals(items, 'Sprint 12'), { Blocked: 0, New: 0, Active: 3, Review: 0.5, Done: 5 })
})

test('counts every item when the current sprint is unknown', () => {
  assert.deepEqual(getCurrentSprintEffortTotals(items, null), { Blocked: 0, New: 0, Active: 3, Review: 0.5, Done: 13 })
})

test('formats summed effort to at most one decimal place', () => {
  assert.equal(formatEffortPoints(13), '13 pts')
  assert.equal(formatEffort(0.1 + 0.2), formatEffort(0.3))
  assert.equal(formatEffortPoints(0.1 + 0.2), `${formatEffort(0.3)} pts`)
})
