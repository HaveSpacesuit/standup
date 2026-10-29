import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement, type ComponentProps } from 'react'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Document: dom.window.Document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  ShadowRoot: dom.window.ShadowRoot,
  MutationObserver: dom.window.MutationObserver,
  IS_REACT_ACT_ENVIRONMENT: true,
})
const { createRoot } = await import('react-dom/client')
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(async () => {
  await server.close()
  dom.window.close()
})
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { BacklogPage } = await server.ssrLoadModule('/src/features/standup/pages/BacklogPage.tsx')
const { formatCreatedDate, rankBacklogBugs } = await server.ssrLoadModule('/src/features/standup/utils/backlogValue.ts')
type PageProps = ComponentProps<typeof import('../src/features/standup/pages/BacklogPage.tsx').BacklogPage>

const document = dom.window.document
const noop = () => {}
const workItemUrl = (id: number) => `https://dev.azure.com/example-org/example-project/_workitems/edit/${id}`

const team = {
  id: 'team',
  displayName: 'Team Alpha',
  orgName: 'example-org',
  projectName: 'example-project',
  areaPath: 'example-project\\Alpha',
  iterationPath: 'example-project',
  teamName: 'Alpha',
  repoName: '',
}

const bugs: PageProps['bugs'] = rankBacklogBugs([
  {
    id: 101,
    title: 'Minor glitch',
    state: 'New',
    createdAt: '2026-01-10T09:00:00Z',
    iterationPath: 'Project\\Team\\2026\\Sprint 4',
    workItemUrl: workItemUrl(101),
  },
  {
    id: 102,
    title: 'Data loss',
    state: 'Active',
    createdAt: '2026-03-01T10:00:00Z',
    assignedTo: { displayName: 'Ada Lovelace', uniqueName: 'ada@example.com' },
    iterationPath: 'Project\\Team\\2026\\Sprint 5',
    severity: '1 - Critical',
    priority: 1,
    effort: 4,
    workItemUrl: workItemUrl(102),
  },
  {
    id: 103,
    title: 'Slow page',
    state: 'Active',
    createdAt: '2026-02-01T10:00:00Z',
    assignedTo: { uniqueName: 'grace@example.com' },
    iterationPath: 'Project',
    severity: '3 - Medium',
    priority: 2,
    effort: 8,
    workItemUrl: workItemUrl(103),
  },
])

const defaultProps: PageProps = {
  patConfigured: true,
  teamOptions: [team],
  selectedTeamId: team.id,
  onTeamChange: noop,
  teamManagementUrl: 'https://dev.azure.com/example-org/example-project/_settings/teams',
  onRefresh: noop,
  bugs,
  isLoading: false,
  error: null,
}

async function render(t: TestContext, overrides: Partial<PageProps> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  await act(async () => root.render(createElement(Root, null, createElement(BacklogPage, { ...defaultProps, ...overrides }))))
  return host
}

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 3000
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'timed out waiting for the page to update')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)) })
  }
}

const cellTexts = (row: Element) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent)
const button = (host: Element, label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const dialog = () => document.querySelector('[role="dialog"]')

// The theme's rules sit inside @layer blocks, which jsdom's getComputedStyle does not resolve, so read the class rules.
function declaredStyle(element: Element) {
  const classes = new Set(element.classList)
  const matched: CSSStyleDeclaration[] = []
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules) as Array<CSSStyleRule & CSSGroupingRule>) {
      if (rule.selectorText && classes.has(rule.selectorText.replace(/^\./, ''))) matched.push(rule.style)
      if (rule.cssRules) visit(rule.cssRules)
    }
  }
  for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules)
  return (property: string) => matched.map((style) => style.getPropertyValue(property)).findLast(Boolean) ?? ''
}

test('the header has the page title, team selection, Manage team, settings, and Refresh but no quick filter', async (t) => {
  const host = await render(t)

  assert.equal(host.querySelector('h1')?.textContent, 'Backlog')
  assert.equal(host.querySelector('[role="combobox"]')?.textContent, 'Team Alpha')

  const manageTeam = host.querySelector('a[aria-label="Manage team"]')
  assert.equal(manageTeam?.getAttribute('href'), defaultProps.teamManagementUrl)
  assert.equal(manageTeam?.getAttribute('target'), '_blank')

  assert.equal(button(host, 'Backlog settings').disabled, false)
  assert.equal(button(host, 'Refresh').disabled, false)
  const textInputs = [...host.querySelectorAll('input')].filter((input) => input.getAttribute('aria-hidden') !== 'true')
  assert.equal(textInputs.length, 0, 'only the Select\'s hidden native input is present')
  assert.doesNotMatch(host.textContent!, /Quick filter/i)
})

test('the table lists the ranked bugs under the required columns', async (t) => {
  const host = await render(t)

  assert.equal(host.querySelector('table')?.getAttribute('aria-label'), 'Open bugs ranked by value')
  assert.deepEqual(cellTexts(host.querySelector('thead tr')!), [
    'ID', 'Title', 'Created Date', 'Assigned To', 'State', 'Iteration Path', 'Severity', 'Impact', 'Effort', 'Value',
  ])

  const rows = [...host.querySelectorAll('tbody tr')]
  assert.deepEqual(rows.map(cellTexts), [
    ['102', 'Data loss (opens in a new tab)', formatCreatedDate('2026-03-01T10:00:00Z'), 'Ada Lovelace', 'Active', '2026\\Sprint 5', '1 - Critical', '1', '4', '213.0'],
    ['103', 'Slow page (opens in a new tab)', formatCreatedDate('2026-02-01T10:00:00Z'), 'grace@example.com', 'Active', 'Project', '3 - Medium', '2', '8', '11.0'],
    ['101', 'Minor glitch (opens in a new tab)', formatCreatedDate('2026-01-10T09:00:00Z'), '', 'New', '2026\\Sprint 4', '—Not set', '—Not set', '—Not set', '2.5'],
  ])
  assert.match(rows[0].querySelector('time')!.textContent!, /2026/)
  assert.equal(rows[0].querySelector('time')!.getAttribute('datetime'), '2026-03-01T10:00:00Z')
})

test('an unassigned bug leaves its Assigned To cell empty', async (t) => {
  const host = await render(t)

  const unassigned = host.querySelector('tbody tr:last-child')!
  assert.equal(unassigned.querySelector('td:nth-child(1)')!.textContent, '101')
  const assignedTo = unassigned.querySelector('td:nth-child(4)')!
  assert.equal(assignedTo.textContent, '')
  assert.equal(assignedTo.children.length, 0)
})

test('Effort shows the entered value while the Value uses the minimum effort', async (t) => {
  const lowEffort = rankBacklogBugs([{
    id: 201,
    title: 'Quick fix',
    severity: '2 - High',
    priority: 2,
    effort: 2,
    workItemUrl: workItemUrl(201),
  }])
  const host = await render(t, { bugs: lowEffort })

  const [row] = [...host.querySelectorAll('tbody tr')]
  assert.equal(cellTexts(row)[8], '2', 'the Effort as entered')
  assert.equal(cellTexts(row)[9], '48.4', 'scored as if the effort were 4')
})

test('each title links to its work item in a new tab', async (t) => {
  const host = await render(t)

  const links = [...host.querySelectorAll('tbody a')]
  assert.deepEqual(links.map((link) => link.getAttribute('href')), [workItemUrl(102), workItemUrl(103), workItemUrl(101)])
  for (const link of links) {
    assert.equal(link.getAttribute('target'), '_blank')
    assert.equal(link.getAttribute('rel'), 'noreferrer noopener')
  }
})

test('the table has no sorting, filtering, or selection controls', async (t) => {
  const host = await render(t)

  const table = host.querySelector('table')!
  assert.equal(
    table.querySelector('button, input, select, textarea, [role="button"], [role="checkbox"], [aria-sort], [aria-selected], [tabindex]'),
    null,
  )
  assert.equal(table.querySelectorAll('a').length, bugs.length, 'the title links are the only interactive elements')
})

test('visually hidden text is 1px and anchored to the scrolling table so it cannot widen the page', async (t) => {
  const host = await render(t)

  const hidden = [...host.querySelectorAll('tbody span')].filter((span) => /^(\s\(opens in a new tab\)|Not set)$/.test(span.textContent ?? ''))
  assert.equal(hidden.length, bugs.length + 3, 'one new-tab note per bug plus the three missing values')
  for (const span of hidden) {
    const style = declaredStyle(span)
    assert.deepEqual([style('position'), style('width'), style('height')], ['absolute', '1px', '1px'])
  }
  assert.equal(declaredStyle(host.querySelector('.MuiTableContainer-root')!)('position'), 'relative')
})

test('a loading backlog shows progress instead of the table', async (t) => {
  const host = await render(t, { isLoading: true, bugs: [] })

  assert.match(host.querySelector('[role="status"]')!.textContent!, /Loading backlog/)
  assert.equal(host.querySelector('table'), null)
  assert.equal(button(host, 'Refresh').disabled, true, 'Refresh waits for the current load')
  assert.equal(button(host, 'Backlog settings').disabled, false)
})

test('a failed load shows the error instead of the table', async (t) => {
  const host = await render(t, { error: 'Azure DevOps query failed (HTTP 503). Try refreshing.', bugs: [] })

  const alert = host.querySelector('[role="alert"]')!
  assert.match(alert.textContent!, /Unable to load backlog/)
  assert.match(alert.textContent!, /HTTP 503/)
  assert.equal(host.querySelector('table'), null)
})

test('a team with no open bugs shows an empty state', async (t) => {
  const host = await render(t, { bugs: [] })

  assert.equal(host.querySelector('h2')?.textContent, 'No open bugs')
  assert.equal(host.querySelector('table'), null)
})

test('without a configured team the page asks for one and disables the page actions', async (t) => {
  const host = await render(t, { teamOptions: [], selectedTeamId: '', bugs: [] })

  assert.equal(host.querySelector('h2')?.textContent, 'Configure at least one team')
  assert.match(host.textContent!, /Backlog needs a team profile to load data/)
  assert.equal(host.querySelector('table'), null)
  assert.equal(button(host, 'Backlog settings').disabled, true)
  assert.equal(button(host, 'Refresh').disabled, true)
})

test('without a PAT the settings and Refresh buttons are disabled', async (t) => {
  const host = await render(t, { patConfigured: false })

  assert.equal(button(host, 'Backlog settings').disabled, true)
  assert.equal(button(host, 'Refresh').disabled, true)
})

test('Refresh calls back to the app', async (t) => {
  let refreshes = 0
  const host = await render(t, { onRefresh: () => { refreshes++ } })

  await act(async () => button(host, 'Refresh').click())

  assert.equal(refreshes, 1)
})

test('the settings button opens a placeholder dialog that Close dismisses', async (t) => {
  const host = await render(t)
  assert.equal(dialog(), null)

  await act(async () => button(host, 'Backlog settings').click())

  const opened = dialog()!
  assert.ok(opened)
  assert.equal(document.getElementById(opened.getAttribute('aria-labelledby')!)?.textContent, 'Backlog settings')
  assert.match(opened.textContent!, /no settings yet/)

  await act(async () => [...opened.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Close')!.click())
  await waitFor(() => dialog() === null)
})

test('Escape dismisses the settings dialog', async (t) => {
  const host = await render(t)
  await act(async () => button(host, 'Backlog settings').click())
  assert.ok(dialog())

  await act(async () => dialog()!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  await waitFor(() => dialog() === null)
})
