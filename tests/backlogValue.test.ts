import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { BacklogBug } from '../src/ado/types.ts'
import {
  compareRankedBacklogBugs,
  formatBacklogValue,
  formatCreatedDate,
  formatIterationPath,
  getAdjustedEffort,
  getImpactScore,
  getSeverityScore,
  rankBacklogBug,
  rankBacklogBugs,
} from '../src/features/standup/utils/backlogValue.ts'

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

test('iteration path keeps only the last two segments', () => {
  assert.equal(formatIterationPath('Project\\Team\\2026\\Sprint 5'), '2026\\Sprint 5')
  assert.equal(formatIterationPath('Project\\Sprint 5'), 'Project\\Sprint 5')
  assert.equal(formatIterationPath('Project'), 'Project')
  assert.equal(formatIterationPath('\\Project\\Team\\Sprint 5\\'), 'Team\\Sprint 5')
  assert.equal(formatIterationPath(' Project \\ Team \\ Sprint 5 '), 'Team\\Sprint 5')
  assert.equal(formatIterationPath(''), '')
  assert.equal(formatIterationPath(undefined), '')
})

test('created date is blank when missing or invalid and otherwise includes the year', () => {
  assert.equal(formatCreatedDate(undefined), '')
  assert.equal(formatCreatedDate(''), '')
  assert.equal(formatCreatedDate('not a date'), '')
  assert.match(formatCreatedDate('2026-06-15T12:00:00Z'), /2026/)
})
