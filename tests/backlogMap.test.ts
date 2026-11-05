import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { BacklogBug } from '../src/ado/types.ts'

// backlogMap.ts imports its siblings without file extensions, so Vite loads it rather than Node directly.
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const {
  benefitForValue,
  createLogScale,
  describeBacklogMapBubble,
  describeMapEffort,
  formatMapEffort,
  getBubbleRadius,
  getIsoValueLine,
  getMapEffortDomain,
  groupBacklogMapBubbles,
  layoutBacklogMap,
  MAP_BENEFIT_DOMAIN,
  MIN_TICK_GAP,
  pickEffortTicks,
  usesAssumedDefault,
} = await server.ssrLoadModule('/src/features/standup/utils/backlogMap.ts')
const { rankBacklogBug, rankBacklogBugs } = await server.ssrLoadModule('/src/features/standup/utils/backlogValue.ts')

const THRESHOLDS = { top: 80, high: 30, medium: 12 }

function createBug(overrides: Partial<BacklogBug> & { id: number }): BacklogBug {
  return {
    title: `Bug ${overrides.id}`,
    workItemUrl: `https://dev.azure.com/org/project/_workitems/edit/${overrides.id}`,
    severity: '2 - High',
    priority: 2,
    effort: 8,
    ...overrides,
  }
}

function assertClose(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `expected ${actual} to be ${expected}`)
}

test('a bubble is assumed when the Value used a default for the severity, the impact, or the effort', () => {
  const assumed = (overrides: Partial<BacklogBug>) => usesAssumedDefault(rankBacklogBug(createBug({ id: 1, ...overrides })))

  assert.equal(assumed({}), false)
  // Raised to the minimum, but entered: the place is right.
  assert.equal(assumed({ effort: 2 }), false)
  assert.equal(assumed({ severity: undefined }), true)
  assert.equal(assumed({ severity: 'High' }), true)
  assert.equal(assumed({ priority: undefined }), true)
  assert.equal(assumed({ priority: 7 }), true)
  assert.equal(assumed({ effort: undefined }), true)
  assert.equal(assumed({ effort: Number.NaN }), true)
})

test('bugs with the same inputs to the Value share a bubble, in ranked order, apart from assumed ones', () => {
  const ranked = rankBacklogBugs([
    createBug({ id: 1, effort: 8 }),
    createBug({ id: 2, effort: 8, createdAt: '2020-01-01T00:00:00Z' }),
    // Under the minimum: placed at 4 points, with the bugs that entered 4.
    createBug({ id: 3, effort: 2 }),
    createBug({ id: 4, effort: 4 }),
    // Also scored at 4 points, but by default: its own bubble.
    createBug({ id: 5, effort: undefined }),
    // Impact 4 and an unset Impact score alike, but one is a guess.
    createBug({ id: 6, priority: 4 }),
    createBug({ id: 7, priority: undefined }),
  ])

  const bubbles = groupBacklogMapBubbles(ranked, THRESHOLDS)
  const summary = bubbles.map((bubble: { adjustedEffort: number; assumed: boolean; tier: string; bugs: BacklogBug[] }) => ({
    effort: bubble.adjustedEffort,
    assumed: bubble.assumed,
    tier: bubble.tier,
    ids: bubble.bugs.map((bug) => bug.id),
  }))

  // S2 × Impact 2 = 19.36: 48.4 at 4 points, 24.2 at 8; S2 × Impact 4 = 4.84: 6.05 at 8.
  assert.deepEqual(summary, [
    { effort: 4, assumed: false, tier: 'high', ids: [3, 4] },
    { effort: 4, assumed: true, tier: 'high', ids: [5] },
    { effort: 8, assumed: false, tier: 'medium', ids: [2, 1] },
    { effort: 8, assumed: false, tier: 'low', ids: [6] },
    { effort: 8, assumed: true, tier: 'low', ids: [7] },
  ])
  assertClose(bubbles[0].benefit, 4.84 * 4)
  assertClose(bubbles[0].value, 48.4)
  assert.deepEqual([bubbles[0].severityScore, bubbles[0].impactScore], [4.84, 4], 'a bubble keeps the scores behind its benefit')
  assert.deepEqual([bubbles[3].severityScore, bubbles[3].impactScore], [4.84, 1])
})

test('a bubble\'s tooltip gives its numbers and how to list its bugs, but not the bugs themselves', () => {
  const ranked = rankBacklogBugs([
    createBug({ id: 1, effort: 2 }),
    createBug({ id: 2, effort: 4 }),
    createBug({ id: 3, severity: undefined, effort: 13 }),
  ])
  const [shared, assumed] = groupBacklogMapBubbles(ranked, THRESHOLDS)

  assert.deepEqual(describeBacklogMapBubble(shared, false), {
    lines: ['2 bugs · Value 48.4', 'Effort 4 pts or less', 'Severity score 4.8', 'Impact score 4'],
    hint: 'Click to list these bugs in the side panel',
  })
  assert.deepEqual(describeBacklogMapBubble(assumed, false), {
    // Severity 4 by default: 1 × 4 ÷ 13 × 10.
    lines: ['1 bug · Value 3.1', 'Effort 13 pts', 'Severity score 1', 'Impact score 4', 'Uses an assumed default'],
    hint: 'Click to show this bug in the side panel',
  })
  assert.equal(describeBacklogMapBubble(shared, true).hint, 'Click again to go back to the reading guide')
  assert.equal(describeMapEffort(8), '8 pts')
})

test('the effort axis spans the team\'s efforts with a margin, and at least 2.5 times the smallest', () => {
  const domainFor = (efforts: number[]) => getMapEffortDomain(efforts.map((adjustedEffort) => ({ adjustedEffort })))

  const [low, high] = domainFor([4, 6, 10, 40])
  assertClose(low, 4 / 1.22)
  assertClose(high, 40 * 1.22)

  // Every bug at the minimum still spreads out.
  const [onlyLow, onlyHigh] = domainFor([4])
  assertClose(onlyLow, 4 / 1.22)
  assertClose(onlyHigh, 10 * 1.22)
})

test('a log scale maps the domain\'s ends and its geometric middle, and can run backwards', () => {
  const toX = createLogScale([2, 32], [100, 500])
  assertClose(toX(2), 100)
  assertClose(toX(32), 500)
  assertClose(toX(8), 300)

  const toY = createLogScale([1, 100], [400, 0])
  assertClose(toY(1), 400)
  assertClose(toY(10), 200)
  assertClose(toY(100), 0)
})

test('effort labels are the team\'s own efforts, spaced apart, always ending at the largest', () => {
  const linear = (effort: number) => effort * 10

  // Not a Fibonacci scale: the labels come from the data. 6 sits too close to 4.
  assert.deepEqual(pickEffortTicks([10, 4, 6, 15, 40, 15], linear), [4, 10, 15, 40])
  // 11 is too close to 10, but the largest effort is always labeled, so it takes 10's place.
  assert.deepEqual(pickEffortTicks([4, 10, 11], linear), [4, 11])
  assert.deepEqual(pickEffortTicks([4], linear), [4])
  assert.deepEqual(pickEffortTicks([], linear), [])

  const efforts = [4, 5, 6, 7, 8, 10, 12, 16, 20, 24, 30]
  const toX = createLogScale([4 / 1.22, 30 * 1.22], [58, 600])
  const ticks = pickEffortTicks(efforts, toX)
  assert.ok(ticks.every((tick: number) => efforts.includes(tick)))
  assert.equal(ticks[0], 4)
  assert.equal(ticks.at(-1), 30)
  ticks.slice(1).forEach((tick: number, index: number) => {
    assert.ok(toX(tick) - toX(ticks[index]) >= MIN_TICK_GAP, `${tick} is too close to ${ticks[index]}`)
  })
})

test('the minimum effort reads "≤4", since smaller and missing efforts count as 4', () => {
  assert.equal(formatMapEffort(4), '≤4')
  assert.equal(formatMapEffort(6), '6')
  assert.equal(formatMapEffort(10.5), '10.5')
})

test('a line of equal Value crosses the plot, labeled where it leaves, unless it misses the plot', () => {
  const effortDomain = [4 / 1.22, 40 * 1.22] as const
  const line = getIsoValueLine(30, effortDomain, MAP_BENEFIT_DOMAIN)

  assert.ok(line)
  for (const point of [line.start, line.end, line.label]) {
    assertClose((point.benefit / point.effort) * 10, 30, 'every point on the line scores the same Value')
  }
  assertClose(line.start.effort, effortDomain[0])
  assertClose(line.end.effort, effortDomain[1])
  // Value 30 reaches the top of the plot (a benefit of 120) at 40 points, before the right edge, and is labeled there.
  assertClose(line.label.effort, 40 / 1.18)
  assertClose(benefitForValue(30, 40), 120)

  // Value 5 leaves through the right edge instead.
  assertClose(getIsoValueLine(5, effortDomain, MAP_BENEFIT_DOMAIN).label.effort, effortDomain[1] / 1.18)

  // Value 1000 is above the plot everywhere, and Value 0.1 below it.
  assert.equal(getIsoValueLine(1000, effortDomain, MAP_BENEFIT_DOMAIN), null)
  assert.equal(getIsoValueLine(0.1, effortDomain, MAP_BENEFIT_DOMAIN), null)
  assert.equal(getIsoValueLine(0, effortDomain, MAP_BENEFIT_DOMAIN), null)
})

test('a bubble grows with its bugs, up to a limit', () => {
  assert.equal(getBubbleRadius(1), 8)
  assert.equal(getBubbleRadius(2), 10.5)
  assert.equal(getBubbleRadius(4), 15.5)
  assert.equal(getBubbleRadius(30), 16)
})

test('bubbles that would overlap move sideways to a free spot inside the plot, keeping their given order', () => {
  const bubble = (key: string, count: number, adjustedEffort: number, assumed = false) => ({
    key,
    adjustedEffort,
    benefit: 10,
    value: 100 / adjustedEffort,
    tier: 'medium',
    assumed,
    bugs: Array.from({ length: count }, (_, index) => ({ id: index })),
  })
  const toX = (effort: number) => effort * 20
  const toY = () => 100
  const bubbles = [bubble('known', 1, 8), bubble('group', 3, 8.2), bubble('assumed', 1, 8, true), bubble('edge', 1, 29.8)]

  const placed = layoutBacklogMap(bubbles, toX, toY, [40, 600])
  assert.deepEqual(placed.map((item: { key: string }) => item.key), ['known', 'group', 'assumed', 'edge'])

  const byKey = Object.fromEntries(placed.map((item: { key: string }) => [item.key, item]))
  // The largest is placed first and keeps its spot.
  assertClose(byKey.group.cx, 164)
  for (const [index, a] of placed.entries()) {
    for (const b of placed.slice(index + 1)) {
      assert.ok(Math.hypot(a.cx - b.cx, a.cy - b.cy) >= a.r + b.r, `${a.key} overlaps ${b.key}`)
    }
  }
  // At the right edge, it moves left rather than out of the plot.
  assert.ok(byKey.edge.cx + byKey.edge.r <= 600)
  assert.ok(byKey.edge.cx < toX(29.8))
})
