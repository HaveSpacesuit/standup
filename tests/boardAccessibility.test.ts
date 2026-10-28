import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

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
const { TeamToolbarControls } = await server.ssrLoadModule('/src/features/standup/components/TeamToolbarControls.tsx')
const { TeamSelectorCard } = await server.ssrLoadModule('/src/features/standup/components/TeamSelectorCard.tsx')
const { KanbanBoardGrid } = await server.ssrLoadModule('/src/features/standup/components/KanbanBoardGrid.tsx')
const { SprintViewBoard } = await server.ssrLoadModule('/src/features/standup/components/SprintSummaryBoard.tsx')
const { QualityAssuranceList } = await server.ssrLoadModule('/src/features/standup/components/QualityAssuranceList.tsx')

function render(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(createElement(Root, null, element))
}

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
    onMemberFilterCycle: () => {},
    ...teamProps,
    onRefresh: () => {},
    onOpenTagRulesDialog: () => {},
    isTeamDataLoading: false,
    isSprintView: false,
    onSprintViewChange: () => {},
  }))
  assert.match(developmentToolbar, /aria-label="Filter by team member"/)
  assert.match(developmentToolbar, /flex-wrap:wrap/)
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

test('Development board exposes status and member labels as headings', () => {
  const html = render(createElement(KanbanBoardGrid, {
    boardGridTemplate: '175px repeat(5, minmax(200px, 1fr))',
    collapsedCellCardLimit: 3,
    rows: [{ key: 'alex', label: 'Alex Example' }],
    cardsByCell: {},
    expandedCells: {},
    currentIterationName: null,
    statusItemCounts: { Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 },
    statusEffortTotals: { Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 },
    renderStatusColumnBackground: () => 'none',
    onSetCellExpanded: () => {},
    changeHighlightsByItemId: {},
    rolledOverItemIds: {},
  }))

  assert.match(html, /<h2[^>]*>Active<\/h2>/)
  assert.match(html, /<h2[^>]*>Alex Example<\/h2>/)
})

test('Development sprint board exposes status labels as headings', () => {
  const html = render(createElement(SprintViewBoard, {
    patConfigured: true,
    isLoading: false,
    colorScheme: 'light',
    workItemsError: null,
    workItems: [],
    currentIterationName: null,
    visitedStatusesByItemId: {},
    members: [],
    workItemAssignees: {},
    changeHighlightsByItemId: {},
  }))

  assert.match(html, /<h2[^>]*>Active<\/h2>/)
})

test('QA columns are named articles with subordinate headings', () => {
  const html = render(createElement(QualityAssuranceList, {
    isLoading: false,
    error: null,
    colorScheme: 'light',
    buckets: [{
      id: 'new',
      title: 'Newly added',
      items: [{ id: 123, title: 'Example card', status: 'New' }],
    }],
  }))

  assert.match(html, /<article[^>]*aria-labelledby="qa-column-new"/)
  assert.match(html, /<h2[^>]*id="qa-column-new"[^>]*>Newly added<\/h2>/)
})
