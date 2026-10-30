import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { BacklogBug } from '../src/ado/types.ts'

// backlogFilter.ts imports its siblings without file extensions, so Vite loads it rather than Node directly.
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { filterBacklogBugs, getBacklogVisibleText, matchesBacklogQuickFilter } =
  await server.ssrLoadModule('/src/features/standup/utils/backlogFilter.ts')
const { formatCreatedDate, rankBacklogBugs } = await server.ssrLoadModule('/src/features/standup/utils/backlogValue.ts')

function createBug(overrides: Partial<BacklogBug> & { id: number }): BacklogBug {
  return {
    title: `Bug ${overrides.id}`,
    workItemUrl: `https://dev.azure.com/org/project/_workitems/edit/${overrides.id}`,
    ...overrides,
  }
}

// Ranked: 102 (213.0), 103 (11.0), 101 (2.5).
const bugs = rankBacklogBugs([
  createBug({
    id: 101,
    title: 'Minor glitch',
    state: 'New',
    createdAt: '2026-01-10T09:00:00Z',
    iterationPath: 'Project\\Team\\2026\\Sprint 4',
  }),
  createBug({
    id: 102,
    title: 'Data loss on Save',
    state: 'Active',
    createdAt: '2026-03-01T10:00:00Z',
    assignedTo: { displayName: 'Ada Lovelace', uniqueName: 'ada@example.com' },
    iterationPath: 'Project\\Team\\2026\\Sprint 5',
    severity: '1 - Critical',
    priority: 1,
    effort: 4,
  }),
  createBug({
    id: 103,
    title: 'Slow page',
    state: 'Resolved',
    createdAt: '2026-02-01T10:00:00Z',
    assignedTo: { uniqueName: 'grace@example.com' },
    iterationPath: 'Project',
    severity: '3 - Medium',
    priority: 2,
    effort: 8,
  }),
])

const idsFor = (filterText: string) => filterBacklogBugs(bugs, filterText).map((bug) => bug.id)

test('the visible text lists each column as the table shows it, in column order', () => {
  const [critical, , minor] = bugs

  assert.deepEqual(getBacklogVisibleText(critical), [
    '102',
    'Data loss on Save',
    formatCreatedDate('2026-03-01T10:00:00Z'),
    'Ada Lovelace',
    'Active',
    '2026\\Sprint 5',
    '1 - Critical',
    '1',
    '4',
    '213.0',
  ])
  assert.deepEqual(getBacklogVisibleText(minor), [
    '101',
    'Minor glitch',
    formatCreatedDate('2026-01-10T09:00:00Z'),
    '',
    'New',
    '2026\\Sprint 4',
    '',
    '',
    '',
    '2.5',
  ])
})

test('an empty or whitespace-only filter returns the same ranked list', () => {
  assert.equal(filterBacklogBugs(bugs, ''), bugs)
  assert.equal(filterBacklogBugs(bugs, '   '), bugs)
  assert.equal(matchesBacklogQuickFilter(bugs[0], ''), true)
})

test('matching ignores case and surrounding whitespace', () => {
  assert.deepEqual(idsFor('data loss'), [102])
  assert.deepEqual(idsFor('  DATA LOSS  '), [102])
  assert.deepEqual(idsFor('SLOW'), [103])
})

test('every column the table shows can be searched', () => {
  for (const bug of bugs) {
    for (const text of getBacklogVisibleText(bug).filter(Boolean)) {
      assert.ok(
        filterBacklogBugs(bugs, text).some((match) => match.id === bug.id),
        `"${text}" should match bug ${bug.id}`,
      )
    }
  }
})

test('each column narrows to the bugs that show the text', () => {
  assert.deepEqual(idsFor('101'), [101], 'ID')
  assert.deepEqual(idsFor('glitch'), [101], 'Title')
  assert.deepEqual(idsFor(formatCreatedDate('2026-03-01T10:00:00Z')), [102], 'Created Date as displayed')
  assert.deepEqual(idsFor('lovelace'), [102], 'Assigned To')
  assert.deepEqual(idsFor('resolved'), [103], 'State')
  assert.deepEqual(idsFor('2026\\sprint 5'), [102], 'Iteration Path')
  assert.deepEqual(idsFor('critical'), [102], 'Severity')
  assert.deepEqual(idsFor('213.0'), [102], 'Value')
  assert.deepEqual(idsFor('2.5'), [101], 'Value')
})

test('Assigned To matches the unique name only when there is no display name', () => {
  assert.deepEqual(idsFor('grace@example.com'), [103])
  assert.deepEqual(idsFor('ada@example.com'), [])
})

test('Impact and Effort match the numbers as entered, not the effort used for the Value', () => {
  const [prioritized] = rankBacklogBugs([createBug({ id: 9, priority: 3, effort: 12.5 })])
  assert.equal(matchesBacklogQuickFilter(prioritized, '3'), true, 'Impact')
  assert.equal(matchesBacklogQuickFilter(prioritized, '12.5'), true, 'Effort')
  assert.equal(matchesBacklogQuickFilter(prioritized, '12.6'), false)

  const [quickFix] = rankBacklogBugs([createBug({ id: 8, severity: '2 - High', priority: 1, effort: 2 })])
  assert.equal(matchesBacklogQuickFilter(quickFix, '2'), true, 'the entered Effort')
  assert.equal(matchesBacklogQuickFilter(quickFix, '4'), false, 'the minimum effort of 4 is not displayed')
})

test('only the last two iteration path segments are searchable', () => {
  assert.deepEqual(idsFor('sprint 4'), [101])
  assert.deepEqual(idsFor('project'), [103], 'a single-segment path is shown whole')
  assert.deepEqual(idsFor('team'), [], 'a segment that is cut from the display')
  assert.deepEqual(idsFor('project\\team'), [], 'the cut prefix')
})

test('text the table does not show is not searchable', () => {
  assert.deepEqual(idsFor('2026-03-01'), [], 'the raw ISO timestamp behind the date')
  assert.deepEqual(idsFor('212.96'), [], 'the unrounded value')
  assert.deepEqual(idsFor('not set'), [], 'the Not set placeholder text')
  assert.deepEqual(idsFor('—'), [], 'the dash placeholder')
  assert.deepEqual(idsFor('opens in a new tab'), [], 'the link note')
})

test('filtering keeps the ranked order', () => {
  assert.deepEqual(idsFor('2026'), [102, 103, 101], 'every bug shows 2026 in its date')
  assert.deepEqual(idsFor('2026\\sprint'), [102, 101], 'two bugs, still best value first')
})

test('a filter that matches nothing returns an empty list', () => {
  assert.deepEqual(filterBacklogBugs(bugs, 'no such bug'), [])
})

test('a filter that excludes nothing returns the same list, so an unchanged table is not re-rendered', () => {
  assert.equal(filterBacklogBugs(bugs, '2026'), bugs)
  assert.notEqual(filterBacklogBugs(bugs, 'sprint'), bugs)
})
