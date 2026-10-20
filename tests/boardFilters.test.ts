import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import type { ResolvedWorkItemAssignee, WorkItemSummary } from '../src/ado/queryEngine.ts'

const defaultRules = [
  { id: 'default-blocked', tag: 'blocked', action: 'Blocked' },
  { id: 'default-pr', tag: 'pr', action: 'Review' },
]
const source = readFileSync(new URL('../src/features/standup/utils/boardFilters.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
})
const exports: Record<string, Function> = {}

runInNewContext(outputText, {
  exports,
  require: (name: string) => {
    assert.equal(name, '../../../ado/workItemStatus')
    return {
      DEFAULT_TAG_RULES: defaultRules,
      resolveStatusFromStateAndTags() {},
      shouldHideByTagRules() {},
    }
  },
})

test('an explicitly stored empty tag-rule list remains empty', () => {
  assert.equal(exports.parseStoredTagRules('[]').length, 0)
})

test('default tag rules are used when no rules have been stored', () => {
  const parsedRules = exports.parseStoredTagRules(null)
  assert.equal(parsedRules.length, defaultRules.length)
  assert.deepEqual(Array.from(parsedRules, (rule) => ({ ...rule })), defaultRules)
})

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
})
after(() => server.close())
const { useVisibleBoardItems } = await server.ssrLoadModule('/src/features/standup/hooks/useVisibleBoardItems.ts')
const { useQualityAssurancePageModel } = await server.ssrLoadModule('/src/features/standup/hooks/useQualityAssurancePageModel.ts')
const { parseStoredQaOptions } = await server.ssrLoadModule('/src/features/standup/utils/qaOptions.ts')

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

function filterQa(quickFilterInput: string, items: WorkItemSummary[]): WorkItemSummary[] {
  function Board() {
    const result = useQualityAssurancePageModel({
      buckets: [{ id: 'needs-testing', title: 'Ready for QA', items }],
      qaOptions: parseStoredQaOptions(null),
    })
    if (result.quickFilterInput !== quickFilterInput) {
      result.onQuickFilterInputChange(quickFilterInput)
    }
    return encodeURIComponent(JSON.stringify(result.filteredBuckets[0].items))
  }
  return JSON.parse(decodeURIComponent(renderToStaticMarkup(createElement(Board))))
}

const sprintItems: WorkItemSummary[] = [
  { ...boardItems[0], sprintName: '2026 14', iterationPath: 'beconnect\\PW Web\\2026 14' },
  { ...boardItems[1], sprintName: '2026 15', iterationPath: 'beconnect\\PW Web\\2026 15' },
  { ...boardItems[2], sprintName: '2026 14', iterationPath: 'beconnect\\Other Project\\2026 14' },
  { ...boardItems[3] },
]

for (const [surface, filter] of [
  ['Development', (query: string) => filterBoard(query, '', sprintItems).visibleBoardItems],
  ['QA', (query: string) => filterQa(query, sprintItems)],
] as const) {
  test(`${surface} quick filter matches sprint labels and full iteration paths`, () => {
    assert.deepEqual(filter('2026 14').map((item) => item.id), [101, 103])
    for (const query of [
      'beconnect\\PW Web\\2026 14',
      'BEConnect\\pw web\\2026 14',
      '  beconnect\\PW Web\\2026 14  ',
    ]) {
      assert.deepEqual(filter(query).map((item) => item.id), [101])
    }
    assert.deepEqual(filter('beconnect\\PW Web\\2026 99'), [])
    assert.deepEqual(filter('Another member').map((item) => item.id), [2059722])
    assert.deepEqual(filter(''), sprintItems)
  })
}
