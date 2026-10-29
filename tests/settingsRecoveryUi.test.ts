import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { parseStoredQaOptions } from '../src/features/standup/utils/qaOptions.ts'

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
const { StandupContent } = await server.ssrLoadModule('/src/features/standup/components/StandupContent.tsx')

function render(teamProfilesUnreadable = false, qaOptionsUnreadable = false, activeView = 'qa-activity') {
  const qualityAssurancePageProps = {
    patConfigured: true,
    colorScheme: 'light',
    teamOptions: [],
    selectedTeamId: '',
    quickFilterInput: '',
    quickFilterInputRef: { current: null },
    buckets: [],
    isLoading: false,
    newItemsError: null,
    historyWarning: null,
    qaOptions: parseStoredQaOptions(null),
    qaOptionsUnreadable,
    cardHighlightOptions: { freshDays: 1, staleDays: 7 },
  }
  const backlogPageProps = {
    patConfigured: true,
    teamOptions: [],
    selectedTeamId: '',
    onTeamChange: () => {},
    teamManagementUrl: '',
    onRefresh: () => {},
    bugs: [],
    isLoading: false,
    error: null,
  }
  return renderToStaticMarkup(createElement(Root, null, createElement(StandupContent, {
    activeView,
    teamProfilesUnreadable,
    teamAssignmentsPageProps: { selectedTeamId: '' },
    qualityAssurancePageProps,
    backlogPageProps,
    testsPageProps: {},
  })))
}

test('unreadable team profiles show a recovery alert alongside the empty state', () => {
  const html = render(true)
  assert.match(html, /role="alert"/)
  assert.match(html, /Saved team profiles could not be read/)
  assert.match(html, /no teams are loaded/)
  assert.match(html, /stored data has been kept/)
  assert.match(html, /import a backup or add a team/)
  assert.match(html, /Configure at least one team/)
})

test('genuinely empty profiles do not show a corruption warning', () => {
  const html = render()
  assert.match(html, /Configure at least one team/)
  assert.doesNotMatch(html, /could not be read|Defaults are in use/)
})

test('unreadable QA options explain fallback scope and recovery without hiding content', () => {
  const html = render(false, true)
  assert.match(html, /role="alert"/)
  assert.match(html, /Saved QA options for this team could not be read/)
  assert.match(html, /all work item types, a 21-day lookback, no sprint restrictions/)
  assert.match(html, /default state\/tag classification/)
  assert.match(html, /import a backup/)
  assert.match(html, /Closing without changes keeps the unreadable data/)
  assert.match(html, /Configure at least one team/)
})

test('the Backlog view shows the recovery alert alongside its own empty state', () => {
  const html = render(true, false, 'backlog')
  assert.match(html, /<h1[^>]*>Backlog<\/h1>/)
  assert.match(html, /role="alert"/)
  assert.match(html, /Saved team profiles could not be read/)
  assert.match(html, /Backlog needs a team profile to load data/)
  assert.doesNotMatch(html, /Quality Assurance|Saved QA options/)
})
