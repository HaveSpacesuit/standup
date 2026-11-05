import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { BacklogBug } from '../src/ado/types.ts'

// The modules import their siblings without file extensions, so Vite loads them rather than Node directly.
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const {
  BACKLOG_FACET_KEYS,
  countBacklogFacets,
  formatAgingPeriod,
  getBacklogFacetMatches,
  getBacklogFacets,
  matchesBacklogFacet,
  summarizeBacklog,
} = await server.ssrLoadModule('/src/features/standup/utils/backlogAttention.ts')
const { rankBacklogBugs } = await server.ssrLoadModule('/src/features/standup/utils/backlogValue.ts')

const thresholds = { top: 80, high: 30, medium: 12 }
const now = Date.parse('2026-06-10T12:00:00Z')
const context = { agingMonths: 12, now }

const path = (name: string) => `Project\\Team\\2026\\${name}`
const iterations = [
  { name: 'Sprint 4', path: path('Sprint 4'), timeFrame: 'past', startDate: '2026-05-18', finishDate: '2026-05-29' },
  { name: 'Sprint 5', path: path('Sprint 5'), timeFrame: 'current', startDate: '2026-06-01', finishDate: '2026-06-12' },
  { name: 'Sprint 7', path: path('Sprint 7'), timeFrame: 'future', startDate: '2026-06-29', finishDate: '2026-07-10' },
  { name: 'Sprint 6', path: path('Sprint 6'), timeFrame: 'future', startDate: '2026-06-15', finishDate: '2026-06-26' },
]

function createBug(overrides: Partial<BacklogBug> & { id: number }): BacklogBug {
  return {
    title: `Bug ${overrides.id}`,
    workItemUrl: `https://dev.azure.com/org/project/_workitems/edit/${overrides.id}`,
    state: 'Active',
    severity: '3 - Medium',
    priority: 2,
    effort: 2,
    createdAt: '2026-05-01T00:00:00Z',
    ...overrides,
  }
}

const rankOne = (overrides: Partial<BacklogBug> & { id: number }) => rankBacklogBugs([createBug(overrides)], iterations)[0]
const matches = (overrides: Partial<BacklogBug> & { id: number }, key: string, agingMonths = 12) =>
  matchesBacklogFacet(rankOne(overrides), key, { agingMonths, now })

test('the aging period reads in whole years when it can', () => {
  assert.deepEqual([1, 6, 12, 18, 24, 36].map(formatAgingPeriod), ['1 month', '6 months', '1 year', '18 months', '2 years', '3 years'])
})

test('the facets come in bar order, and the age facet names the team\'s period', () => {
  const facets = getBacklogFacets(12)
  assert.deepEqual(facets.map((facet: { key: string }) => facet.key), [...BACKLOG_FACET_KEYS])
  assert.deepEqual(facets.map((facet: { label: string }) => facet.label), [
    'Severe, not planned',
    'In an ended sprint',
    'Missing severity or impact',
    'No effort',
    'Older than 1 year',
  ])
  assert.equal(getBacklogFacets(6).at(-1).label, 'Older than 6 months')
  assert.match(getBacklogFacets(6).at(-1).description, /Still New after 6 months\./)
})

test('a severe bug is flagged only while it is not planned for this sprint or the next', () => {
  assert.equal(matches({ id: 1, severity: '1 - Critical', priority: 3 }, 'severe'), true, 'S1 at any impact')
  assert.equal(matches({ id: 2, severity: '2 - High', priority: 1 }, 'severe'), true, 'S2 with Impact 1')
  assert.equal(matches({ id: 3, severity: '2 - High', priority: 2 }, 'severe'), false, 'S2 with a lower impact')
  assert.equal(matches({ id: 4, severity: '3 - Medium', priority: 1 }, 'severe'), false)

  const severe = { severity: '1 - Critical', priority: 1 }
  assert.equal(matches({ id: 5, ...severe, iterationPath: path('Sprint 5') }, 'severe'), false, 'this sprint')
  assert.equal(matches({ id: 6, ...severe, iterationPath: path('Sprint 6') }, 'severe'), false, 'the next sprint')
  assert.equal(matches({ id: 7, ...severe, iterationPath: path('Sprint 7') }, 'severe'), true, 'a sprint after next is not planned yet')
  assert.equal(matches({ id: 8, ...severe, iterationPath: path('Sprint 4') }, 'severe'), true, 'an ended sprint')
})

test('a bug is flagged in an ended sprint only when its sprint has ended', () => {
  assert.equal(matches({ id: 1, iterationPath: path('Sprint 4') }, 'ended'), true)
  for (const iterationPath of [path('Sprint 5'), path('Sprint 6'), 'Project', undefined]) {
    assert.equal(matches({ id: 2, iterationPath }, 'ended'), false, String(iterationPath))
  }
})

test('a missing or unreadable severity or impact is flagged, since the Value scores it as the lowest level', () => {
  assert.equal(matches({ id: 1 }, 'missing'), false)
  assert.equal(matches({ id: 2, severity: undefined }, 'missing'), true)
  assert.equal(matches({ id: 3, severity: 'Urgent' }, 'missing'), true, 'no level the Value can read')
  assert.equal(matches({ id: 4, priority: undefined }, 'missing'), true)
  assert.equal(matches({ id: 5, priority: 9 }, 'missing'), true, 'no impact level 9')
})

test('a bug without a usable effort is flagged', () => {
  assert.equal(matches({ id: 1, effort: 0.5 }, 'noEffort'), false)
  assert.equal(matches({ id: 2, effort: undefined }, 'noEffort'), true)
  assert.equal(matches({ id: 3, effort: Number.NaN }, 'noEffort'), true)
})

test('a New bug is old once it has been open the team\'s number of months', () => {
  assert.equal(matches({ id: 1, state: 'New', createdAt: '2025-06-10T12:00:00Z' }, 'old'), true, 'exactly a year')
  assert.equal(matches({ id: 2, state: 'New', createdAt: '2025-06-11T12:00:00Z' }, 'old'), false, 'a day short of a year')
  assert.equal(matches({ id: 3, state: ' new ', createdAt: '2024-01-01T00:00:00Z' }, 'old'), true, 'the state reads without regard to case')
  assert.equal(matches({ id: 4, state: 'Active', createdAt: '2024-01-01T00:00:00Z' }, 'old'), false, 'only New bugs')
  assert.equal(matches({ id: 5, state: 'New', createdAt: undefined }, 'old'), false, 'no created date')
  assert.equal(matches({ id: 6, state: 'New', createdAt: '2026-01-01T00:00:00Z' }, 'old', 3), true, 'the period follows the options')
  assert.equal(matches({ id: 7, state: 'New', createdAt: '2026-04-01T00:00:00Z' }, 'old', 3), false)
})

test('facet counts and matches cover every bug that shows the signal', () => {
  const bugs = rankBacklogBugs([
    createBug({ id: 1, severity: '1 - Critical', priority: 1, effort: undefined }),
    createBug({ id: 2, iterationPath: path('Sprint 4'), severity: undefined }),
    createBug({ id: 3, state: 'New', createdAt: '2024-02-01T00:00:00Z', effort: undefined }),
    createBug({ id: 4, iterationPath: path('Sprint 5') }),
  ], iterations)

  assert.deepEqual(countBacklogFacets(bugs, context), { severe: 1, ended: 1, missing: 1, noEffort: 2, old: 1 })
  assert.deepEqual([...getBacklogFacetMatches(bugs, 'noEffort', context)].sort(), [1, 3])
  assert.deepEqual([...getBacklogFacetMatches(bugs, 'old', context)], [3])
  assert.deepEqual(countBacklogFacets([], context), { severe: 0, ended: 0, missing: 0, noEffort: 0, old: 0 })
})

test('the summary counts the backlog by tier, severity, and sprint, with its effort, new bugs, and median age', () => {
  const bugs = rankBacklogBugs([
    createBug({ id: 1, severity: '1 - Critical', priority: 1, effort: 1, iterationPath: path('Sprint 5'), createdAt: '2026-06-01T09:00:00Z' }),
    createBug({ id: 2, severity: '2 - High', priority: 2, effort: 3, iterationPath: path('Sprint 6'), createdAt: '2026-06-08T09:00:00Z' }),
    createBug({ id: 3, severity: '3 - Medium', priority: 3, effort: undefined, iterationPath: path('Sprint 4'), createdAt: '2026-05-31T09:00:00Z' }),
    createBug({ id: 4, severity: 'Urgent', priority: 4, effort: 8, iterationPath: path('Sprint 7'), createdAt: '2026-05-01T12:00:00Z' }),
    createBug({ id: 5, severity: '4 - Low', priority: 4, effort: 5, createdAt: undefined }),
  ], iterations)

  const summary = summarizeBacklog(bugs, thresholds, iterations, now)
  assert.equal(summary.openCount, 5)
  assert.equal(summary.effortTotal, 17)
  assert.equal(summary.unestimatedCount, 1)
  assert.equal(Object.values(summary.tierCounts).reduce((sum: number, count) => sum + (count as number), 0), 5)
  assert.equal(summary.tierCounts.top, 1, 'the S1, Impact 1, 1-point bug')
  assert.deepEqual(summary.severityCounts, { 1: 1, 2: 1, 3: 1, 4: 1 })
  assert.equal(summary.severityNotSetCount, 1, 'an unreadable severity is not set')
  assert.equal(summary.currentSprint?.name, 'Sprint 5')
  assert.equal(summary.nextSprint?.name, 'Sprint 6', 'the earliest future sprint, whatever the list order')
  assert.equal(summary.hasSprints, true)
  assert.deepEqual(
    [summary.plannedThisSprint, summary.plannedNextSprint, summary.inEndedSprints],
    [1, 1, 1],
    'a sprint after next is neither planned nor ended',
  )
  assert.equal(summary.newThisSprint, 2, 'created on or after the sprint started on June 1')
  // Ages 9, 2, 10, and 40 days: the median of an even count is the floor of the middle two.
  assert.equal(summary.medianAgeDays, 9)
})

test('the median of an odd count is its middle age', () => {
  const bugs = rankBacklogBugs([
    createBug({ id: 1, createdAt: '2026-06-09T12:00:00Z' }),
    createBug({ id: 2, createdAt: '2026-06-05T12:00:00Z' }),
    createBug({ id: 3, createdAt: '2026-01-01T12:00:00Z' }),
  ], iterations)
  assert.equal(summarizeBacklog(bugs, thresholds, iterations, now).medianAgeDays, 5)
})

test('without sprints the summary leaves out the sprint counts, and an empty backlog has no median age', () => {
  const bugs = rankBacklogBugs([createBug({ id: 1, iterationPath: path('Sprint 5') })], [])
  const summary = summarizeBacklog(bugs, thresholds, [], now)
  assert.equal(summary.hasSprints, false)
  assert.equal(summary.currentSprint, undefined)
  assert.equal(summary.nextSprint, undefined)
  assert.equal(summary.newThisSprint, undefined)
  assert.equal(summary.plannedThisSprint, 0)

  const empty = summarizeBacklog([], thresholds, iterations, now)
  assert.equal(empty.openCount, 0)
  assert.equal(empty.medianAgeDays, undefined)
  assert.equal(empty.newThisSprint, 0, 'a current sprint with no new bugs')
})
