import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { WorkItemSummary } from '../src/ado/queryEngine.ts'

// boardRowVisibility.ts imports its siblings without file extensions, so Vite loads it rather than Node directly.
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { getVisibleBoardRows } = await server.ssrLoadModule('/src/features/standup/utils/boardRowVisibility.ts')

type Status = 'Blocked' | 'New' | 'Active' | 'Review' | 'Done'
const card = (id: number, status: Status) => ({ id, title: `Card ${id}`, status }) as WorkItemSummary

const rows = ['empty', 'stale-done', 'fresh-done', 'unknown-done', 'mixed', 'open-stale'].map((key) => ({ key }))
const cardsByCell: Record<string, WorkItemSummary[]> = {
  'stale-done:Done': [card(1, 'Done'), card(2, 'Done')],
  'fresh-done:Done': [card(3, 'Done')],
  'unknown-done:Done': [card(4, 'Done')],
  'mixed:Done': [card(5, 'Done')],
  'mixed:Active': [card(6, 'Active')],
  'open-stale:Review': [card(7, 'Review')],
}
// Card 4 has no highlight yet, as while history is still loading.
const highlights = { 1: 'stale', 2: 'stale', 3: 'new', 5: 'stale', 6: 'none', 7: 'stale' }

const keys = (options: { hideUsersWithNoActivity: boolean; hideUsersWithOnlyStaleDoneWork: boolean }) =>
  getVisibleBoardRows(rows, cardsByCell, highlights, options).map((row: { key: string }) => row.key)

test('no row is hidden unless hideUsersWithNoActivity is on', () => {
  const everyRow = rows.map((row) => row.key)
  assert.deepEqual(keys({ hideUsersWithNoActivity: false, hideUsersWithOnlyStaleDoneWork: false }), everyRow)
  assert.deepEqual(keys({ hideUsersWithNoActivity: false, hideUsersWithOnlyStaleDoneWork: true }), everyRow)
})

test('hideUsersWithNoActivity alone hides only rows without cards', () => {
  assert.deepEqual(
    keys({ hideUsersWithNoActivity: true, hideUsersWithOnlyStaleDoneWork: false }),
    ['stale-done', 'fresh-done', 'unknown-done', 'mixed', 'open-stale'],
  )
})

test('stale done setting also hides rows whose every card is Done and stale', () => {
  assert.deepEqual(
    keys({ hideUsersWithNoActivity: true, hideUsersWithOnlyStaleDoneWork: true }),
    ['fresh-done', 'unknown-done', 'mixed', 'open-stale'],
  )
})

test('stale done setting keeps a row when any card is not both Done and stale', () => {
  const rowCount = (cards: WorkItemSummary[], states: Record<number, string>) => {
    const cells: Record<string, WorkItemSummary[]> = {}
    for (const item of cards) {
      (cells[`row:${item.status}`] ??= []).push(item)
    }
    return getVisibleBoardRows([{ key: 'row' }], cells, states, {
      hideUsersWithNoActivity: true,
      hideUsersWithOnlyStaleDoneWork: true,
    }).length
  }

  assert.equal(rowCount([card(1, 'Done'), card(2, 'Done')], { 1: 'stale', 2: 'stale' }), 0)
  assert.equal(rowCount([card(1, 'Done'), card(2, 'Done')], { 1: 'stale', 2: 'new' }), 1)
  assert.equal(rowCount([card(1, 'Done'), card(2, 'Done')], { 1: 'stale', 2: 'none' }), 1)
  assert.equal(rowCount([card(1, 'Done'), card(2, 'Done')], { 1: 'stale' }), 1)
  for (const status of ['Blocked', 'New', 'Active', 'Review'] as const) {
    assert.equal(rowCount([card(1, 'Done'), card(2, status)], { 1: 'stale', 2: 'stale' }), 1, status)
  }
})

test('row identity and order are preserved', () => {
  const tagged = rows.map((row) => ({ ...row, label: row.key.toUpperCase() }))
  const visible = getVisibleBoardRows(tagged, cardsByCell, highlights, {
    hideUsersWithNoActivity: true,
    hideUsersWithOnlyStaleDoneWork: true,
  })
  assert.deepEqual(visible, [tagged[2], tagged[3], tagged[4], tagged[5]])
})
