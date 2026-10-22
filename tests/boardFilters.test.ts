import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as ts from 'typescript'
import { createElement, memo, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import type { ResolvedWorkItemAssignee, WorkItemSummary } from '../src/ado/queryEngine.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
})
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

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
after(() => {
  server.close()
  dom.window.close()
})
const { useVisibleBoardItems } = await server.ssrLoadModule('/src/features/standup/hooks/useVisibleBoardItems.ts')
const { useQualityAssurancePageModel } = await server.ssrLoadModule('/src/features/standup/hooks/useQualityAssurancePageModel.ts')
const { parseStoredQaOptions } = await server.ssrLoadModule('/src/features/standup/utils/qaOptions.ts')
const { createRoot } = await import('react-dom/client')
const { flushSync } = await import('react-dom')

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

test('large boards retain the unique matching work item alongside PR-only cards', () => {
  const workItems: WorkItemSummary[] = Array.from({ length: 1000 }, (_, index) => ({
    id: 9000000 + index,
    title: `Work item ${index}`,
    state: 'Active',
    status: 'Active',
    sprintName: 'Current sprint',
    iterationPath: 'Project\\Team\\Current sprint',
  }))
  const pullRequestItems: WorkItemSummary[] = Array.from({ length: 200 }, (_, index) => ({
    id: 9100000 + index,
    kind: 'pull-request',
    title: `Pull request ${index}`,
    status: 'Review',
    pullRequest: {
      id: 9200000 + index,
      title: `Pull request ${index}`,
      url: `https://example.test/pull-request/${index}`,
    },
  }))

  assert.deepEqual(
    filterBoard('0999', '', [...workItems, ...pullRequestItems]).visibleBoardItems.map((item) => item.id),
    [9000999],
  )
})

test('client filtering keeps typing responsive and avoids rerendering unchanged cards', async () => {
  const workItems: WorkItemSummary[] = Array.from({ length: 1000 }, (_, index) => ({
    id: 9000000 + index,
    title: `Work item ${index}`,
    state: 'Active',
    status: 'Active',
  }))
  const pullRequestItems: WorkItemSummary[] = Array.from({ length: 200 }, (_, index) => ({
    id: 9100000 + index,
    kind: 'pull-request',
    title: `Pull request ${index}`,
    status: 'Review',
    pullRequest: {
      id: 9200000 + index,
      title: `Pull request ${index}`,
      url: `https://example.test/pull-request/${index}`,
    },
  }))
  const items = [...workItems, ...pullRequestItems]

  const cardRenderCounts = new Map<number, number>()
  const cardSource = readFileSync(new URL('../src/features/standup/components/WorkItemCard.tsx', import.meta.url), 'utf8')
  assert.match(cardSource, /export const WorkItemCard = memo\(/)
  const MemoizedCard = memo(function CountedCard({ item }: { item: WorkItemSummary }) {
    cardRenderCounts.set(item.id, (cardRenderCounts.get(item.id) ?? 0) + 1)
    return createElement('div', { 'data-card-id': item.id })
  })

  function ClientBoard() {
    const [quickFilterInput, setQuickFilterInput] = useState('')
    const { visibleBoardItems } = useVisibleBoardItems({
      boardItems: items,
      quickFilterInput,
      selectedMemberFilter: '',
      workItemAssignees: {},
    })

    return createElement(
      'div',
      null,
      createElement('input', {
        'aria-label': 'Quick filter',
        value: quickFilterInput,
        onChange: (event: { target: { value: string } }) => setQuickFilterInput(event.target.value),
      }),
      createElement('output', { 'data-testid': 'filter-result' }, JSON.stringify(visibleBoardItems.map(({ id }) => id))),
      ...visibleBoardItems
        .filter((item) => item.status === 'Active')
        .slice(0, 3)
        .map((item) => createElement(MemoizedCard, { key: item.id, item })),
    )
  }

  const host = dom.window.document.createElement('div')
  dom.window.document.body.append(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(createElement(ClientBoard)))

    const input = host.querySelector('input')!
    const output = host.querySelector('output')!
    const initialResult = output.textContent
    assert.deepEqual([...cardRenderCounts.entries()], [[9000000, 1], [9000001, 1], [9000002, 1]])

    const setNativeInputValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
    for (const query of ['0', '09', '099', '0999']) {
      flushSync(() => {
        setNativeInputValue.call(input, query)
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      assert.equal(input.value, query)
      assert.equal(output.textContent, initialResult)
      assert.deepEqual([...cardRenderCounts.entries()], [[9000000, 1], [9000001, 1], [9000002, 1]])
    }

    for (let attempt = 0; attempt < 50 && output.textContent !== '[9000999]'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.deepEqual(JSON.parse(output.textContent!), [9000999])
  } finally {
    flushSync(() => root.unmount())
    host.remove()
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
