import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import type { ResolvedWorkItemAssignee, WorkItemSummary } from '../src/ado/queryEngine.ts'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
})
after(() => server.close())
const { useVisibleBoardItems } = await server.ssrLoadModule('/src/features/standup/hooks/useVisibleBoardItems.ts')

const boardItems: WorkItemSummary[] = [
  { id: 101, title: 'First task', state: 'Active', status: 'Active' },
  { id: 102, title: 'Second task', state: 'New', status: 'New' },
  { id: 103, title: 'Third task', state: 'Done', status: 'Done' },
  { id: 2059722, title: 'Another member’s task', state: 'Active', status: 'Active' },
]
const workItemAssignees: Record<number, ResolvedWorkItemAssignee> = {
  101: { kind: 'team-member', label: 'Bennet Dela Rosa' },
  102: { kind: 'team-member', label: 'Bennet Dela Rosa' },
  103: { kind: 'team-member', label: 'Bennet Dela Rosa' },
  2059722: { kind: 'team-member', label: 'Jacob Gearhart' },
}

function filterBoard(quickFilterInput: string, selectedMemberFilter = 'Bennet Dela Rosa', items = boardItems) {
  function Board() {
    const result = useVisibleBoardItems({ boardItems: items, quickFilterInput, selectedMemberFilter, workItemAssignees })
    return encodeURIComponent(JSON.stringify(result))
  }
  return JSON.parse(decodeURIComponent(renderToStaticMarkup(createElement(Board)))) as {
    memberFilterOptions: string[]
    visibleBoardItems: WorkItemSummary[]
  }
}

test('another member’s matching card leaves an empty intersection and retains the selected option', () => {
  assert.deepEqual(filterBoard('').visibleBoardItems.map((item) => item.id), [101, 102, 103])

  const filtered = filterBoard('2059722')
  assert.deepEqual(filtered.visibleBoardItems, [])
  assert.deepEqual(filtered.memberFilterOptions, ['Bennet Dela Rosa', 'Jacob Gearhart'])

  assert.deepEqual(filterBoard('').visibleBoardItems.map((item) => item.id), [101, 102, 103])
})

test('zero quick-filter matches and empty board data retain the selected member option', () => {
  for (const result of [filterBoard('no matching cards'), filterBoard('', 'Bennet Dela Rosa', [])]) {
    assert.deepEqual(result.visibleBoardItems, [])
    assert.deepEqual(result.memberFilterOptions, ['Bennet Dela Rosa'])
  }
})

test('quick text and member filters are combined with AND', () => {
  assert.deepEqual(filterBoard('  FIRST TASK  ').visibleBoardItems.map((item) => item.id), [101])
  assert.deepEqual(filterBoard('Jacob Gearhart').visibleBoardItems, [])
})

test('explicitly changing or clearing the member filter permits another member’s matching cards', () => {
  for (const selectedMember of ['Jacob Gearhart', '']) {
    assert.deepEqual(
      filterBoard('2059722', selectedMember).visibleBoardItems.map((item) => item.id),
      [2059722],
    )
  }
  assert.deepEqual(filterBoard('', '').visibleBoardItems, boardItems)
})
