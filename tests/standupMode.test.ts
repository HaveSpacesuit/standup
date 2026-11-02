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
const {
  formatStandupTime,
  getFirstName,
  getStandupAttentionScore,
  getStandupOrder,
  resolveStandupSpeakers,
} = await server.ssrLoadModule('/src/features/standup/components/standupOrder.ts')
const { StandupPresenterBar } = await server.ssrLoadModule('/src/features/standup/components/StandupPresenterBar.tsx')
const { KanbanBoard } = await server.ssrLoadModule('/src/features/standup/components/KanbanBoard.tsx')
const { KanbanBoardGrid } = await server.ssrLoadModule('/src/features/standup/components/KanbanBoardGrid.tsx')
const { StandupToolbar } = await server.ssrLoadModule('/src/features/standup/components/StandupToolbar.tsx')
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

function text(element: Element | null | undefined) {
  return element?.textContent?.replace(/\s+/g, ' ').trim()
}

function buttonNamed(document: Document, name: string) {
  return [...document.querySelectorAll('button')].find((button) => text(button)?.startsWith(name))
}

const alex = { key: 'alex', label: 'Alex Example' }
const blair = { key: 'blair', label: 'Blair Nguyen' }
const casey = { key: 'casey', label: 'Casey Morgan' }
const dana = { key: 'dana', label: 'Dana Ortiz' }
const unassigned = { key: '__unassigned__', label: 'Unassigned', isUnassigned: true }
const unavailable = { key: '__assignee_history_unavailable__', label: 'Assignee unavailable' }

function card(id: number, status: string) {
  return { id, title: `Card ${id}`, state: status, status, workItemType: 'Task', effort: 2 }
}

const scoredCells = {
  'blair:Blocked': [card(1, 'Blocked')],
  'casey:Active': [card(2, 'Active'), card(3, 'Active')],
  'alex:Review': [card(4, 'Review')],
  'dana:Review': [card(5, 'Review')],
  '__unassigned__:Blocked': [card(6, 'Blocked'), card(7, 'Blocked')],
}
const scoredSignals = new Map([
  [1, new Set(['blocked'])],
  [2, new Set(['approval'])],
  [3, new Set(['qa', 'changed'])],
  [4, new Set(['ready', 'changed'])],
  [5, new Set(['qa'])],
  [6, new Set(['blocked', 'failing'])],
  [7, new Set(['blocked'])],
])

test('alphabetical standup order takes only team member lanes, ignoring case', () => {
  const rows = [casey, { ...alex, label: 'alex Example' }, unassigned, blair, unavailable]

  assert.deepEqual(getStandupOrder(rows, 'alphabetical', {}, new Map()), ['alex', 'blair', 'casey'])
})

test('most attention first weighs each signal, skips recent changes, and breaks ties by name', () => {
  assert.equal(getStandupAttentionScore('blair', scoredCells, scoredSignals), 5)
  assert.equal(getStandupAttentionScore('casey', scoredCells, scoredSignals), 3)
  assert.equal(getStandupAttentionScore('alex', scoredCells, scoredSignals), 1)
  assert.equal(getStandupAttentionScore('nobody', scoredCells, scoredSignals), 0)

  assert.deepEqual(
    getStandupOrder([dana, alex, unassigned, casey, blair], 'attention', scoredCells, scoredSignals),
    ['blair', 'casey', 'alex', 'dana'],
  )
})

test('a running standup keeps its order while people join or leave the board', () => {
  const speakers = resolveStandupSpeakers(['casey', 'gone', 'alex'], [alex, blair, unassigned, casey, dana])

  assert.deepEqual(speakers.map((row: { key: string }) => row.key), ['casey', 'alex', 'blair', 'dana'])
})

test('turn times and first names format for the presenter bar', () => {
  assert.equal(formatStandupTime(0), '0:00')
  assert.equal(formatStandupTime(59.9), '0:59')
  assert.equal(formatStandupTime(65), '1:05')
  assert.equal(formatStandupTime(600), '10:00')
  assert.equal(formatStandupTime(-3), '0:00')

  assert.equal(getFirstName('Ada Lovelace'), 'Ada')
  assert.equal(getFirstName('Lovelace, Ada Byron'), 'Ada')
  assert.equal(getFirstName('  Cher  '), 'Cher')
})

function renderPresenterBar(overrides: Record<string, unknown> = {}) {
  return render(createElement(StandupPresenterBar, {
    speakers: [alex, blair, casey],
    currentIndex: 1,
    spokenKeys: new Set(['alex']),
    orderMode: 'alphabetical',
    onOrderModeChange: () => {},
    onGoTo: () => {},
    onEnd: () => {},
    ...overrides,
  }))
}

test('the presenter bar names the speaker, their place in line, and who is next', () => {
  withDocument(renderPresenterBar(), (document) => {
    const bar = document.querySelector('section[aria-label="Standup"][data-standup-presenter]')
    assert.ok(bar)
    const currentSpeaker = text(bar.querySelector('[data-current-speaker]')) ?? ''
    assert.match(currentSpeaker, /Blair Nguyen/)
    assert.match(currentSpeaker, /2 of 3$/)
    assert.equal(text(bar.querySelector('[role="status"]')), 'Now speaking: Blair Nguyen, 2 of 3')
    assert.equal(text(bar.querySelector('[role="timer"]')), 'Turn time 0:00')

    const queue = [...bar.querySelectorAll('ol[aria-label="Speaking order"] > li button')]
    assert.deepEqual(queue.map((button) => button.getAttribute('aria-label')), ['Alex Example, done', 'Blair Nguyen', 'Casey Morgan'])
    assert.deepEqual(queue.map((button) => button.getAttribute('data-queue-state')), ['spoken', 'current', 'waiting'])
    assert.deepEqual(queue.map((button) => button.getAttribute('aria-current')), [null, 'step', null])

    const previous = buttonNamed(document, 'Previous')
    assert.ok(previous)
    assert.equal(previous.disabled, false)
    assert.equal(previous.getAttribute('aria-keyshortcuts'), 'Control+ArrowUp')
    const next = buttonNamed(document, 'Next: Casey')
    assert.ok(next)
    assert.equal(next.getAttribute('aria-keyshortcuts'), 'Control+ArrowDown')
    assert.ok(buttonNamed(document, 'End'))

    const order = bar.querySelector('[role="combobox"][aria-label="Standup order"]')
    assert.equal(text(order), 'Alphabetical')
  })
})

test('the first speaker cannot go back and the last speaker finishes the standup', () => {
  withDocument(renderPresenterBar({ currentIndex: 0, spokenKeys: new Set() }), (document) => {
    assert.equal(buttonNamed(document, 'Previous')?.disabled, true)
    assert.ok(buttonNamed(document, 'Next: Blair'))
  })

  withDocument(renderPresenterBar({ currentIndex: 2, orderMode: 'attention' }), (document) => {
    assert.ok(buttonNamed(document, 'Finish'))
    assert.equal(buttonNamed(document, 'Next'), undefined)
    assert.equal(text(document.querySelector('[aria-label="Standup order"]')), 'Most attention first')
  })
})

test('the presenter bar waits quietly when nobody is on the board', () => {
  withDocument(renderPresenterBar({ speakers: [], currentIndex: 0, spokenKeys: new Set() }), (document) => {
    assert.match(text(document.body) ?? '', /Waiting for team members to appear on the board\./)
    assert.equal(document.querySelector('[role="timer"]'), null)
    assert.equal(buttonNamed(document, 'Previous')?.disabled, true)
    assert.equal(buttonNamed(document, 'Finish')?.disabled, true)
  })
})

const emptyStatusCounts = { Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 }
const manyActiveCards = Array.from({ length: 8 }, (_, index) => card(100 + index, 'Active'))

test('the speaking lane is framed and shows every card while other lanes collapse', () => {
  const html = render(createElement(KanbanBoardGrid, {
    layout: getBoardLayout(false),
    rows: [alex, blair],
    cardsByCell: { 'alex:Active': manyActiveCards, 'blair:Active': [card(200, 'Active')] },
    expandedCells: {},
    currentIterationName: null,
    statusItemCounts: { ...emptyStatusCounts, Active: 9 },
    statusEffortTotals: emptyStatusCounts,
    onSetCellExpanded: () => {},
    changeHighlightsByItemId: {},
    rolledOverItemIds: {},
    signalsByItemId: new Map(),
    collapsedRowKeys: new Set(['alex']),
    presentingRowKey: 'alex',
  }))

  withDocument(html, (document) => {
    const presenting = document.querySelector('[data-lane-presenting]')
    assert.equal(presenting?.getAttribute('data-lane'), 'alex')
    assert.match(text(presenting) ?? '', /Speaking/)
    assert.ok(document.querySelector('[data-lane="blair"][data-lane-collapsed]'))
    assert.equal(document.querySelector('[data-lane="alex"][data-lane-collapsed]'), null)
    assert.equal(document.querySelectorAll('button[aria-expanded]').length, 0)
    for (const item of manyActiveCards) {
      assert.ok(html.includes(item.title))
    }
    assert.doesNotMatch(text(document.body) ?? '', /Show \d+ more/)
  })
})

test('starting standup on the board snapshots an alphabetical order and presents the first person', () => {
  const html = render(createElement(KanbanBoard, {
    patConfigured: true,
    isLoading: false,
    membersError: null,
    workItemsError: null,
    assigneesError: null,
    members: [{ id: 'b', displayName: 'Blair Nguyen' }, { id: 'a', displayName: 'Alex Example' }],
    selectedMemberFilter: '',
    workItems: [card(1, 'Active'), card(2, 'New')],
    currentIterationName: null,
    changeHighlightsByItemId: {},
    rolledOverItemIds: {},
    workItemAssignees: {
      1: { label: 'Alex Example', kind: 'team-member' },
      2: { label: 'Unassigned', kind: 'unassigned' },
    },
    standupActive: true,
  }))

  withDocument(html, (document) => {
    assert.equal(text(document.querySelector('[data-standup-presenter] [role="status"]')), 'Now speaking: Alex Example, 1 of 2')
    assert.deepEqual(
      [...document.querySelectorAll('ol[aria-label="Speaking order"] button')].map((button) => button.getAttribute('aria-label')),
      ['Alex Example', 'Blair Nguyen'],
    )
    assert.match(text(document.querySelector('[data-lane-presenting]')) ?? '', /Alex Example/)
    assert.equal(document.querySelectorAll('[data-lane-collapsed]').length, 2)
  })

  const idle = render(createElement(KanbanBoard, {
    patConfigured: true,
    isLoading: false,
    membersError: null,
    workItemsError: null,
    assigneesError: null,
    members: [{ id: 'a', displayName: 'Alex Example' }],
    selectedMemberFilter: '',
    workItems: [card(1, 'Active')],
    currentIterationName: null,
    changeHighlightsByItemId: {},
    rolledOverItemIds: {},
    workItemAssignees: { 1: { label: 'Alex Example', kind: 'team-member' } },
  }))
  assert.doesNotMatch(idle, /data-standup-presenter/)
  assert.doesNotMatch(idle, /data-lane-presenting/)
})

function renderToolbar(overrides: Record<string, unknown> = {}) {
  return render(createElement(StandupToolbar, {
    patConfigured: true,
    quickFilterInput: '',
    onQuickFilterInputChange: () => {},
    onQuickFilterClear: () => {},
    quickFilterInputRef: { current: null },
    selectedMemberFilter: '',
    memberFilterOptions: ['Alex Example'],
    members: [{ id: 'a', displayName: 'Alex Example' }],
    onMemberFilterChange: () => {},
    teamOptions: [],
    selectedTeamId: '',
    onTeamChange: () => {},
    teamManagementUrl: '',
    onRefresh: () => {},
    onOpenTagRulesDialog: () => {},
    isTeamDataLoading: false,
    isSprintView: false,
    onSprintViewChange: () => {},
    onStartStandup: () => {},
    ...overrides,
  }))
}

test('the toolbar starts standup and locks the member filter while it runs', () => {
  withDocument(renderToolbar(), (document) => {
    const start = buttonNamed(document, 'Start standup')
    assert.ok(start)
    assert.equal(start.disabled, false)
    assert.equal(document.querySelector('[aria-label="Filter by team member"]')?.getAttribute('aria-disabled'), null)
    assert.equal(document.querySelector('[aria-label*="previous team member" i]'), null)
    assert.equal(document.querySelector('[aria-label*="next team member" i]'), null)
  })

  withDocument(renderToolbar({ standupActive: true }), (document) => {
    assert.equal(buttonNamed(document, 'Start standup'), undefined)
    assert.equal(document.querySelector('[aria-label="Filter by team member"]')?.getAttribute('aria-disabled'), 'true')
  })

  withDocument(renderToolbar({ patConfigured: false }), (document) => {
    assert.equal(buttonNamed(document, 'Start standup')?.disabled, true)
  })

  withDocument(renderToolbar({ onStartStandup: undefined }), (document) => {
    assert.equal(buttonNamed(document, 'Start standup'), undefined)
  })
})
