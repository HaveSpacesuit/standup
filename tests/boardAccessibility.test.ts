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
const { PageToolbar } = await server.ssrLoadModule('/src/features/standup/components/PageToolbar.tsx')
const { StandupToolbar } = await server.ssrLoadModule('/src/features/standup/components/StandupToolbar.tsx')
const { QualityAssuranceToolbar } = await server.ssrLoadModule('/src/features/standup/components/QualityAssuranceToolbar.tsx')
const { QualityAssurancePage } = await server.ssrLoadModule('/src/features/standup/pages/QualityAssurancePage.tsx')
const { TeamToolbarControls } = await server.ssrLoadModule('/src/features/standup/components/TeamToolbarControls.tsx')
const { TeamSelectorCard } = await server.ssrLoadModule('/src/features/standup/components/TeamSelectorCard.tsx')
const { KanbanBoardGrid } = await server.ssrLoadModule('/src/features/standup/components/KanbanBoardGrid.tsx')
const { getBoardLayout } = await server.ssrLoadModule('/src/features/standup/utils/boardLayout.ts')
const { KanbanBoard } = await server.ssrLoadModule('/src/features/standup/components/KanbanBoard.tsx')
const { QualityAssuranceList } = await server.ssrLoadModule('/src/features/standup/components/QualityAssuranceList.tsx')
const { SprintReplayBar } = await server.ssrLoadModule('/src/features/standup/components/SprintReplayBar.tsx')
const { getSprintReplayTimeline } = await server.ssrLoadModule('/src/features/standup/utils/sprintReplay.ts')

function render(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(createElement(Root, null, element))
}

test('QA cards can expand beyond their columns without creating nested scroll containers', () => {
  const dom = new JSDOM(render(createElement(QualityAssuranceList, {
    isLoading: false,
    error: null,
    historyWarning: null,
    buckets: [{
      id: 'new',
      title: 'Newly added',
      items: [{ id: 1, title: 'Hoverable QA card', state: 'New', status: 'New' }],
    }],
  })))
  try {
    const { document } = dom.window
    const styles = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '')
    const getStyles = (element: Element) => styles.filter((css) =>
      [...element.classList].some((className) => css.includes(`.${className}{`)),
    ).join('')
    const column = document.querySelector('section[data-qa-column="new"]')
    assert.ok(column)
    assert.doesNotMatch(getStyles(column), /overflow(?:-[xy])?:(?:auto|scroll|hidden|clip);/)
    const body = column.lastElementChild
    assert.ok(body)
    assert.doesNotMatch(getStyles(body), /overflow(?:-[xy])?:(?:auto|scroll|hidden|clip);/)
    const scrollContainer = document.querySelector('[data-qa-scroll-container]')
    assert.ok(scrollContainer)
    assert.match(getStyles(scrollContainer), /overflow:auto;/)
  } finally {
    dom.window.close()
  }
})

test('Development and QA toolbar titles are top-level headings', () => {
  for (const title of ['Development', 'Quality Assurance']) {
    const html = render(createElement(PageToolbar, { iconHref: '', title, isPageTitle: true }))
    assert.match(html, new RegExp(`<h1[^>]*>${title}</h1>`))
  }

  assert.doesNotMatch(render(createElement(PageToolbar, { iconHref: '', title: 'Tests' })), /<h1[^>]*>Tests<\/h1>/)
})

test('toolbar wrapping is opt-in so other pages retain their layout', () => {
  const props = { iconHref: '', title: 'Development' }
  assert.match(render(createElement(PageToolbar, { ...props, wrap: true })), /flex-wrap:wrap/)
  assert.doesNotMatch(render(createElement(PageToolbar, props)), /flex-wrap:wrap/)
})

test('QA toolbar allows controls to wrap without hiding its actions', () => {
  const html = render(createElement(QualityAssuranceToolbar, {
    patConfigured: true,
    teamOptions: [{
      id: 'team', displayName: 'Team', orgName: 'example-org', projectName: 'example-project',
      areaPath: '', iterationPath: '', teamName: 'Team', repoName: '',
    }],
    selectedTeamId: 'team',
    onTeamChange: () => {},
    teamManagementUrl: '',
    quickFilterInput: '',
    onQuickFilterInputChange: () => {},
    onQuickFilterClear: () => {},
    quickFilterInputRef: { current: null },
    onRefresh: () => {},
    onOpenOptions: () => {},
    isLoading: false,
  }))

  assert.match(html, /flex-wrap:wrap/)
  assert.match(html, /placeholder="Quick filter cards"/)
  assert.match(html, /aria-label="Team"/)
  for (const label of ['QA options', 'Refresh']) {
    const button = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))
    assert.ok(button)
    assert.doesNotMatch(button[0], /\bdisabled/)
  }
})

test('team and member selectors have stable accessible names', () => {
  const teamProps = {
    teamOptions: [],
    selectedTeamId: '',
    onTeamChange: () => {},
    teamManagementUrl: '',
  }
  assert.match(render(createElement(TeamToolbarControls, teamProps)), /aria-label="Team"/)
  assert.match(render(createElement(TeamSelectorCard, {
    teams: [],
    selectedTeamId: '',
    onTeamChange: () => {},
    onRefresh: () => {},
    refreshDisabled: false,
  })), /aria-label="Team"/)
  const developmentToolbar = render(createElement(StandupToolbar, {
    patConfigured: false,
    quickFilterInput: '',
    onQuickFilterInputChange: () => {},
    onQuickFilterClear: () => {},
    quickFilterInputRef: { current: null },
    selectedMemberFilter: '',
    memberFilterOptions: [],
    members: [],
    onMemberFilterChange: () => {},
    ...teamProps,
    onRefresh: () => {},
    onOpenTagRulesDialog: () => {},
    isTeamDataLoading: false,
    isSprintView: false,
    onSprintViewChange: () => {},
  }))
  assert.match(developmentToolbar, /aria-label="Filter by team member"/)
  assert.match(developmentToolbar, /<button[^>]*aria-label="Development options"/)
  assert.doesNotMatch(developmentToolbar, /Assignments options/)
  assert.match(developmentToolbar, /flex-wrap:wrap/)
})

function renderDevelopmentToolbar(overrides: Record<string, unknown> = {}) {
  const dom = new JSDOM(render(createElement(StandupToolbar, {
    patConfigured: true,
    quickFilterInput: '',
    onQuickFilterInputChange: () => {},
    onQuickFilterClear: () => {},
    quickFilterInputRef: { current: null },
    selectedMemberFilter: '',
    memberFilterOptions: ['Alex Example'],
    members: [],
    onMemberFilterChange: () => {},
    teamOptions: [{
      id: 'team', displayName: 'Team', orgName: 'example-org', projectName: 'example-project',
      areaPath: '', iterationPath: '', teamName: 'Team', repoName: '',
    }],
    selectedTeamId: 'team',
    onTeamChange: () => {},
    teamManagementUrl: '',
    onRefresh: () => {},
    onOpenTagRulesDialog: () => {},
    isTeamDataLoading: false,
    isSprintView: false,
    onSprintViewChange: () => {},
    ...overrides,
  })))
  dom.window.document.querySelectorAll('style').forEach((style) => style.remove())
  return dom
}

function renderQaToolbar(overrides: Record<string, unknown> = {}) {
  const dom = new JSDOM(render(createElement(QualityAssuranceToolbar, {
    patConfigured: true,
    teamOptions: [{
      id: 'team', displayName: 'Team', orgName: 'example-org', projectName: 'example-project',
      areaPath: '', iterationPath: '', teamName: 'Team', repoName: '',
    }],
    selectedTeamId: 'team',
    onTeamChange: () => {},
    teamManagementUrl: '',
    quickFilterInput: '',
    onQuickFilterInputChange: () => {},
    onQuickFilterClear: () => {},
    quickFilterInputRef: { current: null },
    onRefresh: () => {},
    onOpenOptions: () => {},
    isLoading: false,
    view: 'flow',
    onViewChange: () => {},
    onStartStandup: () => {},
    standupActive: false,
    ...overrides,
  })))
  dom.window.document.querySelectorAll('style').forEach((style) => style.remove())
  return dom
}

test('the Development view toggle names Developers and Sprint in visible text', () => {
  const dom = renderDevelopmentToolbar()
  try {
    const toggles = [...dom.window.document.querySelectorAll('[aria-label="Assignments board view"] button')]
    assert.deepEqual(toggles.map((button) => [button.textContent, button.getAttribute('aria-pressed'), button.getAttribute('aria-label')]), [
      ['Developers', 'true', null],
      ['Sprint', 'false', null],
    ])
  } finally {
    dom.window.close()
  }
})

test('the QA page opens on Testers, listed first, and its Flow icon differs from Sprint\'s', () => {
  const development = renderDevelopmentToolbar()
  const qa = new JSDOM(render(createElement(QualityAssurancePage, {
    patConfigured: true,
    teamOptions: [],
    selectedTeamId: '',
    quickFilterInput: '',
    quickFilterInputRef: { current: null },
    buckets: [],
    isLoading: false,
    newItemsError: null,
    historyWarning: null,
  })))
  try {
    const toggles = (dom: JSDOM, label: string) => [...dom.window.document.querySelectorAll(`[aria-label="${label}"] button`)]
    const icon = (button: Element) => button.querySelector('use')?.getAttribute('href')
    const [testers, flow] = toggles(qa, 'QA board view')
    const [developers, sprint] = toggles(development, 'Assignments board view')
    assert.deepEqual([testers, flow].map((button) => [button.textContent, button.getAttribute('aria-pressed')]), [
      ['Testers', 'true'],
      ['Flow', 'false'],
    ])
    for (const button of [testers, flow, developers, sprint]) assert.ok(icon(button))
    // Both lane views share the people icon, but Flow and Sprint must not look alike.
    assert.equal(icon(testers), icon(developers))
    assert.notEqual(icon(flow), icon(sprint))
  } finally {
    development.window.close()
    qa.window.close()
  }
})

test('the Sprint view swaps Start standup for Replay sprint, which waits for the sprint history', () => {
  const buttons = (dom: JSDOM) => [...dom.window.document.querySelectorAll('button')]
  const named = (dom: JSDOM, name: string) => buttons(dom).find((button) => button.textContent === name)
  const props = { onStartStandup: () => {}, onReplaySprint: () => {} }
  const people = renderDevelopmentToolbar(props)
  const loading = renderDevelopmentToolbar({ ...props, isSprintView: true })
  const ready = renderDevelopmentToolbar({ ...props, isSprintView: true, replayAvailable: true })
  try {
    assert.ok(named(people, 'Start standup'))
    assert.equal(named(people, 'Replay sprint'), undefined)
    assert.equal(named(loading, 'Start standup'), undefined)
    assert.equal(named(loading, 'Replay sprint')?.hasAttribute('disabled'), true)
    assert.equal(named(ready, 'Replay sprint')?.hasAttribute('disabled'), false)
  } finally {
    for (const dom of [people, loading, ready]) dom.window.close()
  }
})

test('Start QA standup looks like Start standup and sits in the same place', () => {
  const named = (dom: JSDOM, name: string) => [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent === name)
  const development = renderDevelopmentToolbar({ onStartStandup: () => {} })
  const qa = renderQaToolbar()
  try {
    const developmentStart = named(development, 'Start standup')
    const qaStart = named(qa, 'Start QA standup')
    assert.ok(developmentStart && qaStart)
    assert.equal(qaStart.className, developmentStart.className)
    for (const [dom, start] of [[development, developmentStart], [qa, qaStart]] as const) {
      // On the left with the filters, ahead of the right-aligned View toggle and team controls.
      assert.ok(start.parentElement?.classList.contains('MuiToolbar-root'))
      const team = dom.window.document.querySelector('[aria-label="Team"]')
      assert.ok(team && start.compareDocumentPosition(team) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)
    }
  } finally {
    development.window.close()
    qa.window.close()
  }
})

test('the sprint replay bar plays and steps through the days so far, with the future hatched', () => {
  const points = [
    { date: '2025-10-27', Blocked: 0, New: 3, Active: 0, Review: 0, Done: 0 },
    { date: '2025-10-28', Blocked: 0, New: 2, Active: 1, Review: 0, Done: 0 },
    { date: '2025-10-29', Blocked: 0, New: 1, Active: 1, Review: 0, Done: 1 },
    { date: '2025-10-30', Blocked: null, New: null, Active: null, Review: null, Done: null },
  ]
  const timeline = getSprintReplayTimeline(points)
  const replay = (index: number) => ({
    pastDay: index < timeline.todayIndex ? timeline.days[index] : null,
    index,
    playing: false,
    goTo: () => {},
    step: () => {},
    togglePlay: () => {},
    start: () => {},
    exit: () => {},
    reset: () => {},
  })
  const renderBar = (index: number, status = 'ready') => {
    const dom = new JSDOM(render(createElement(SprintReplayBar, { timeline, points, replay: replay(index), status, colorScheme: 'light' })))
    dom.window.document.querySelectorAll('style').forEach((style) => style.remove())
    return dom
  }

  const today = renderBar(2)
  const past = renderBar(0)
  const loading = renderBar(2, 'loading')
  try {
    const bar = (dom: JSDOM) => dom.window.document.querySelector('[data-sprint-replay]')!
    const button = (dom: JSDOM, name: string) => bar(dom).querySelector(`button[aria-label="${name}"]`) ?? [...bar(dom).querySelectorAll('button')].find((node) => node.textContent === name)
    assert.equal(bar(today).getAttribute('aria-label'), 'Sprint replay')
    assert.match(bar(today).querySelector('[aria-live]')?.textContent ?? '', /^Day 3 of 4.* · today$/)
    assert.equal(button(today, 'Next day')?.hasAttribute('disabled'), true, 'there is no stepping past today')
    assert.equal(button(today, 'Previous day')?.hasAttribute('disabled'), false)
    assert.equal(bar(today).querySelector('[data-replay-playhead]'), null, 'today needs no playhead')
    assert.deepEqual([...bar(today).querySelectorAll('svg path[data-flow-area]')].map((path) => path.getAttribute('data-flow-area')), ['Blocked', 'New', 'Active', 'Review', 'Done'], 'one area per column')
    const slider = bar(today).querySelector('input[type="range"]')!
    assert.equal(slider.getAttribute('aria-label'), 'Sprint day')
    assert.equal(slider.getAttribute('max'), '2')

    assert.match(bar(past).querySelector('[aria-live]')?.textContent ?? '', /^Day 1 of 4/)
    assert.ok(bar(past).querySelector('[data-replay-playhead]'))
    assert.equal(button(past, 'Previous day')?.hasAttribute('disabled'), true)

    assert.equal(button(loading, 'Play')?.hasAttribute('disabled'), true)
    assert.match(bar(loading).textContent ?? '', /Loading sprint history/)
  } finally {
    for (const dom of [today, past, loading]) dom.window.close()
  }
})

test('the Development toolbar says when the board last synced, and shows progress while it syncs', () => {
  const refresh = (dom: JSDOM) => dom.window.document.querySelector('button[aria-label="Refresh"]')!
  const text = (dom: JSDOM) => dom.window.document.body.textContent ?? ''

  const neverSynced = renderDevelopmentToolbar()
  try {
    assert.doesNotMatch(text(neverSynced), /Sync/, 'nothing to report before the first load')
    assert.equal(refresh(neverSynced).querySelector('[role="progressbar"]'), null)
  } finally {
    neverSynced.window.close()
  }

  const synced = renderDevelopmentToolbar({ teamDataSyncedAt: Date.now() - 5 * 60_000 })
  try {
    assert.match(text(synced), /Synced 5m ago/)
    assert.equal(refresh(synced).hasAttribute('disabled'), false)
  } finally {
    synced.window.close()
  }

  const syncing = renderDevelopmentToolbar({ teamDataSyncedAt: Date.now() - 5 * 60_000, isTeamDataLoading: true })
  try {
    assert.match(text(syncing), /Syncing…/)
    assert.doesNotMatch(text(syncing), /Synced/)
    assert.equal(refresh(syncing).hasAttribute('disabled'), true)
    assert.equal(refresh(syncing).getAttribute('aria-busy'), 'true')
    assert.ok(refresh(syncing).querySelector('[role="progressbar"]'), 'the Refresh icon becomes a spinner')
  } finally {
    syncing.window.close()
  }
})

test('team selectors show only the selected display name in the input', () => {
  const teams = [
    {
      id: 'first', displayName: 'Shared Team', orgName: 'first-org', projectName: 'first-project',
      areaPath: '', iterationPath: '', teamName: 'Internal Team', repoName: '',
    },
    {
      id: 'second', displayName: 'Shared Team', orgName: 'second-org', projectName: 'second-project',
      areaPath: '', iterationPath: '', teamName: 'Other Internal Team', repoName: '',
    },
  ]

  for (const selectedTeamId of ['first', 'second']) {
    const selectors = [
      createElement(TeamToolbarControls, {
        teamOptions: teams, selectedTeamId, onTeamChange: () => {}, teamManagementUrl: '',
      }),
      createElement(TeamSelectorCard, {
        teams, selectedTeamId, onTeamChange: () => {}, onRefresh: () => {}, refreshDisabled: false,
      }),
    ]

    for (const selector of selectors) {
      const html = render(selector)
      assert.match(html, /role="combobox"[^>]*>Shared Team<\/div>/)
      assert.doesNotMatch(html, /first-org|first-project|second-org|second-project/)
      assert.match(html, new RegExp(`<input[^>]*value="${selectedTeamId}"`))
    }
  }
})

test('unconfigured toolbar team selector retains its disabled placeholder', () => {
  const html = render(createElement(TeamToolbarControls, {
    teamOptions: [], selectedTeamId: '', onTeamChange: () => {}, teamManagementUrl: '',
  }))

  assert.match(html, /role="combobox"[^>]*aria-disabled="true"[^>]*>No teams configured<\/div>/)
})

const emptyStatusCounts = { Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 }

function renderBoardGrid(overrides: Record<string, unknown> = {}) {
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

function boardCard(id: number, status: string) {
  return { id, title: `Card ${id}`, state: 'Active', status, workItemType: 'Task', effort: 1, sprintName: 'Sprint 1' }
}

test('Development board exposes status and member labels as headings', () => {
  const html = renderBoardGrid()

  assert.match(html, /<h2[^>]*>Active<\/h2>/)
  assert.match(html, /<h2[^>]*>Alex Example<\/h2>/)
})

test('the Team member header counts the people with lanes, not the Unassigned or unavailable lanes', () => {
  const headerText = (rows: unknown[]) => {
    const dom = new JSDOM(renderBoardGrid({ rows }))
    try {
      dom.window.document.querySelectorAll('style').forEach((style) => style.remove())
      const corner = [...dom.window.document.querySelectorAll('p, span')].find((node) => node.textContent?.startsWith('Team member'))
      return corner?.textContent
    } finally {
      dom.window.close()
    }
  }

  assert.equal(headerText([
    { key: 'alex', label: 'Alex Example' },
    { key: 'blair', label: 'Blair Example' },
    { key: '__unassigned__', label: 'Unassigned', isUnassigned: true },
    { key: '__assignee_history_unavailable__', label: 'Assignee unavailable' },
  ]), 'Team member · 2 (2 people)')
  assert.equal(headerText([{ key: 'alex', label: 'Alex Example' }]), 'Team member · 1 (1 person)')
  assert.equal(headerText([{ key: '__unassigned__', label: 'Unassigned', isUnassigned: true }]), 'Team member')
})

test('an empty Blocked column collapses to a rail that keeps its heading', () => {
  const rail = renderBoardGrid()
  assert.match(rail, /data-blocked-rail=""/)
  assert.match(rail, /data-column-rail-mark=""/)
  assert.match(rail, /<h2[^>]*>Blocked<\/h2>/)
  assert.match(rail, /Blocked · none/)

  const full = renderBoardGrid({
    layout: getBoardLayout(true),
    statusItemCounts: { ...emptyStatusCounts, Blocked: 1 },
    cardsByCell: { 'alex:Blocked': [boardCard(1, 'Blocked')] },
  })
  assert.doesNotMatch(full, /data-blocked-rail|Blocked · none/)
  assert.match(full, /Card 1/)
})

test('board column backgrounds grow with the lanes instead of stopping at the first screen', () => {
  const dom = new JSDOM(renderBoardGrid())
  try {
    const { document } = dom.window
    const styles = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '')
    const getStyles = (element: Element) => styles.filter((css) =>
      [...element.classList].some((className) => css.includes(`.${className}{`)),
    ).join('')
    const cardsArea = document.querySelector('[data-board-column="New"]')?.parentElement?.parentElement
    const content = cardsArea?.parentElement
    assert.ok(cardsArea && content)
    // Inside the flex-column scroller, a shrinkable content box is squeezed to the viewport and the dividers end there.
    assert.match(getStyles(content), /flex-shrink:0;/)
    assert.match(getStyles(cardsArea), /flex:1 0 auto;/)
  } finally {
    dom.window.close()
  }
})

test('New and Done cards are compact while in-flight columns stay full until Compact cards is on', () => {
  const cardsByCell = {
    'alex:New': [boardCard(1, 'New')],
    'alex:Active': [boardCard(2, 'Active')],
    'alex:Done': [boardCard(3, 'Done')],
  }
  const compactIds = (html: string) => {
    const dom = new JSDOM(html)
    try {
      return [...dom.window.document.querySelectorAll('[data-compact]')]
        .map((card) => card.textContent?.match(/Card (\d+)/)?.[1])
        .sort()
    } finally {
      dom.window.close()
    }
  }

  assert.deepEqual(compactIds(renderBoardGrid({ cardsByCell })), ['1', '3'])
  assert.deepEqual(compactIds(renderBoardGrid({ cardsByCell, compactCards: true })), ['1', '2', '3'])
})

test('compact columns show five cards before Show more, full columns three', () => {
  const html = renderBoardGrid({
    cardsByCell: {
      'alex:New': Array.from({ length: 7 }, (_, index) => boardCard(10 + index, 'New')),
      'alex:Active': Array.from({ length: 7 }, (_, index) => boardCard(20 + index, 'Active')),
    },
  })

  assert.match(html, /Show 2 more/)
  assert.match(html, /Show 4 more/)
})

test('Development sprint lens lays the shared board out by sprint, with owners on the cards', () => {
  const day = 24 * 60 * 60 * 1000
  const sprintStart = Date.now() - 6 * day
  const html = render(createElement(KanbanBoard, {
    lens: 'sprint',
    patConfigured: true,
    isLoading: false,
    membersError: null,
    workItemsError: null,
    assigneesError: null,
    members: [{ id: 'a', displayName: 'Alex Example', uniqueName: 'alex@example.com' }],
    selectedMemberFilter: '',
    workItems: [
      boardCard(1, 'Active'),
      { ...boardCard(2, 'New'), sprintName: 'Sprint 2' },
      { id: -9, kind: 'pull-request', title: 'PR only', status: 'Review', pullRequest: { id: 9 } },
    ],
    currentIterationName: 'Sprint 1',
    changeHighlightsByItemId: {},
    rolledOverItemIds: {},
    workItemAssignees: { 1: { label: 'Alex Example', kind: 'team-member' } },
    journeysByItemId: {
      1: { steps: [{ status: 'New', at: sprintStart }, { status: 'Active', at: sprintStart + 2 * day }], addedAt: null, sprintStart, firstStepSince: sprintStart },
    },
  }))

  const dom = new JSDOM(html)
  try {
    const { document } = dom.window
    assert.ok([...document.querySelectorAll('h2')].some((heading) => heading.textContent === 'Active'))
    assert.deepEqual([...document.querySelectorAll('[data-lane]')].map((lane) => lane.getAttribute('data-lane')), ['sprint:sprint 1', 'sprint:sprint 2'])
    assert.equal(document.querySelectorAll('[data-lane-collapsed]').length, 1, 'later sprints start collapsed')
    assert.doesNotMatch(html, /Team member/)
    assert.doesNotMatch(html, /PR only/)
    assert.ok(document.querySelector('[data-card-owner][aria-label="Owner: Alex Example"]'))
    assert.equal(document.querySelector('[data-journey-caption]')?.textContent?.replace(/\..*$/, ''), '4d in Active')
    assert.match(document.querySelector('[data-journey-trail]')?.getAttribute('aria-label') ?? '', /^Journey: New from .+, then Active from /)
  } finally {
    dom.window.close()
  }
})

test('with sprint-start scope, the sprint lens splits the current sprint into committed, added, and removed lanes', () => {
  const html = render(createElement(KanbanBoard, {
    lens: 'sprint',
    patConfigured: true,
    isLoading: false,
    membersError: null,
    workItemsError: null,
    assigneesError: null,
    members: [{ id: 'a', displayName: 'Alex Example', uniqueName: 'alex@example.com' }],
    selectedMemberFilter: '',
    workItems: [
      { ...boardCard(1, 'Active'), effort: 3 },
      { ...boardCard(2, 'New'), effort: 1 },
      { ...boardCard(3, 'New'), sprintName: 'Sprint 2' },
    ],
    currentIterationName: 'Sprint 1',
    changeHighlightsByItemId: {},
    rolledOverItemIds: {},
    workItemAssignees: {},
    sprintScope: {
      status: 'ready',
      startItemIds: new Set([1, 4]),
      removedItems: [{ ...boardCard(4, 'Review'), sprintName: 'Sprint 2', iterationPath: 'Project\\Sprint 2' }],
      assignees: { 4: { label: 'Alex Example', kind: 'team-member' } },
    },
    departuresByItemId: { 4: { leftAt: null, status: 'Active' } },
    teamIterations: [{ name: 'Sprint 2', path: 'Project\\Sprint 2', timeFrame: 'future' }],
  }))

  const dom = new JSDOM(html)
  try {
    const { document } = dom.window
    document.querySelectorAll('style').forEach((style) => style.remove())
    const lanes = [...document.querySelectorAll('[data-lane]')]
    assert.deepEqual(lanes.map((lane) => lane.getAttribute('data-lane')), ['scope:committed', 'scope:added', 'scope:removed', 'sprint:sprint 2'])
    assert.deepEqual(
      lanes.filter((lane) => lane.hasAttribute('data-lane-collapsed')).map((lane) => lane.getAttribute('data-lane')),
      ['scope:removed', 'sprint:sprint 2'],
    )
    assert.ok([...document.querySelectorAll('p, span')].some((node) => node.textContent === 'Scope'))
    assert.equal(document.querySelector('[data-lane-note="scope-growth"]')?.textContent?.includes('Scope +25%'), true)
    // The removed card sits in the column it left from, as a dashed outline pip.
    assert.equal(document.querySelectorAll('[data-collapsed-summary]').length > 0, true)
    assert.match(html, /Active: 1 card/)
    assert.equal(document.querySelectorAll('[data-removed]').length, 0, 'the removed lane starts collapsed')
  } finally {
    dom.window.close()
  }
})

test('a removed card is a dashed outline with struck effort that says where it went', () => {
  const html = renderBoardGrid({
    rows: [{ key: 'scope:removed', label: 'Removed from sprint', ghost: true }],
    cardsByCell: { 'scope:removed:Active': [boardCard(4, 'Active')], 'scope:removed:New': [boardCard(5, 'New')] },
    removalsByItemId: new Map([[4, { to: 'Sprint 2', at: new Date(2026, 9, 29).getTime() }]]),
    ownerByItemId: new Map([[4, { displayName: 'Alex Example' }]]),
    highlightedItemIds: new Set([4]),
  })

  const dom = new JSDOM(html)
  try {
    const { document } = dom.window
    document.querySelectorAll('style').forEach((style) => style.remove())
    const cards = [...document.querySelectorAll('[data-removed]')]
    assert.equal(cards.length, 2)
    const card = (id: number) => cards.find((node) => node.textContent?.includes(`Card ${id}`))!
    assert.equal(card(4).querySelector('[data-card-removal]')?.textContent, 'Moved to Sprint 2 · Oct 29')
    assert.equal(card(5).querySelector('[data-card-removal]')?.textContent, 'Moved out of the sprint')
    assert.match(card(4).textContent ?? '', /Removed effort 1/)
    assert.ok(card(4).querySelector('[data-card-owner]'))
    assert.ok(cards.every((card) => !card.querySelector('[data-journey-trail], [data-compact-line]')))
    // Removed cards never match a facet, even when the same item is live elsewhere on the board.
    assert.ok(cards.every((card) => card.getAttribute('data-emphasis') === 'dim'))
  } finally {
    dom.window.close()
  }
})

test('the sprint lens adds a flow line to each column header, and the Developers board does not', () => {
  const day = 24 * 60 * 60 * 1000
  const sprintStart = Date.now() - 6 * day
  const props = {
    patConfigured: true,
    isLoading: false,
    membersError: null,
    workItemsError: null,
    assigneesError: null,
    members: [{ id: 'a', displayName: 'Alex Example', uniqueName: 'alex@example.com' }],
    selectedMemberFilter: '',
    workItems: [boardCard(1, 'Active'), boardCard(2, 'Done')],
    currentIterationName: 'Sprint 1',
    changeHighlightsByItemId: {},
    rolledOverItemIds: {},
    workItemAssignees: { 1: { label: 'Alex Example', kind: 'team-member' }, 2: { label: 'Alex Example', kind: 'team-member' } },
    journeysByItemId: {
      1: { steps: [{ status: 'New', at: sprintStart }, { status: 'Active', at: sprintStart + 2 * day }], addedAt: null, sprintStart, firstStepSince: sprintStart },
    },
    effortFlowPoints: [
      { date: 'd1', Blocked: 0, New: 2, Active: 0, Review: 0, Done: 0 },
      { date: 'd2', Blocked: 0, New: 1, Active: 1, Review: 0, Done: 0 },
      { date: 'd3', Blocked: 0, New: 0, Active: 1, Review: 0, Done: 1 },
      { date: 'd4', Blocked: null, New: null, Active: null, Review: null, Done: null },
    ],
  }

  const dom = new JSDOM(render(createElement(KanbanBoard, { ...props, lens: 'sprint' })))
  try {
    const { document } = dom.window
    document.querySelectorAll('style').forEach((style) => style.remove())
    // The empty Blocked column stays a rail without a flow line.
    const flows = [...document.querySelectorAll('[data-column-flow]')]
    assert.deepEqual(flows.map((flow) => flow.getAttribute('data-column-flow')), ['New', 'Active', 'Review', 'Done'])
    const flow = (status: string) => flows.find((node) => node.getAttribute('data-column-flow') === status)!
    assert.equal(flow('Done').querySelector('[data-column-flow-delta]')?.textContent, '▲1 pts')
    assert.equal(flow('Done').querySelector('[data-column-flow-delta]')?.getAttribute('data-column-flow-delta'), 'positive')
    assert.match(flow('Active').textContent ?? '', /oldest 4d/)
    assert.match(flow('Active').textContent ?? '', /Active: 1 pts more than at sprint start\. Longest stay in Active: 4 days\./)
    assert.equal(flow('New').querySelector('[data-column-oldest]'), null)
    assert.equal(flow('Active').querySelector('svg[data-column-sparkline]')?.getAttribute('aria-hidden'), 'true')
    assert.equal(flow('Active').querySelector('polyline')?.getAttribute('points')?.split(' ').length, 3, 'one point per elapsed day')
  } finally {
    dom.window.close()
  }

  const peopleHtml = render(createElement(KanbanBoard, { ...props, lens: 'people' }))
  assert.doesNotMatch(peopleHtml, /data-column-flow/)
})

test('a replayed sprint lens shows each card where it stood that day, without Needs attention', () => {
  const at = (date: string, hour = 10) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime()
  const sprintStart = at('2025-10-27', 0)
  const journey = (steps: Array<[string, number]>, addedAt: number | null = null) => ({
    steps: steps.map(([status, stepAt]) => ({ status, at: stepAt })),
    addedAt,
    sprintStart,
    firstStepSince: sprintStart,
  })
  const point = (date: string, active: number | null, done: number | null) => ({ date, Blocked: active === null ? null : 0, New: active === null ? null : 1, Active: active, Review: active === null ? null : 0, Done: done })
  const props = {
    lens: 'sprint',
    patConfigured: true,
    isLoading: false,
    membersError: null,
    workItemsError: null,
    assigneesError: null,
    members: [{ id: 'a', displayName: 'Alex Example', uniqueName: 'alex@example.com' }],
    selectedMemberFilter: '',
    workItems: [
      { ...boardCard(1, 'Done'), tags: ['Customer'] },
      boardCard(2, 'Active'),
      boardCard(3, 'Review'),
      { ...boardCard(6, 'New'), sprintName: 'Sprint 2' },
    ],
    currentIterationName: 'Sprint 1',
    changeHighlightsByItemId: { 1: 'new' },
    rolledOverItemIds: {},
    workItemAssignees: { 1: { label: 'Alex Example', kind: 'team-member' } },
    journeysByItemId: {
      1: journey([['New', sprintStart], ['Active', at('2025-10-28')], ['Done', at('2025-10-29')]]),
      2: journey([['Active', at('2025-10-29')]], at('2025-10-29')),
      6: journey([['New', sprintStart]]),
    },
    sprintScope: {
      status: 'ready',
      startItemIds: new Set([1, 3, 4]),
      removedItems: [{ ...boardCard(4, 'New'), sprintName: 'Sprint 2' }],
      assignees: { 4: { label: 'Alex Example', kind: 'team-member' } },
    },
    departuresByItemId: { 4: { leftAt: at('2025-10-29'), status: 'Active', journey: journey([['New', sprintStart], ['Active', at('2025-10-28', 9)]]) } },
    effortFlowPoints: [point('2025-10-27', 0, 0), point('2025-10-28', 2, 0), point('2025-10-29', 1, 1), point('2025-10-30', null, null)],
  }

  const today = new JSDOM(render(createElement(KanbanBoard, props)))
  const day2 = new JSDOM(render(createElement(KanbanBoard, { ...props, replayAt: at('2025-10-29', 0) - 1 })))
  try {
    const live = today.window.document
    const past = day2.window.document
    for (const document of [live, past]) {
      document.querySelectorAll('style').forEach((style) => style.remove())
    }
    assert.ok(live.querySelector('[data-attention-facet]'), 'today shows Needs attention')
    assert.equal(past.querySelector('[data-attention-facet]'), null, 'a past day does not')

    const ids = (document: Document) => [...document.querySelectorAll('[data-development-card]:not([data-removed])')].map((card) => card.getAttribute('data-card-id')).sort()
    assert.deepEqual(ids(past), ['1', '4'], 'the card added later, the card without history, and other sprints drop out')
    assert.deepEqual([...past.querySelectorAll('[data-lane]')].map((lane) => lane.getAttribute('data-lane')), ['scope:committed', 'scope:added', 'scope:removed'])
    assert.ok([...past.querySelectorAll('[data-development-card]')].every((card) => card.hasAttribute('data-as-of')))
    assert.equal(past.querySelector('[data-change-dot]'), null, 'recent changes are today\u2019s news')
    assert.doesNotMatch(past.body.textContent ?? '', /Customer/, 'live details like tags are left out')

    const count = (document: Document, status: string) => [...document.querySelectorAll('h2')].find((heading) => heading.textContent === status)!.nextElementSibling!.textContent
    assert.equal(count(past, 'Active'), '2', 'both cards were Active at the end of Day 2')
    assert.equal(count(past, 'Done'), '0')
    assert.equal(count(live, 'Done'), '1')
    assert.equal(past.querySelector('[data-column-flow="Done"] [data-column-flow-delta]')?.textContent, '±0 pts', 'the flow stops at the day shown')
    assert.equal(live.querySelector('[data-column-flow="Done"] [data-column-flow-delta]')?.textContent, '▲1 pts')
  } finally {
    today.window.close()
    day2.window.close()
  }
})

test('QA columns are named sections with subordinate headings', () => {
  const html = render(createElement(QualityAssuranceList, {
    isLoading: false,
    error: null,
    buckets: [{
      id: 'new',
      title: 'Newly added',
      items: [{ id: 123, title: 'Example card', status: 'New' }],
    }],
  }))

  assert.match(html, /<section[^>]*aria-labelledby="qa-column-new"[^>]*data-qa-column="new"/)
  assert.match(html, /<h2[^>]*id="qa-column-new"[^>]*>Newly added<\/h2>/)
})
