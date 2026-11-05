import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { BacklogBug } from '../src/ado/types.ts'

// backlogValue.ts imports its siblings without file extensions, so Vite loads it rather than Node directly.
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const {
  compareRankedBacklogBugs,
  describeBacklogValue,
  formatBacklogValue,
  formatCreatedDate,
  formatValueTerm,
  getAdjustedEffort,
  getBacklogAgeDays,
  getImpactDescription,
  getImpactScore,
  getSeverityDisplay,
  getSeverityScore,
  getValueMeterPercent,
  rankBacklogBug,
  rankBacklogBugs,
} = await server.ssrLoadModule('/src/features/standup/utils/backlogValue.ts')

function createBug(overrides: Partial<BacklogBug> & { id: number }): BacklogBug {
  return {
    title: `Bug ${overrides.id}`,
    workItemUrl: `https://dev.azure.com/org/project/_workitems/edit/${overrides.id}`,
    ...overrides,
  }
}

const rankedIds = (bugs: BacklogBug[]) => rankBacklogBugs(bugs).map((bug) => bug.id)

function assertValue(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} to be ${expected}`)
}

test('severity score maps the Severity picklist and treats missing or unmapped values as Severity 4', () => {
  const cases: Array<[unknown, number]> = [
    ['1 - Critical', 10.648],
    ['2 - High', 4.84],
    ['3 - Medium', 2.2],
    ['4 - Low', 1],
    [1, 10.648],
    [2, 4.84],
    ['3', 2.2],
    [undefined, 1],
    ['', 1],
    ['High', 1],
    ['0 - None', 1],
    ['7 - Unknown', 1],
  ]

  for (const [severity, expected] of cases) {
    assert.equal(getSeverityScore(severity), expected, `severity ${JSON.stringify(severity)}`)
  }
})

test('impact score maps the Priority field and treats missing or unmapped values as Priority 4', () => {
  const cases: Array<[unknown, number]> = [
    [1, 8],
    [2, 4],
    [3, 2],
    [4, 1],
    ['2', 4],
    [undefined, 1],
    [0, 1],
    [9, 1],
  ]

  for (const [priority, expected] of cases) {
    assert.equal(getImpactScore(priority), expected, `priority ${JSON.stringify(priority)}`)
  }
})

test('adjusted effort uses 4 as the minimum, including when effort is missing', () => {
  const cases: Array<[number | undefined, number]> = [
    [undefined, 4],
    [Number.NaN, 4],
    [-2, 4],
    [0, 4],
    [3.5, 4],
    [4, 4],
    [4.5, 4.5],
    [13, 13],
  ]

  for (const [effort, expected] of cases) {
    assert.equal(getAdjustedEffort(effort), expected, `effort ${effort}`)
  }
})

test('value is (severity score * impact score / adjusted effort) * 10, kept exact and shown to one decimal', () => {
  const critical = rankBacklogBug(createBug({ id: 1, severity: '1 - Critical', priority: 1, effort: 4 }))
  assert.equal(critical.severityScore, 10.648)
  assert.equal(critical.impactScore, 8)
  assert.equal(critical.adjustedEffort, 4)
  assertValue(critical.value, 212.96)
  assert.equal(formatBacklogValue(critical.value), '213.0')

  const medium = rankBacklogBug(createBug({ id: 2, severity: '3 - Medium', priority: 2, effort: 8 }))
  assertValue(medium.value, 11)
  assert.equal(formatBacklogValue(medium.value), '11.0')

  const fractional = rankBacklogBug(createBug({ id: 3, severity: '2 - High', priority: 2, effort: 13 }))
  assertValue(fractional.value, 14.8923076923)
  assert.equal(formatBacklogValue(fractional.value), '14.9')
})

test('a bug with no severity, priority, or effort is scored as Severity 4, Priority 4, and effort 4', () => {
  const bare = rankBacklogBug(createBug({ id: 1 }))

  assert.equal(bare.severityScore, 1)
  assert.equal(bare.impactScore, 1)
  assert.equal(bare.adjustedEffort, 4)
  assert.equal(bare.value, 2.5)
  assert.equal(formatBacklogValue(bare.value), '2.5')
})

test('efforts below the minimum score the same as the minimum effort', () => {
  const valueFor = (effort: number | undefined) => (
    rankBacklogBug(createBug({ id: 1, severity: '2 - High', priority: 2, effort })).value
  )
  const atMinimum = valueFor(4)

  assertValue(atMinimum, 48.4)
  for (const effort of [undefined, 0, 1, 3]) {
    assert.equal(valueFor(effort), atMinimum, `effort ${effort}`)
  }
  assert.ok(valueFor(5) < atMinimum)
})

test('the displayed value has one decimal of precision', () => {
  assert.equal(formatBacklogValue(14.892307), '14.9')
  assert.equal(formatBacklogValue(13.3333), '13.3')
  assert.equal(formatBacklogValue(3), '3.0')
  assert.equal(formatBacklogValue(0.5), '0.5')
})

test('ranking sorts by value descending', () => {
  const bugs = [
    createBug({ id: 1, severity: '3 - Medium', priority: 3, effort: 8 }),
    createBug({ id: 2, severity: '1 - Critical', priority: 1, effort: 4 }),
    createBug({ id: 3, severity: '2 - High', priority: 2, effort: 4 }),
    createBug({ id: 4 }),
  ]

  assert.deepEqual(rankedIds(bugs), [2, 3, 1, 4])
})

test('a larger effort lowers a bug in the ranking', () => {
  const bugs = [
    createBug({ id: 1, severity: '2 - High', priority: 2, effort: 16 }),
    createBug({ id: 2, severity: '2 - High', priority: 2, effort: 4 }),
    createBug({ id: 3, severity: '2 - High', priority: 2, effort: 8 }),
  ]

  assert.deepEqual(rankedIds(bugs), [2, 3, 1])
})

test('ranking uses the exact value, not the rounded value that is displayed', () => {
  // Exact values are 13.333 (severity 4) and 13.31 (severity 1); both display as 13.3.
  const lowSeverity = createBug({ id: 1, severity: '4 - Low', priority: 1, effort: 6 })
  const highSeverity = createBug({ id: 2, severity: '1 - Critical', priority: 4, effort: 8 })

  const ranked = rankBacklogBugs([highSeverity, lowSeverity])

  assert.deepEqual(ranked.map((bug) => formatBacklogValue(bug.value)), ['13.3', '13.3'])
  assert.deepEqual(ranked.map((bug) => bug.id), [1, 2])
})

test('bugs with exactly equal values are ordered by severity score descending', () => {
  // Both are exactly 14.08, but floating-point arithmetic leaves the higher-severity bug a hair below the other.
  const highSeverity = createBug({ id: 1, severity: '2 - High', priority: 1, effort: 27.5 })
  const lowSeverity = createBug({ id: 2, severity: '3 - Medium', priority: 1, effort: 12.5 })
  const [highRanked, lowRanked] = [highSeverity, lowSeverity].map(rankBacklogBug)

  assert.ok(highRanked.value < lowRanked.value, 'the fixture must still carry floating-point noise')
  assert.deepEqual(rankedIds([lowSeverity, highSeverity]), [1, 2])
  assert.deepEqual(rankedIds([highSeverity, lowSeverity]), [1, 2])
})

test('bugs with the same value and severity are ordered by creation date, oldest first', () => {
  const bugs = [
    createBug({ id: 1, severity: '2 - High', priority: 2, effort: 8, createdAt: '2026-03-01T09:00:00Z' }),
    createBug({ id: 2, severity: '2 - High', priority: 2, effort: 8, createdAt: '2025-11-20T09:00:00Z' }),
    createBug({ id: 3, severity: '2 - High', priority: 2, effort: 8, createdAt: '2026-01-15T09:00:00Z' }),
  ]

  assert.deepEqual(rankedIds(bugs), [2, 3, 1])
})

test('bugs without a usable creation date follow the dated bugs, then fall back to the id', () => {
  const bugs = [
    createBug({ id: 5, severity: '2 - High', priority: 2, effort: 8 }),
    createBug({ id: 4, severity: '2 - High', priority: 2, effort: 8, createdAt: 'not a date' }),
    createBug({ id: 6, severity: '2 - High', priority: 2, effort: 8, createdAt: '2026-03-01T09:00:00Z' }),
  ]

  assert.deepEqual(rankedIds(bugs), [6, 4, 5])
})

test('creation date only breaks ties and never outranks value or severity', () => {
  const bugs = [
    createBug({ id: 1, severity: '4 - Low', priority: 4, effort: 4, createdAt: '2020-01-01T00:00:00Z' }),
    createBug({ id: 2, severity: '1 - Critical', priority: 1, effort: 4, createdAt: '2026-06-01T00:00:00Z' }),
  ]

  assert.deepEqual(rankedIds(bugs), [2, 1])
})

test('ranking does not reorder or modify the input list', () => {
  const bugs = [createBug({ id: 1 }), createBug({ id: 2, severity: '1 - Critical', priority: 1 })]
  const snapshot = structuredClone(bugs)

  rankBacklogBugs(bugs)

  assert.deepEqual(bugs, snapshot)
})

test('the comparator treats identical rows as equal only when they are the same bug', () => {
  const ranked = rankBacklogBug(createBug({ id: 1 }))

  assert.equal(compareRankedBacklogBugs(ranked, ranked), 0)
  assert.ok(compareRankedBacklogBugs(ranked, rankBacklogBug(createBug({ id: 2 }))) < 0)
})

test('age is the whole days since the bug was created, and missing for a missing or invalid date', () => {
  const now = Date.parse('2026-06-15T12:00:00Z')

  assert.equal(getBacklogAgeDays('2026-06-15T08:00:00Z', now), 0, 'created earlier today')
  assert.equal(getBacklogAgeDays('2026-06-14T13:00:00Z', now), 0, 'under a full day')
  assert.equal(getBacklogAgeDays('2026-06-14T12:00:00Z', now), 1)
  assert.equal(getBacklogAgeDays('2025-06-15T12:00:00Z', now), 365)
  assert.equal(getBacklogAgeDays('2026-06-16T12:00:00Z', now), 0, 'a clock-skewed future date is never negative')
  assert.equal(getBacklogAgeDays(undefined, now), undefined)
  assert.equal(getBacklogAgeDays('', now), undefined)
  assert.equal(getBacklogAgeDays('not a date', now), undefined)
})

test('a ranked bug carries its sprint, which never changes the ranking', () => {
  const iterations = [{
    name: 'Sprint 5',
    path: 'Project\\Sprint 5',
    timeFrame: 'current' as const,
    startDate: '2026-06-01',
    finishDate: '2026-06-14',
  }]
  const bugs = [
    createBug({ id: 1, iterationPath: 'Project\\Sprint 5' }),
    createBug({ id: 2, severity: '1 - Critical', iterationPath: 'Project' }),
  ]

  const ranked = rankBacklogBugs(bugs, iterations)
  assert.deepEqual(ranked.map((bug) => [bug.id, bug.sprint.label]), [[2, 'Backlog'], [1, 'This sprint']])
  assert.deepEqual(ranked.map((bug) => bug.id), rankedIds(bugs), 'the same order as without sprints')
  assert.equal(rankBacklogBug(bugs[0]).sprint.label, 'Sprint 5', 'without sprints, the path\'s last segment')
})

test('created date is blank when missing or invalid and otherwise includes the year', () => {
  assert.equal(formatCreatedDate(undefined), '')
  assert.equal(formatCreatedDate(''), '')
  assert.equal(formatCreatedDate('not a date'), '')
  assert.match(formatCreatedDate('2026-06-15T12:00:00Z'), /2026/)
})

test('each ranked bug knows its 1-based rank, and a bug ranked alone is first', () => {
  const ranked = rankBacklogBugs([
    createBug({ id: 1 }),
    createBug({ id: 2, severity: '1 - Critical' }),
    createBug({ id: 3, severity: '2 - High' }),
  ])

  assert.deepEqual(ranked.map((bug) => [bug.id, bug.rank]), [[2, 1], [3, 2], [1, 3]])
  assert.equal(rankBacklogBug(createBug({ id: 4 })).rank, 1)
})

test('the Value meter fills on a log scale between the lowest and highest Value at the minimum effort', () => {
  const highest = rankBacklogBug(createBug({ id: 1, severity: '1 - Critical', priority: 1, effort: 1 })).value
  const lowest = rankBacklogBug(createBug({ id: 2 })).value

  assert.equal(getValueMeterPercent(highest), 100)
  assert.equal(getValueMeterPercent(highest * 10), 100, 'never past full')
  assert.equal(getValueMeterPercent(lowest), 4, 'the lowest keeps a sliver')
  assert.equal(getValueMeterPercent(lowest / 10), 4, 'a larger effort cannot empty it')
  assert.equal(getValueMeterPercent(0), 4)
  assertValue(getValueMeterPercent(Math.sqrt(highest * lowest)), 50)
})

test('Value tooltip numbers round to one decimal and drop it for whole numbers', () => {
  assert.deepEqual([4.84, 10.648, 8, 96.8, 212.96, 12.5, 0.25, 100].map(formatValueTerm), [
    '4.8', '10.6', '8', '96.8', '213', '12.5', '0.3', '100',
  ])
})

test('a severity shows as a level and name, or as written when the Value cannot read it', () => {
  assert.deepEqual(getSeverityDisplay('1 - Critical'), { level: 1, name: 'Critical', label: 'S1 · Critical' })
  assert.deepEqual(getSeverityDisplay(' 4 - Low '), { level: 4, name: 'Low', label: 'S4 · Low' })
  assert.deepEqual(getSeverityDisplay('2'), { level: 2, name: 'High', label: 'S2 · High' })
  assert.deepEqual(getSeverityDisplay('Blocker'), { level: undefined, name: 'Blocker', label: 'Blocker' })
  assert.deepEqual(getSeverityDisplay('5 - Trivial'), { level: undefined, name: '5 - Trivial', label: '5 - Trivial' })
  assert.equal(getSeverityDisplay(undefined), undefined)
  assert.equal(getSeverityDisplay('  '), undefined)
})

test('an impact level says how many users hit the bug', () => {
  assert.deepEqual([1, 2, 3, 4].map(getImpactDescription), [
    'most users hit it', 'many users hit it', 'some users hit it', 'few users hit it',
  ])
  assert.equal(getImpactDescription(5), undefined)
  assert.equal(getImpactDescription(undefined), undefined)
})

test('the Value tooltip shows the sum with rounded terms and where each term came from', () => {
  const bug = rankBacklogBug(createBug({ id: 1, severity: '2 - High', priority: 1, effort: 2 }))

  assert.deepEqual(describeBacklogValue(bug), [
    'Value 96.8 = 4.8 × 8 ÷ 4 × 10',
    'Severity 2 - High → 4.8',
    'Impact 1, most users hit it → 8',
    'Effort 2 pts, raised to the minimum 4',
  ])
})

test('the Value tooltip says which inputs it assumed, and never explains tie-breaks', () => {
  const bare = rankBacklogBug(createBug({ id: 1 }))
  assert.deepEqual(describeBacklogValue(bare), [
    'Value 2.5 = 1 × 1 ÷ 4 × 10',
    'Severity not set, counted as 4 - Low → 1',
    'Impact not set, counted as 4 → 1',
    'Effort not set, counted as 4 pts',
  ])

  const unreadable = rankBacklogBug(createBug({ id: 2, severity: 'Blocker', priority: 7, effort: 12.5 }))
  assert.deepEqual(describeBacklogValue(unreadable), [
    'Value 0.8 = 1 × 1 ÷ 12.5 × 10',
    'Severity "Blocker" has no level, counted as 4 - Low → 1',
    'Impact 7 has no level, counted as 4 → 1',
    'Effort 12.5 pts',
  ])

  const tied = rankBacklogBugs([createBug({ id: 3 }), createBug({ id: 4 })])
  for (const bug of tied) {
    assert.doesNotMatch(describeBacklogValue(bug).join('\n'), /tie|older|severity first/i)
  }
})
