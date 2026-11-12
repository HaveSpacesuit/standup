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
const attention = await server.ssrLoadModule('/src/features/standup/components/boardAttention.ts')
const { AttentionBar } = await server.ssrLoadModule('/src/features/standup/components/AttentionBar.tsx')
const { KanbanBoardGrid } = await server.ssrLoadModule('/src/features/standup/components/KanbanBoardGrid.tsx')
const { getBoardLayout } = await server.ssrLoadModule('/src/features/standup/utils/boardLayout.ts')

function render(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(createElement(Root, null, element))
}

function withDocument<T>(html: string, read: (document: Document) => T): T {
  const dom = new JSDOM(html)
  try {
    for (const style of dom.window.document.querySelectorAll('style')) style.remove()
    return read(dom.window.document)
  } finally {
    dom.window.close()
  }
}

const alex = { uniqueName: 'alex@example.test', displayName: 'Alex Example' }
const quinn = { uniqueName: 'quinn@example.test', displayName: 'Quinn QA' }

const passingChecks = { state: 'passing', checks: [{ name: 'Build', state: 'passing', optional: false, expired: false, source: 'policy' }] }
const failingChecks = { state: 'failing', checks: [{ name: 'Build', state: 'failing', optional: false, expired: false, source: 'policy' }] }
const optionalFailingChecks = {
  state: 'passing',
  checks: [
    { name: 'Build', state: 'passing', optional: false, expired: false, source: 'policy' },
    { name: 'Lint', state: 'failing', optional: true, expired: false, source: 'policy' },
  ],
}

function card(id: number, status: string, extra: Record<string, unknown> = {}) {
  return { id, title: `Card ${id}`, state: status, status, workItemType: 'Task', effort: 1, sprintName: 'Sprint 1', ...extra }
}

function pr(id: number, extra: Record<string, unknown> = {}) {
  return {
    id, title: `PR ${id}`, url: `https://example.test/pr/${id}`, approvalCount: 0, checks: passingChecks,
    reviewPolicy: { requiredApprovals: 2, state: Number(extra.approvalCount ?? 0) >= 2 ? 'passing' : 'pending' },
    ...extra,
  }
}

function signalsOf(item: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return [...attention.getCardAttentionSignals({ item, ...extra })].sort()
}

test('each facet matches the same signal its card draws', () => {
  assert.deepEqual(signalsOf(card(1, 'Blocked')), ['blocked'])
  assert.deepEqual(signalsOf(card(2, 'Active', { activePullRequests: [pr(20, { checks: failingChecks, approvalCount: 2 })] })), ['failing'])
  assert.deepEqual(signalsOf(card(3, 'Active', { activePullRequests: [pr(30, { approvalCount: 1 })] })), ['approval'])
  assert.deepEqual(signalsOf(card(4, 'Review', { activePullRequests: [pr(40, { approvalCount: 2 })] })), ['ready'])
  assert.deepEqual(signalsOf(card(5, 'New'), { highlightState: 'new' }), ['changed'])
  assert.deepEqual(
    signalsOf(card(6, 'Review', { state: 'Ready for Test', assignedTo: quinn }), { rowMember: alex }),
    ['qa'],
  )
})

test('optional failing checks, closed PRs, and author-side reviews do not raise attention', () => {
  assert.deepEqual(signalsOf(card(1, 'Active', { activePullRequests: [pr(10, { checks: optionalFailingChecks, approvalCount: 2 })] })), ['ready'])
  assert.deepEqual(signalsOf(card(2, 'Active', { activePullRequests: [pr(20, { status: 'completed', checks: failingChecks })] })), [])
  assert.deepEqual(signalsOf(card(3, 'Active', { activePullRequests: [pr(30, { reviewState: 'waiting-for-author' })] })), [])
  assert.deepEqual(signalsOf(card(4, 'Active', { activePullRequests: [pr(40, { reviewState: 'rejected' })] })), [])
})

test('PR-only cards are judged by their own pull request', () => {
  const pullRequestOnly = card(5, 'Review', { kind: 'pull-request', pullRequest: pr(50, { checks: failingChecks }) })
  assert.deepEqual(signalsOf(pullRequestOnly), ['approval', 'failing'])
})

test('approval attention follows the applicable policy rather than the number of votes', () => {
  const signals = (approvalCount: number, reviewPolicy: unknown) =>
    signalsOf(card(1, 'Review', { activePullRequests: [pr(1, { approvalCount, reviewPolicy })] }))
  assert.deepEqual(signals(0, { requiredApprovals: 0, state: 'passing' }), ['ready'])
  assert.deepEqual(signals(1, { requiredApprovals: 1, state: 'passing' }), ['ready'])
  assert.deepEqual(signals(2, { requiredApprovals: 3, state: 'pending' }), ['approval'])
  assert.deepEqual(signals(3, { requiredApprovals: 1, state: 'failing' }), ['approval'])
  assert.deepEqual(signals(0, { requiredApprovals: 0, state: 'pending' }), ['approval'])
  assert.deepEqual(signals(3, undefined), [])
})

test('idle attention starts at three days and only for in-flight columns', () => {
  const idle = (days: number) => ({ changeDetail: { idleDays: days, agingLevel: 0 } })
  assert.deepEqual(signalsOf(card(1, 'Active'), idle(2)), [])
  assert.deepEqual(signalsOf(card(2, 'Active'), idle(3)), ['idle'])
  assert.deepEqual(signalsOf(card(3, 'Blocked'), idle(9)), ['blocked', 'idle'])
  assert.deepEqual(signalsOf(card(4, 'New'), idle(9)), [])
  assert.deepEqual(signalsOf(card(5, 'Done'), idle(9)), [])
})

test('a Review card is only with QA when it is assigned away from its row', () => {
  const handedOff = card(1, 'Review', { state: 'Ready for Test', assignedTo: quinn })
  assert.deepEqual(signalsOf(handedOff, { rowMember: quinn }), [])
  assert.deepEqual(signalsOf(handedOff), [])
})

test('board attention counts cards on the given rows only, judging handoffs per row', () => {
  const handedOff = card(1, 'Review', { state: 'Ready for Test', assignedTo: quinn })
  const result = attention.getBoardAttention(
    [{ key: 'alex', memberIdentity: alex }],
    {
      'alex:Blocked': [card(2, 'Blocked')],
      'alex:Review': [handedOff],
      'hidden:Blocked': [card(3, 'Blocked')],
    },
    { 2: 'new' },
    undefined,
  )

  assert.equal(result.totalCards, 2)
  assert.deepEqual(result.facetCounts, { blocked: 1, failing: 0, approval: 0, idle: 0, back: 0, qa: 1, added: 0, ready: 0, changed: 1 })
  assert.deepEqual([...result.signalsByItemId.get(2)].sort(), ['blocked', 'changed'])
  assert.equal(attention.getHighlightedItemIds(result, null), null)
  assert.deepEqual([...attention.getHighlightedItemIds(result, 'qa')], [1])
})

test('a sprint lane judges handoffs by each card\'s owner and flags cards that moved back', () => {
  const handedOff = card(1, 'Review', { state: 'Ready for Test', assignedTo: quinn })
  const sentBack = card(2, 'Active')
  const result = attention.getBoardAttention(
    [{ key: 'sprint:sprint 1' }],
    { 'sprint:sprint 1:Review': [handedOff], 'sprint:sprint 1:Active': [sentBack] },
    {},
    undefined,
    {
      rowMemberForItem: () => alex,
      journeysByItemId: {
        2: { steps: [{ status: 'Review', at: 1 }, { status: 'Active', at: 2 }], addedAt: null, sprintStart: 1, firstStepSince: 1 },
      },
    },
  )

  assert.equal(result.facetCounts.qa, 1)
  assert.equal(result.facetCounts.back, 1)
  assert.deepEqual([...attention.getHighlightedItemIds(result, 'back')], [2])
})

test('a sprint card with an added date is flagged added mid-sprint', () => {
  const committed = card(1, 'Active')
  const added = card(2, 'New')
  const result = attention.getBoardAttention(
    [{ key: 'sprint:sprint 1' }],
    { 'sprint:sprint 1:Active': [committed], 'sprint:sprint 1:New': [added] },
    {},
    undefined,
    {
      rowMemberForItem: () => alex,
      journeysByItemId: {
        1: { steps: [{ status: 'Active', at: 1 }], addedAt: null, sprintStart: 1, firstStepSince: 1 },
        2: { steps: [{ status: 'New', at: 5 }], addedAt: 5, sprintStart: 1, firstStepSince: 5 },
      },
    },
  )

  assert.equal(result.facetCounts.added, 1)
  assert.deepEqual([...attention.getHighlightedItemIds(result, 'added')], [2])
  assert.ok(attention.SPRINT_ATTENTION_FACETS.some((facet: { key: string }) => facet.key === 'added'))
  assert.ok(!attention.PEOPLE_ATTENTION_FACETS.some((facet: { key: string }) => facet.key === 'added'))
  assert.ok(!attention.LANE_FLAG_ORDER.includes('added'))
})

test('highlighted cards move to the front of their cell in their existing order', () => {
  const items = [card(1, 'Active'), card(2, 'Active'), card(3, 'Active'), card(4, 'Active')]
  const ids = (list: readonly { id: number }[]) => list.map((item) => item.id)

  assert.deepEqual(ids(attention.partitionHighlighted(items, null).items), [1, 2, 3, 4])
  const partitioned = attention.partitionHighlighted(items, new Set([4, 2]))
  assert.deepEqual(ids(partitioned.items), [2, 4, 1, 3])
  assert.equal(partitioned.matchCount, 2)
})

const zeroCounts = { blocked: 0, failing: 0, approval: 0, idle: 0, qa: 0, ready: 0, changed: 0 }

function renderBar(props: Record<string, unknown> = {}) {
  return render(createElement(AttentionBar, {
    facets: attention.PEOPLE_ATTENTION_FACETS,
    facetCounts: { ...zeroCounts, blocked: 2, approval: 3 },
    totalItems: 12,
    activeFacet: null,
    highlightedCount: 0,
    onChange: () => {},
    ...props,
  }))
}

test('the attention bar lists every facet as a toggle with its count', () => {
  withDocument(renderBar(), (document) => {
    const group = document.querySelector('[role="group"]')
    assert.ok(group)
    assert.equal(document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent, 'Needs attention')

    const toggles = [...document.querySelectorAll('[aria-pressed]')]
    assert.deepEqual(toggles.map((toggle) => toggle.getAttribute('aria-label')), [
      'Blocked, 2 cards',
      'Failing checks, 0 cards',
      'Needs approval, 3 cards',
      'Idle 3+ days, 0 cards',
      'With QA, 0 cards',
      'Ready to complete, 0 cards',
      'Recently changed, 0 cards',
    ])
    assert.ok(toggles.every((toggle) => toggle.getAttribute('aria-pressed') === 'false'))
    assert.equal(document.querySelector('[data-attention-facet="failing"]')?.classList.contains('Mui-disabled'), true)
    assert.equal(document.querySelector('[data-attention-facet="blocked"]')?.classList.contains('Mui-disabled'), false)
    assert.equal(document.querySelector('[role="status"]')?.textContent, '')
    assert.ok(![...document.querySelectorAll('button')].some((button) => button.textContent === 'Clear'))
  })
})

test('an active facet is pressed, offers Clear, and announces how many cards it highlights', () => {
  withDocument(renderBar({ activeFacet: 'approval', highlightedCount: 3 }), (document) => {
    assert.equal(document.querySelector('[aria-label="Needs approval, 3 cards"]')?.getAttribute('aria-pressed'), 'true')
    assert.equal(document.querySelector('[role="status"]')?.textContent, '3 of 12 cards highlighted · Needs approval')
    assert.ok([...document.querySelectorAll('button')].some((button) => button.textContent === 'Clear'))
  })

  // A selected facet stays available even when its count drops to zero, so it can be cleared.
  withDocument(renderBar({ activeFacet: 'idle', highlightedCount: 0 }), (document) => {
    assert.equal(document.querySelector('[data-attention-facet="idle"]')?.classList.contains('Mui-disabled'), false)
  })
})

test('the attention bar names its items with the page noun', () => {
  withDocument(renderBar({ activeFacet: 'blocked', highlightedCount: 1, itemNoun: ['bug', 'bugs'] }), (document) => {
    const labels = [...document.querySelectorAll('[aria-pressed]')].map((toggle) => toggle.getAttribute('aria-label'))
    assert.equal(labels[0], 'Blocked, 2 bugs')
    assert.equal(labels[1], 'Failing checks, 0 bugs')
    assert.equal(document.querySelector('[role="status"]')?.textContent, '1 of 12 bugs highlighted · Blocked')
  })
})

const emptyStatusCounts = { Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 }

function renderGrid(overrides: Record<string, unknown> = {}) {
  return render(createElement(KanbanBoardGrid, {
    layout: getBoardLayout(false),
    rows: [{ key: 'alex', label: 'Alex Example' }],
    cardsByCell: {},
    expandedCells: {},
    currentIterationName: null,
    statusItemCounts: emptyStatusCounts,
    statusEffortTotals: emptyStatusCounts,
    onSetCellExpanded: () => {},
    changeHighlightsByItemId: {},
    rolledOverItemIds: {},
    ...overrides,
  }))
}

test('a selected facet dims other cards in place and lists matches first, even past the collapsed limit', () => {
  const activeCards = [1, 2, 3, 4, 5].map((id) => card(id, 'Active'))
  const html = renderGrid({
    cardsByCell: { 'alex:Active': activeCards },
    statusItemCounts: { ...emptyStatusCounts, Active: 5 },
    highlightedItemIds: new Set([2, 4, 5]),
    statusMatchCounts: { ...emptyStatusCounts, Active: 3 },
  })

  withDocument(html, (document) => {
    const cards = [...document.querySelectorAll('[data-development-card]')]
    assert.deepEqual(cards.map((element) => element.getAttribute('data-emphasis')), ['match', 'match', 'match'])
    assert.deepEqual(cards.map((element) => /Card (\d+)/.exec(element.textContent ?? '')?.[1]), ['2', '4', '5'])
    assert.ok(cards.every((element) => element.textContent?.includes('Highlighted')))
    assert.ok([...document.querySelectorAll('button')].some((button) => button.textContent === 'Show 2 more'))

    const heading = [...document.querySelectorAll('h2')].find((element) => element.textContent === 'Active')
    const count = heading?.nextElementSibling
    assert.equal(count?.querySelector('[aria-hidden="true"]')?.textContent, '3/5')
    assert.match(count?.textContent ?? '', /3 of 5 highlighted$/)
  })

  const expanded = renderGrid({
    cardsByCell: { 'alex:Active': activeCards },
    expandedCells: { 'alex:Active': true },
    highlightedItemIds: new Set([2]),
  })
  withDocument(expanded, (document) => {
    const emphasis = [...document.querySelectorAll('[data-development-card]')].map((element) => element.getAttribute('data-emphasis'))
    assert.deepEqual(emphasis, ['match', 'dim', 'dim', 'dim', 'dim'])
  })
})

test('without a selected facet, cards have no emphasis and headers show plain counts', () => {
  const html = renderGrid({
    cardsByCell: { 'alex:Active': [card(1, 'Active')] },
    statusItemCounts: { ...emptyStatusCounts, Active: 1 },
  })

  withDocument(html, (document) => {
    assert.equal(document.querySelector('[data-development-card]')?.hasAttribute('data-emphasis'), false)
    const heading = [...document.querySelectorAll('h2')].find((element) => element.textContent === 'Active')
    assert.equal(heading?.nextElementSibling?.textContent, '1')
  })
})
