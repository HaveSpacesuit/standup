import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'

for (const name of ['localStorage', 'sessionStorage']) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value: { getItem: () => null } })
  after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  })
}

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())

const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { formatLaneFlag, getBoardAttention } = await server.ssrLoadModule('/src/features/standup/components/boardAttention.ts')
const { describeLaneLoad, getLaneSummary } = await server.ssrLoadModule('/src/features/standup/components/laneSummary.ts')
const { KanbanBoardGrid } = await server.ssrLoadModule('/src/features/standup/components/KanbanBoardGrid.tsx')
const { getBoardLayout } = await server.ssrLoadModule('/src/features/standup/utils/boardLayout.ts')

function withDocument<T>(html: string, read: (document: Document) => T): T {
  const dom = new JSDOM(html)
  try {
    for (const style of dom.window.document.querySelectorAll('style')) style.remove()
    return read(dom.window.document)
  } finally {
    dom.window.close()
  }
}

const failingChecks = { state: 'failing', checks: [{ name: 'Build', state: 'failing', optional: false, expired: false, source: 'policy' }] }
const passingChecks = { state: 'passing', checks: [{ name: 'Build', state: 'passing', optional: false, expired: false, source: 'policy' }] }

function card(id: number, status: string, extra: Record<string, unknown> = {}) {
  return { id, title: `Card ${id}`, state: status, status, workItemType: 'Task', effort: 2, sprintName: 'Sprint 1', ...extra }
}

function pr(id: number, extra: Record<string, unknown> = {}) {
  return { id, title: `PR ${id}`, url: `https://example.test/pr/${id}`, approvalCount: 2, checks: passingChecks, ...extra }
}

const alexCells = {
  'alex:Blocked': [card(1, 'Blocked', { effort: 3 })],
  'alex:Active': [
    card(2, 'Active', { activePullRequests: [pr(20, { checks: failingChecks })] }),
    card(3, 'Active', { activePullRequests: [pr(30, { approvalCount: 1 })], effort: undefined }),
  ],
  'alex:Review': [card(4, 'Review', { kind: 'pull-request', pullRequest: pr(40), effort: undefined })],
  'alex:Done': [card(5, 'Done', { effort: 8 }), card(6, 'Done')],
}

function attentionFor(cardsByCell: Record<string, unknown[]>, highlights: Record<number, string> = {}) {
  return getBoardAttention([{ key: 'alex' }], cardsByCell, highlights, undefined)
}

test('a lane summary counts open work and its effort, leaving Done out of both', () => {
  const summary = getLaneSummary('alex', alexCells, attentionFor(alexCells).signalsByItemId)

  assert.deepEqual(summary.statusCounts, { Blocked: 1, New: 0, Active: 2, Review: 1, Done: 2 })
  assert.equal(summary.openCount, 4)
  assert.equal(summary.openEffort, 5)
})

test('lane flags run most urgent first and skip recently changed', () => {
  const summary = getLaneSummary('alex', alexCells, attentionFor(alexCells, { 1: 'new', 2: 'new' }).signalsByItemId)

  assert.deepEqual(
    summary.flags.map(({ facet, count }: { facet: { key: string }; count: number }) => [facet.key, count]),
    [['blocked', 1], ['failing', 1], ['approval', 1], ['ready', 1]],
  )
})

test('lane flags and load bars read as plain sentences', () => {
  assert.equal(formatLaneFlag('failing', 1), '1 failing check')
  assert.equal(formatLaneFlag('failing', 2), '2 failing checks')
  assert.equal(formatLaneFlag('approval', 1), '1 needs approval')
  assert.equal(formatLaneFlag('approval', 3), '3 need approval')
  assert.equal(formatLaneFlag('idle', 2), '2 idle 3d+')

  assert.equal(describeLaneLoad({ Blocked: 0, New: 1, Active: 3, Review: 0, Done: 2 }), 'Cards by column: New 1, Active 3, Done 2')
  assert.equal(describeLaneLoad({ Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 }), 'No cards')
})

const emptyStatusCounts = { Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 }

function renderGrid(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(Root, null, createElement(KanbanBoardGrid, {
    layout: getBoardLayout(true),
    rows: [{ key: 'alex', label: 'Alex Example' }, { key: 'blair', label: 'Blair Nguyen' }],
    cardsByCell: alexCells,
    expandedCells: {},
    currentIterationName: null,
    statusItemCounts: { Blocked: 1, New: 0, Active: 2, Review: 1, Done: 2 },
    statusEffortTotals: emptyStatusCounts,
    onSetCellExpanded: () => {},
    changeHighlightsByItemId: {},
    rolledOverItemIds: {},
    signalsByItemId: attentionFor(alexCells).signalsByItemId,
    onToggleRowCollapsed: () => {},
    onSetAllRowsCollapsed: () => {},
    ...overrides,
  })))
}

function laneToggle(document: Document, name: string) {
  return [...document.querySelectorAll('button[aria-expanded]')].find((button) => button.getAttribute('aria-label')?.endsWith(name))
}

test('an expanded lane head summarizes the lane and shows its two most urgent flags', () => {
  withDocument(renderGrid(), (document) => {
    const toggle = laneToggle(document, 'Alex Example')
    assert.equal(toggle?.getAttribute('aria-label'), 'Collapse Alex Example')
    assert.equal(toggle?.getAttribute('aria-expanded'), 'true')

    const head = document.querySelector('[data-lane="alex"]')
    assert.equal(head?.querySelector('[role="img"]')?.getAttribute('aria-label'), 'Cards by column: Blocked 1, Active 2, Review 1, Done 2')
    assert.match(head?.textContent ?? '', /4 open · 5 pts/)
    assert.match(head?.textContent ?? '', /4 open cards, 5 points/)
    assert.deepEqual(
      [...(head?.querySelectorAll('[data-lane-flag]') ?? [])].map((flag) => [flag.getAttribute('data-lane-flag'), flag.textContent]),
      [['blocked', '1 blocked'], ['failing', '1 failing check']],
    )
    assert.equal(head?.querySelector('ul')?.getAttribute('aria-label'), 'Needs attention')

    assert.match(document.querySelector('[data-lane="blair"]')?.textContent ?? '', /Nothing open/)
    assert.equal(document.querySelector('[data-lane="blair"] [data-lane-flag]'), null)
    assert.equal(document.querySelectorAll('[data-development-card]').length, 6)
  })
})

test('a collapsed lane trades its cards for one summary per column', () => {
  const html = renderGrid({ collapsedRowKeys: new Set(['alex']), highlightedItemIds: new Set([2]) })

  withDocument(html, (document) => {
    const toggle = laneToggle(document, 'Alex Example')
    assert.equal(toggle?.getAttribute('aria-label'), 'Expand Alex Example')
    assert.equal(toggle?.getAttribute('aria-expanded'), 'false')
    assert.ok(document.querySelector('[data-lane="alex"]')?.hasAttribute('data-lane-collapsed'))
    assert.equal(document.querySelector('[data-lane="alex"] [role="img"]'), null)
    assert.equal(document.querySelectorAll('[data-development-card]').length, 0)

    // The visible pips, count, and icons are aria-hidden; each cell ends with its spoken summary.
    const summaries = [...document.querySelectorAll('[data-collapsed-cell]')].map((cell) => cell.lastElementChild?.textContent)
    assert.deepEqual(summaries, [
      'Blocked: 1 card',
      'New: none',
      'Active: 2 cards, 1 failing check, 1 needs approval, 1 highlighted',
      'Review: 1 card, 1 ready to complete',
      'Done: 2 cards',
    ])
    assert.equal(document.querySelector('[data-collapsed-cell] [aria-hidden="true"]')?.textContent, '1')
  })
})

test('the corner offers collapse and expand all only when lanes can collapse', () => {
  const labels = (html: string) => withDocument(html, (document) =>
    [...document.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')).filter((label) => label?.endsWith('all lanes')))

  assert.deepEqual(labels(renderGrid()), ['Collapse all lanes', 'Expand all lanes'])
  assert.deepEqual(labels(renderGrid({ onToggleRowCollapsed: undefined, onSetAllRowsCollapsed: undefined })), [])
  withDocument(renderGrid({ onToggleRowCollapsed: undefined, onSetAllRowsCollapsed: undefined }), (document) => {
    assert.equal(document.querySelector('button[aria-expanded]'), null)
  })
})
