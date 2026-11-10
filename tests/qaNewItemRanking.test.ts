import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { WorkItemSummary, WorkItemUpdate } from '../src/ado/types.ts'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { bucketQualityAssuranceItems, getNewQaItemAttentionScore, resolveQualityAssuranceProjectConfig } =
  await server.ssrLoadModule('/src/features/standup/utils/qualityAssuranceBuckets.ts')
const now = Date.parse('2026-11-10T12:00:00Z')
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString()
const config = resolveQualityAssuranceProjectConfig({ id: 'team', projectName: 'project' })
const item = (id: number, days = 1, overrides: Partial<WorkItemSummary> = {}): WorkItemSummary => ({
  id, title: `Item ${id}`, status: 'New', state: 'New', createdAt: daysAgo(days), ...overrides,
})
const score = (candidate: WorkItemSummary, updates: WorkItemUpdate[] = [], historyAvailable = true) =>
  getNewQaItemAttentionScore(candidate, updates, config, historyAvailable, now)
const progress = (field: string, days = 1): WorkItemUpdate => ({
  revisedDate: daysAgo(days), fields: { [field]: { oldValue: 'before', newValue: 'after' } },
})
const ids = (items: WorkItemSummary[]) => items.map(({ id }) => id)

test('fresh reports lead old IDs and sprint labels; freshness halves every seven days', (t) => {
  t.mock.method(Date, 'now', () => now)
  const bugs = [
    item(1, 20, { sprintName: 'Sprint 1' }),
    item(2, 14, { sprintName: 'Sprint 1' }),
    item(3, 0, { sprintName: 'Sprint 99' }),
    item(4, 7, { sprintName: 'Sprint 2' }),
  ]
  assert.deepEqual(ids(bucketQualityAssuranceItems(bugs, {}, config)[0].items), [3, 4, 2, 1])
  assert.equal(score(item(1, 0)), 120)
  assert.equal(score(item(1, 7)), 70)
  assert.equal(score(item(1, 14)), 45)
  assert.deepEqual(ids(bugs), [1, 2, 3, 4], 'ranking does not mutate the supplied list')
})

test('a brand-new ordinary report outranks even an old, critical, priority-one triage item', () => {
  assert.ok(score(item(2, 0)) > score(item(1, 20, { tags: ['Triage'], severity: '1 - Critical', priority: 1 })))
})

test('configured Newly added tags boost attention, using classification normalization and no duplicate bonuses', () => {
  const base = score(item(1))
  assert.equal(score(item(1, 1, { tags: [' TRIAGE ', 'triage'] })), base + 25)
  assert.equal(score(item(1, 1, { tags: ['Triage later'] })), base)
  const custom = { ...config, tagGroups: { ...config.tagGroups, new: ['Needs   review'] } }
  assert.equal(getNewQaItemAttentionScore(item(1, 1, { tags: [' needs review '] }), [], custom, true, now), base + 25)
  assert.equal(getNewQaItemAttentionScore(item(1, 1, { tags: ['Triage'] }), [], custom, true, now), base)
  const cleared = { ...config, tagGroups: { ...config.tagGroups, new: [] } }
  assert.equal(getNewQaItemAttentionScore(item(1, 1, { tags: ['Triage'] }), [], cleared, true, now), base)
})

for (const field of ['System.State', 'System.AssignedTo', 'System.IterationPath']) {
  test(`recent ${field} changes reduce the untouched bonus, but creation does not`, () => {
    const candidate = item(1, 10)
    const base = score(candidate)
    assert.equal(score(candidate, [progress(field)]), base - 20)
    assert.equal(score(candidate, [progress(field, 3)]), base - 20, 'the three-day boundary counts')
    assert.equal(score(candidate, [progress(field, 3 + 1 / 86_400_000)]), base, 'older progress does not count')
    assert.equal(score(candidate, [progress(field, 10)]), base, 'initial values are creation, not follow-up')
    assert.equal(score(candidate, [progress(field, 11)]), base, 'pre-creation history is ignored')
    assert.equal(score(candidate, [progress(field, -1)]), base, 'future activity is not follow-up')
    assert.equal(score(candidate, [{ revisedDate: daysAgo(1), fields: { [field]: { oldValue: 'same', newValue: 'same' } } }]), base)
    assert.equal(score(candidate, [progress(field, 2), progress(field, 9)].reverse()), base - 20, 'history order is irrelevant')
  })
}

test('comments, description edits, tag edits, and backlog reordering do not imply triage progress', () => {
  const candidate = item(1, 10, { recentActivityAt: daysAgo(0) })
  for (const field of ['System.Description', 'System.Tags', 'System.History', 'Microsoft.VSTS.Common.BacklogPriority']) {
    assert.equal(score(candidate, [progress(field)]), score(candidate))
  }
  assert.equal(score(candidate, [], false), score(candidate) - 20, 'unknown history is not proof of no follow-up')
  assert.equal(score(candidate, [{ revisedDate: 'invalid', fields: progress('System.State').fields }]), score(candidate) - 20,
    'invalid history timestamps use the existing ChangedDate fallback when available')
})

test('creation revisions are not follow-up even with fallback dates; revision ChangedDate is authoritative', () => {
  const candidate = item(1, 10, { recentActivityAt: daysAgo(0) })
  const creation = {
    revisedDate: '9999-01-01T00:00:00Z',
    fields: {
      'System.Rev': { newValue: 1 },
      'System.State': { newValue: 'New' },
      'System.AssignedTo': { newValue: 'Original owner' },
    },
  }
  assert.equal(score(candidate, [creation]), score(candidate))
  assert.equal(score(candidate, [{
    ...progress('System.State'),
    fields: { ...progress('System.State').fields, 'System.ChangedDate': { newValue: daysAgo(5) } },
  }]), score(candidate), 'an old revision cannot look like recent progress because of its revisedDate')
})

test('severity and priority increase attention independently without assuming missing values are important', () => {
  const candidate = item(1)
  const base = score(candidate)
  for (const [level, severityPoints, priorityPoints] of [[1, 20, 15], [2, 12, 8], [3, 4, 3], [4, 0, 0]]) {
    assert.equal(score({ ...candidate, severity: `${level} - Level` }), base + severityPoints)
    assert.equal(score({ ...candidate, priority: level }), base + priorityPoints)
    assert.equal(score({ ...candidate, severity: String(level), priority: level }), base + severityPoints + priorityPoints)
  }
  for (const severity of ['Critical', '0', '5 - Other', '1garbage', '', undefined]) {
    assert.equal(score({ ...candidate, severity }), base)
  }
  for (const priority of [0, 5, NaN, Infinity, 1.5, undefined]) {
    assert.equal(score({ ...candidate, priority }), base)
  }
})

test('missing, malformed, and future creation dates earn no freshness points and scores stay finite', () => {
  for (const createdAt of [undefined, 'invalid', daysAgo(-1)]) {
    assert.equal(score(item(1, 1, { createdAt })), 20)
  }
})

test('equal attention sorts by creation descending, then ID descending, consistently across refreshes', (t) => {
  t.mock.method(Date, 'now', () => now)
  const candidates = [item(2), item(3), item(1)]
  assert.deepEqual(ids(bucketQualityAssuranceItems(candidates, {}, config)[0].items), [3, 2, 1])
  assert.deepEqual(ids(bucketQualityAssuranceItems([...candidates].reverse(), {}, config)[0].items), [3, 2, 1])
})

test('ranking retains membership and uses unavailable-history information without changing other column ordering', (t) => {
  t.mock.method(Date, 'now', () => now)
  const candidates = [
    item(1, 1), item(2, 1),
    item(4, 1, { state: 'Available for Testing', sprintName: 'Sprint 2' }),
    item(3, 1, { state: 'Available for Testing', sprintName: 'Sprint 1' }),
    item(5, 45, { state: 'New' }),
  ]
  const result = bucketQualityAssuranceItems(candidates, {}, config, [2])
  assert.deepEqual(ids(result[0].items), [1, 2], 'failed history earns no untouched bonus, but the fresh item stays visible')
  assert.deepEqual(ids(result.find(({ id }: { id: string }) => id === 'needs-testing')!.items), [3, 4])
  assert.ok(!result.flatMap(({ items }: { items: WorkItemSummary[] }) => items).some(({ id }: { id: number }) => id === 5),
    'ranking does not admit old items that classification excluded')
})
