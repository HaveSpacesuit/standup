import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { BacklogPlanPicks } from '../src/features/standup/utils/backlogPlan.ts'
import type { RankedBacklogBug } from '../src/features/standup/utils/backlogValue.ts'

// The modules import their siblings without file extensions, so Vite loads them rather than Node directly.
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { formatPlanList, getPlanEffort, NO_PLAN_PICKS, planBacklogSprint, togglePlanPick } =
  await server.ssrLoadModule('/src/features/standup/utils/backlogPlan.ts')

type Kind = RankedBacklogBug['sprint']['kind']

// The planner reads only the order it is given, so the bugs are listed already ranked.
function ranked(...specs: Array<{ id: number; effort?: number; value: number; kind?: Kind }>): RankedBacklogBug[] {
  return specs.map(({ id, effort, value, kind = 'backlog' }, index) => ({
    id,
    title: `Bug ${id}`,
    workItemUrl: `https://example.test/${id}`,
    effort,
    value,
    rank: index + 1,
    sprint: { kind, label: kind },
  }) as RankedBacklogBug)
}

const settings = (overrides: Partial<BacklogPlanPicks & { budget: number; skipPlanned: boolean; skipUnestimated: boolean }> = {}) => ({
  ...NO_PLAN_PICKS,
  budget: 10,
  skipPlanned: true,
  skipUnestimated: true,
  ...overrides,
})

const reasons = (plan: { skipReasons: ReadonlyMap<number, string> }) => Object.fromEntries(plan.skipReasons)

test('the planner fills the budget in rank order, passing over a bug too big for what is left', () => {
  const bugs = ranked(
    { id: 1, effort: 4, value: 90 },
    { id: 2, effort: 8, value: 50 },
    { id: 3, effort: 2, value: 40 },
    { id: 4, effort: 4, value: 30 },
    { id: 5, effort: 1, value: 20 },
  )
  const plan = planBacklogSprint(bugs, settings())

  assert.deepEqual(plan.picks.map((bug: RankedBacklogBug) => bug.id), [1, 3, 4], 'the smaller bugs below fill the gap')
  assert.deepEqual([...plan.pickedIds], [1, 3, 4])
  assert.deepEqual(Object.fromEntries(plan.runningTotals), { 1: 4, 3: 6, 4: 10 })
  assert.deepEqual(reasons(plan), { 2: 'Too big', 5: 'Too big' })
  assert.equal(plan.used, 10)
  assert.equal(plan.budget, 10)
  assert.equal(plan.valueTotal, 160)
  assert.equal(plan.assumedEffortCount, 0)
  assert.deepEqual([...plan.candidateIds], [1, 2, 3, 4, 5])
})

test('bugs already in this sprint or the next are passed over unless Skip planned is off', () => {
  const bugs = ranked(
    { id: 1, effort: 2, value: 90, kind: 'current' },
    { id: 2, effort: 2, value: 80, kind: 'next' },
    { id: 3, effort: 2, value: 70, kind: 'future' },
    { id: 4, effort: 2, value: 60, kind: 'past' },
  )

  const skipping = planBacklogSprint(bugs, settings())
  assert.deepEqual(skipping.picks.map((bug: RankedBacklogBug) => bug.id), [3, 4], 'a later or ended sprint is not planned')
  assert.deepEqual(reasons(skipping), { 1: 'This sprint', 2: 'Next sprint' })

  const keeping = planBacklogSprint(bugs, settings({ skipPlanned: false }))
  assert.deepEqual(keeping.picks.map((bug: RankedBacklogBug) => bug.id), [1, 2, 3, 4])
})

test('a bug without an Effort is passed over, or counted as the minimum effort when Skip unestimated is off', () => {
  const bugs = ranked({ id: 1, value: 90 }, { id: 2, effort: 3, value: 50 }, { id: 3, value: 40 })
  assert.equal(getPlanEffort(bugs[0]), 4)
  assert.equal(getPlanEffort(bugs[1]), 3)

  const skipping = planBacklogSprint(bugs, settings())
  assert.deepEqual(skipping.picks.map((bug: RankedBacklogBug) => bug.id), [2])
  assert.deepEqual(reasons(skipping), { 1: 'No effort', 3: 'No effort' })

  const counting = planBacklogSprint(bugs, settings({ skipUnestimated: false }))
  assert.deepEqual(counting.picks.map((bug: RankedBacklogBug) => bug.id), [1, 2])
  assert.deepEqual(Object.fromEntries(counting.runningTotals), { 1: 4, 2: 7 })
  assert.deepEqual(reasons(counting), { 3: 'Too big' }, '4 more points would pass 10')
  assert.equal(counting.assumedEffortCount, 1)
})

test('hand picks count first and always stay in, even past the budget; a bug unchecked by hand stays out', () => {
  const bugs = ranked(
    { id: 1, effort: 4, value: 90 },
    { id: 2, effort: 4, value: 80 },
    { id: 3, effort: 20, value: 10, kind: 'current' },
    { id: 4, effort: 2, value: 5 },
  )

  const plan = planBacklogSprint(bugs, settings({ forceIn: new Set([3]), forceOut: new Set([1]) }))
  assert.deepEqual(plan.picks.map((bug: RankedBacklogBug) => bug.id), [3], 'a hand pick beats Skip planned')
  assert.deepEqual(reasons(plan), { 1: 'Unchecked', 2: 'Too big', 4: 'Too big' })
  assert.equal(plan.used, 20, 'the plan can run over the budget')

  const room = planBacklogSprint(bugs, settings({ budget: 30, forceIn: new Set([4]) }))
  assert.deepEqual(room.picks.map((bug: RankedBacklogBug) => bug.id), [1, 2, 4])
  assert.deepEqual(Object.fromEntries(room.runningTotals), { 1: 4, 2: 8, 4: 10 }, 'running totals follow rank, not the order picked')
})

test('checking or unchecking by hand records the choice, and undoing it hands the bug back to the planner', () => {
  const unchecked: BacklogPlanPicks = togglePlanPick(NO_PLAN_PICKS, 1, true)
  assert.deepEqual([[...unchecked.forceIn], [...unchecked.forceOut]], [[], [1]])
  assert.deepEqual([[...NO_PLAN_PICKS.forceIn], [...NO_PLAN_PICKS.forceOut]], [[], []], 'the picks are not changed in place')

  const rechecked = togglePlanPick(unchecked, 1, false)
  assert.deepEqual([[...rechecked.forceIn], [...rechecked.forceOut]], [[], []])

  const picked = togglePlanPick(NO_PLAN_PICKS, 2, false)
  assert.deepEqual([[...picked.forceIn], [...picked.forceOut]], [[2], []])
  const dropped = togglePlanPick(picked, 2, true)
  assert.deepEqual([[...dropped.forceIn], [...dropped.forceOut]], [[], []])
})

test('the copied list has one tab-separated line per pick', () => {
  const bugs = ranked({ id: 70100, effort: 3, value: 96.84 }, { id: 70101, value: 12 })
  assert.equal(formatPlanList(bugs), '70100\tBug 70100\t3 pts\tValue 96.8\n70101\tBug 70101\t? pts\tValue 12.0')
  assert.equal(formatPlanList([]), '')
})
