import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement, type ComponentProps } from 'react'
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
const { TeamAssignmentsPage } = await server.ssrLoadModule('/src/features/standup/pages/TeamAssignmentsPage.tsx')
type PageProps = ComponentProps<typeof import('../src/features/standup/pages/TeamAssignmentsPage.tsx').TeamAssignmentsPage>

const noop = () => {}
const props: PageProps = {
  patConfigured: true,
  colorScheme: 'light',
  quickFilterInput: '',
  onQuickFilterInputChange: noop,
  onQuickFilterClear: noop,
  quickFilterInputRef: { current: null },
  selectedMemberFilter: '',
  memberFilterOptions: [],
  onMemberFilterChange: noop,
  onMemberFilterCycle: noop,
  teamOptions: [{
    id: 'team', displayName: 'Team', orgName: 'example-org', projectName: 'example-project',
    areaPath: '', iterationPath: '', teamName: 'Team', repoName: '',
  }],
  selectedTeamId: 'team',
  onTeamChange: noop,
  teamManagementUrl: '',
  onRefresh: noop,
  isTeamDataLoading: false,
  membersError: null,
  workItemsError: null,
  pullRequestBoardItemsError: null,
  assigneesError: null,
  assigneesHistoryWarning: null,
  retryAssigneeHistory: noop,
  members: [],
  workItems: [],
  currentIterationName: 'Sprint',
  changeHighlightsByItemId: {},
  effortFlowPoints: [],
  effortFlowLoading: false,
  workItemAssignees: {},
  iterationWindow: { current: null, next: null },
  iterationLoading: false,
  tagRules: [],
  onTagRulesChange: noop,
  cardHighlightOptions: { freshDays: 1, staleDays: 7 },
  onCardHighlightOptionsChange: noop,
  projectWorkItemTypes: [],
  projectWorkItemTypesLoading: false,
  includeWorkItemTypes: [],
  onIncludeWorkItemTypesChange: noop,
  sprintFilter: { current: true, next: false, nextNext: false, iterationPaths: [] },
  onSprintFilterChange: noop,
  teamIterations: [],
  teamIterationsLoading: false,
  teamIterationsError: null,
  visitedStatusesByItemId: {},
  rolledOverItemIds: {},
}

function render(overrides: Partial<PageProps> = {}) {
  return renderToStaticMarkup(createElement(Root, null, createElement(TeamAssignmentsPage, { ...props, ...overrides })))
}

test('successful empty board explains the result and suggests recovery', () => {
  const html = render()
  assert.match(html, /role="status"[^>]*>No cards available for this team and sprint selection/)
  assert.match(html, /Try Refresh, choose another team, or adjust sprint, work-item type, and hidden-tag filters in Assignments options/)
  assert.match(html, /Dates unavailable/)
  assert.match(html, /Days: unavailable/)
  assert.match(html, /Effort flow unavailable for this sprint/)
  assert.doesNotMatch(html, /Loading effort history/)
})

test('quick-filter and member-filter empty boards explain how to restore cards', () => {
  for (const filters of [{ quickFilterInput: 'QA_NO_MATCH_987654' }, { selectedMemberFilter: 'Example Member', memberFilterOptions: ['Example Member'] }]) {
    const html = render(filters)
    assert.match(html, /No cards match your filters/)
    assert.match(html, /Clear the quick filter or select All team members to restore cards/)
    assert.doesNotMatch(html, /No cards available for this team/)
  }
  assert.match(render({ quickFilterInput: '   ' }), /No cards available for this team/)
})

test('empty guidance does not replace loading, errors, missing configuration, or populated boards', () => {
  for (const overrides of [
    { isTeamDataLoading: true },
    { membersError: 'Members failed' },
    { workItemsError: 'Work items failed' },
    { assigneesError: 'Assignees failed' },
    { patConfigured: false },
    { teamOptions: [] },
    { workItems: [{ id: 123, title: 'Example', status: 'Active' as const }] },
  ]) {
    assert.doesNotMatch(render(overrides), /No cards (?:available|match your filters)/)
  }
})

test('PR failures show recovery guidance without hiding work-item cards', () => {
  const html = render({
    pullRequestBoardItemsError: 'Azure DevOps rejected access to pull requests.',
    workItems: [{ id: 456, title: 'Keep this work item visible', status: 'Active' }],
  })

  assert.match(html, /Pull request data unavailable/)
  assert.match(html, /role="alert"/)
  assert.match(html, /Check that your Azure DevOps PAT has Code \(Read\) access/)
  assert.match(html, /Keep this work item visible/)
})

test('unavailable assignee history warns and retries without hiding the work item', () => {
  const html = render({
    assigneesHistoryWarning:
      'Work-item history is unavailable for 1 item, so the team assignee could not be verified.',
    workItems: [{ id: 456, title: 'Keep this work item visible', status: 'Active' }],
    workItemAssignees: {
      456: { label: 'Assignee unavailable', kind: 'history-unavailable' },
    },
  })

  assert.match(html, /Assignee history unavailable/)
  assert.match(html, /team assignee could not be verified/)
  assert.match(html, />Retry</)
  assert.match(html, /Keep this work item visible/)
  assert.match(html, /Assignee unavailable/)
})

test('iteration metadata failure identifies the operation, withholds board results, and avoids empty-date fallbacks', () => {
  const html = render({
    teamIterationsError: '503 Service Unavailable: diagnostic detail',
    workItems: [{ id: 456, title: 'Do not show degraded-scope results', status: 'Active' }],
  })

  assert.match(html, /Unable to load team iterations/)
  assert.match(html, /team settings\/iterations request failed/)
  assert.match(html, /Board results are withheld because the sprint selection could not be verified/)
  assert.match(html, />Retry</)
  assert.match(html, /Sprint summary unavailable/)
  assert.doesNotMatch(html, /Do not show degraded-scope results/)
  assert.doesNotMatch(html, /Dates unavailable|Days: unavailable|Effort flow unavailable/)
})
