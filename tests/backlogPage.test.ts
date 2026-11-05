import './stratakitNodeGlobals.ts'
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
const { useBacklogPageModel } = await server.ssrLoadModule('/src/features/standup/hooks/useBacklogPageModel.ts')
const { filterBacklogBugs } = await server.ssrLoadModule('/src/features/standup/utils/backlogFilter.ts')
const { formatCreatedDate, getBacklogAgeDays, rankBacklogBugs } = await server.ssrLoadModule('/src/features/standup/utils/backlogValue.ts')
const { formatDayCount } = await server.ssrLoadModule('/src/features/standup/utils/sprintDates.ts')
type PageProps = ComponentProps<typeof import('../src/features/standup/pages/BacklogPage.tsx').BacklogPage>

const document = dom.window.document
const noop = () => {}
const workItemUrl = (id: number) => `https://dev.azure.com/example-org/example-project/_workitems/edit/${id}`
// The Age cell shows a relative age and, for screen readers, the date it counts from.
const ageText = (createdAt: string) => `${formatDayCount(getBacklogAgeDays(createdAt))}Created ${formatCreatedDate(createdAt)}`

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

const iterations = [
  { name: 'Sprint 4', path: 'Project\\Team\\2026\\Sprint 4', timeFrame: 'past', startDate: '2026-05-18', finishDate: '2026-05-29' },
  { name: 'Sprint 5', path: 'Project\\Team\\2026\\Sprint 5', timeFrame: 'current', startDate: '2026-06-01', finishDate: '2026-06-12' },
]

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
    tags: ['needs triage', 'regression'],
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
], iterations)

const defaultProps: PageProps = {
  patConfigured: true,
  teamOptions: [team],
  selectedTeamId: team.id,
  onTeamChange: noop,
  teamManagementUrl: 'https://dev.azure.com/example-org/example-project/_settings/teams',
  quickFilterInput: '',
  onQuickFilterInputChange: noop,
  onQuickFilterClear: noop,
  quickFilterInputRef: { current: null },
  onRefresh: noop,
  bugs,
  totalBugCount: bugs.length,
  isLoading: false,
  error: null,
}

async function mount(t: TestContext, page: ReturnType<typeof createElement>) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  await act(async () => root.render(createElement(Root, null, page)))
  return host
}

// The unfiltered bug count follows the bugs passed in unless a test sets it, as the app does when no filter is typed.
function render(t: TestContext, overrides: Partial<PageProps> = {}) {
  const props = { ...defaultProps, ...overrides }
  return mount(t, createElement(BacklogPage, { ...props, totalBugCount: overrides.totalBugCount ?? props.bugs.length }))
}

// Owns the quick filter with the same hook the app uses, so typing narrows the listed bugs.
function FilterableBacklogPage({ bugs: allBugs, ...props }: PageProps) {
  const model = useBacklogPageModel({ bugs: allBugs })
  return createElement(BacklogPage, {
    ...props,
    quickFilterInput: model.quickFilterInput,
    onQuickFilterInputChange: model.onQuickFilterInputChange,
    onQuickFilterClear: model.onQuickFilterClear,
    bugs: model.filteredBugs,
    totalBugCount: allBugs.length,
  })
}

const renderFilterable = (t: TestContext, overrides: Partial<PageProps> = {}) =>
  mount(t, createElement(FilterableBacklogPage, { ...defaultProps, ...overrides }))

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
const quickFilter = (host: Element) => host.querySelector<HTMLInputElement>('input[aria-label="Quick filter bugs"]')!
const clearFilterButton = (host: Element) => host.querySelector<HTMLButtonElement>('button[aria-label="Clear quick filter"]')
const listedIds = (host: Element) => [...host.querySelectorAll('tbody tr')].map((row) => Number(row.querySelector('td')!.textContent))
const titleCell = (host: Element, id: number) =>
  [...host.querySelectorAll('tbody tr')].find((row) => row.querySelector('td')!.textContent === String(id))!.querySelector('td:nth-child(3)')!
const tagTexts = (cell: Element) => [...cell.querySelectorAll('li')].map((item) => item.textContent)

// React tracks an input's value, so typing has to go through the native setter for the change to be noticed.
const setNativeValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
async function typeFilter(host: Element, text: string) {
  const input = quickFilter(host)
  await act(async () => {
    setNativeValue.call(input, text)
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
}

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

test('the header has the page title, quick filter, team selection, options, and Refresh', async (t) => {
  const quickFilterInputRef = { current: null as HTMLInputElement | null }
  const host = await render(t, { quickFilterInputRef })

  assert.equal(host.querySelector('h1')?.textContent, 'Backlog')
  assert.equal(host.querySelector('[role="combobox"]')?.textContent, 'Team Alpha')

  const filter = quickFilter(host)
  assert.equal(filter.placeholder, 'Quick filter bugs')
  assert.equal(filter.value, '')
  assert.equal(filter.disabled, false)
  assert.equal(filter.getAttribute('aria-keyshortcuts'), '/ Control+F Meta+F')
  assert.equal(quickFilterInputRef.current, filter, 'the ref is what lets / and Ctrl/Cmd+F focus the filter')
  assert.equal(clearFilterButton(host), null, 'there is nothing to clear yet')
  assert.equal(host.querySelector('kbd')?.textContent, '/', 'an empty filter hints at its shortcut')

  assert.equal(host.querySelector('[aria-label="Manage team"]'), null, 'Manage team moved into the Team menu')

  assert.equal(button(host, 'Backlog options').disabled, false)
  assert.equal(button(host, 'Refresh').disabled, false)
})

test('Manage team, at the end of the Team menu, opens Azure DevOps without changing team', async (t) => {
  const teamChanges: string[] = []
  const opened: unknown[][] = []
  const originalOpen = dom.window.open
  dom.window.open = (...args: unknown[]) => { opened.push(args); return null }
  t.after(() => { dom.window.open = originalOpen })
  const host = await render(t, { onTeamChange: (teamId: string) => teamChanges.push(teamId) })

  await act(async () => {
    host.querySelector('[role="combobox"]')!.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, button: 0 }))
  })
  const listbox = document.querySelector('[role="listbox"]')!
  const options = [...listbox.querySelectorAll('[role="option"]')]
  assert.deepEqual(options.map((option) => option.textContent), ['Team Alpha (example-org/example-project)', 'Manage team (opens in a new tab)'])
  assert.equal(listbox.querySelectorAll('[role="separator"]').length, 1, 'a plain separator, not an option, sets it apart')

  await act(async () => { (options[1] as HTMLElement).click() })
  assert.deepEqual(opened, [[defaultProps.teamManagementUrl, '_blank', 'noopener,noreferrer']])
  assert.deepEqual(teamChanges, [])
})

test('the table lists the ranked bugs under the required columns', async (t) => {
  const host = await render(t)

  assert.equal(host.querySelector('table')?.getAttribute('aria-label'), 'Open bugs ranked by value')
  assert.deepEqual(cellTexts(host.querySelector('thead tr')!), [
    'ID', 'Value', 'Title', 'Age', 'Assigned To', 'State', 'Sprint', 'Severity', 'Impact', 'Effort',
  ])

  const rows = [...host.querySelectorAll('tbody tr')]
  assert.deepEqual(rows.map(cellTexts), [
    ['102', '213.0', 'Data loss (opens in a new tab) needs triage regression', ageText('2026-03-01T10:00:00Z'), 'Ada Lovelace', 'Active', 'This sprint', '1 - Critical', '1', '4'],
    ['103', '11.0', 'Slow page (opens in a new tab)', ageText('2026-02-01T10:00:00Z'), 'grace@example.com', 'Active', 'Backlog', '3 - Medium', '2', '8'],
    ['101', '2.5', 'Minor glitch (opens in a new tab)', ageText('2026-01-10T09:00:00Z'), 'Unassigned', 'New', 'Sprint 4 · ended', '?Not set', '?Not set', '?Not set'],
  ])
  assert.equal(rows[0].querySelector('time')!.getAttribute('datetime'), '2026-03-01T10:00:00Z')
  assert.equal(rows[0].querySelector('time [aria-hidden="true"]')!.textContent, formatDayCount(getBacklogAgeDays('2026-03-01T10:00:00Z')))
})

test('an unassigned bug says so in muted text', async (t) => {
  const host = await render(t)

  const unassigned = host.querySelector('tbody tr:last-child')!
  assert.equal(unassigned.querySelector('td:nth-child(1)')!.textContent, '101')
  const label = unassigned.querySelector('td:nth-child(5) > span')!
  assert.equal(label.textContent, 'Unassigned')
  assert.equal(declaredStyle(label)('color'), 'var(--stratakit-color-text-neutral-tertiary)')
})

test('a long state is abbreviated as on the cards, with the full state for screen readers', async (t) => {
  const host = await render(t, {
    bugs: rankBacklogBugs([{ id: 501, title: 'Ready', state: 'Available for Testing', workItemUrl: workItemUrl(501) }]),
  })

  const state = host.querySelector('tbody td:nth-child(6)')!
  assert.equal(state.querySelector('[aria-hidden="true"]')!.textContent, 'AFT')
  assert.equal(state.textContent, 'AFTAvailable for Testing')
})

test('a missing severity, impact, or effort is marked as assumed by the Value', async (t) => {
  const host = await render(t)

  const marks = [...host.querySelectorAll('tbody tr:last-child td')].slice(7)
  assert.deepEqual(marks.map((cell) => cell.querySelector('[aria-hidden="true"]')?.textContent), ['?', '?', '?'])
  for (const cell of marks) {
    const mark = cell.firstElementChild!
    assert.match(declaredStyle(mark)('border'), /dashed/)
  }
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
  assert.equal(cellTexts(row)[9], '2', 'the Effort as entered')
  assert.equal(cellTexts(row)[1], '48.4', 'scored as if the effort were 4')
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

test('the Title cell lists the tags after the title link as outlined badges', async (t) => {
  const host = await render(t)

  const cell = titleCell(host, 102)
  const link = cell.querySelector('a')!
  const list = cell.querySelector('[role="list"][aria-label="Tags"]')!
  assert.equal(link.nextElementSibling, list, 'the tags follow the title')
  assert.equal(link.textContent, 'Data loss (opens in a new tab)', 'the tags are not part of the link text')
  assert.deepEqual(tagTexts(cell), ['needs triage', 'regression'], 'one item per tag, in the order given')

  // These are the attributes StrataKit's stylesheet uses to draw an outlined badge.
  const badges = [...list.querySelectorAll('li .MuiBadge-badge')]
  assert.equal(badges.length, 2)
  for (const badge of badges) {
    assert.ok(badge.matches('.MuiBadge-inline[data-_sk-type="outlined"]'), `"${badge.textContent}" is an outlined inline badge`)
    assert.equal(badge.getAttribute('data-_sk-size'), 'small')
  }
})

test('a bug without tags shows only its title, whether the tag list is missing or empty', async (t) => {
  const host = await render(t, {
    bugs: rankBacklogBugs([
      { id: 401, title: 'No tag list', workItemUrl: workItemUrl(401) },
      { id: 402, title: 'Empty tag list', tags: [], workItemUrl: workItemUrl(402) },
    ]),
  })

  assert.equal(titleCell(host, 401).textContent, 'No tag list (opens in a new tab)')
  assert.equal(titleCell(host, 402).textContent, 'Empty tag list (opens in a new tab)')
  assert.equal(host.querySelector('tbody ul'), null, 'no empty list is left behind')
})

test('a tag that looks like a number is shown as written, not capped like a count', async (t) => {
  const host = await render(t, {
    bugs: rankBacklogBugs([{ id: 301, title: 'Numeric tags', tags: ['0', '150', '2026'], workItemUrl: workItemUrl(301) }]),
  })

  assert.deepEqual(tagTexts(titleCell(host, 301)), ['0', '150', '2026'])
})

test('the table has no sorting, filtering, or selection controls', async (t) => {
  const host = await render(t)

  const table = host.querySelector('table')!
  assert.equal(
    table.querySelector('button, input, select, textarea, [role="button"], [role="checkbox"], [aria-sort], [aria-selected], [tabindex]'),
    null,
  )
  assert.equal(table.querySelectorAll('a').length, bugs.length, 'the title links are the only interactive elements, so the tags are not')
})

// StrataKit's TableBody turns row hover on; only the stylesheet rule shows the highlight is really themed.
function hoverBackgrounds() {
  const found: string[] = []
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules) as Array<CSSStyleRule & CSSGroupingRule>) {
      if (rule.selectorText?.includes('MuiTableRow-hover') && rule.selectorText.includes(':hover')) {
        found.push(rule.style.getPropertyValue('background-color'))
      }
      if (rule.cssRules) visit(rule.cssRules)
    }
  }
  for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules)
  return found
}

test('body rows highlight on hover and the header row does not', async (t) => {
  const host = await render(t)

  const rows = [...host.querySelectorAll('tbody tr')]
  assert.equal(rows.length, bugs.length)
  for (const row of rows) {
    assert.ok(row.classList.contains('MuiTableRow-hover'), `the row for bug ${row.firstElementChild!.textContent}`)
  }
  assert.equal(host.querySelector('thead tr')!.classList.contains('MuiTableRow-hover'), false)
  assert.ok(hoverBackgrounds().some((background) => /hover/.test(background)), 'the theme styles the hovered row background')
})

test('typing in the quick filter reports the text to the app', async (t) => {
  const typed: string[] = []
  const host = await render(t, { onQuickFilterInputChange: (value: string) => typed.push(value) })

  await typeFilter(host, 'ada')

  assert.deepEqual(typed, ['ada'])
})

test('the quick filter shows its text and the clear button calls back', async (t) => {
  let cleared = 0
  const host = await render(t, { quickFilterInput: 'ada', onQuickFilterClear: () => { cleared++ } })

  assert.equal(quickFilter(host).value, 'ada')
  await act(async () => clearFilterButton(host)!.click())

  assert.equal(cleared, 1)
})

test('typing in the quick filter narrows the table to the bugs that match', async (t) => {
  const host = await renderFilterable(t)
  assert.deepEqual(listedIds(host), [102, 103, 101])

  await typeFilter(host, '  LOVELACE ')
  await waitFor(() => listedIds(host).length === 1)

  assert.deepEqual(listedIds(host), [102])
  assert.equal(host.querySelector('table')?.getAttribute('aria-label'), 'Open bugs ranked by value')
  assert.equal(quickFilter(host).value, '  LOVELACE ', 'the text is shown as typed')
})

test('typing a tag in the quick filter narrows the table to the bugs with that tag', async (t) => {
  const host = await renderFilterable(t)

  await typeFilter(host, ' TRIAGE')
  await waitFor(() => listedIds(host).length === 1)

  assert.deepEqual(listedIds(host), [102])
  assert.deepEqual(tagTexts(titleCell(host, 102)), ['needs triage', 'regression'], 'the bug still lists all of its tags')
})

test('the quick filter keeps the ranked order of the bugs it leaves', async (t) => {
  const host = await renderFilterable(t)

  await typeFilter(host, 'active')
  await waitFor(() => listedIds(host).length === 2)
  assert.deepEqual(listedIds(host), [102, 103])

  await typeFilter(host, 'sprint')
  await waitFor(() => listedIds(host).length === 2 && listedIds(host)[1] === 101)
  assert.deepEqual(listedIds(host), [102, 101])
})

test('a quick filter that matches nothing says so, and clearing it restores every bug', async (t) => {
  const host = await renderFilterable(t)

  await typeFilter(host, 'no such bug')
  await waitFor(() => host.querySelector('table') === null)

  assert.match(host.querySelector('[role="status"]')!.textContent!, /No bugs match the quick filter/)
  assert.equal(host.querySelector('h2'), null, 'this is not the empty state of a team without open bugs')
  assert.equal(quickFilter(host).value, 'no such bug', 'the filter stays available to edit')

  await act(async () => clearFilterButton(host)!.click())
  await waitFor(() => host.querySelector('table') !== null)

  assert.deepEqual(listedIds(host), [102, 103, 101])
  assert.equal(quickFilter(host).value, '')
  assert.equal(clearFilterButton(host), null)
})

test('a team with no open bugs keeps its empty state even if a filter is typed', async (t) => {
  const host = await render(t, { bugs: [], quickFilterInput: 'ada' })

  assert.equal(host.querySelector('h2')?.textContent, 'No open bugs')
  assert.equal(host.querySelector('[role="status"]'), null)
})

test('every cell the table shows can be found with the quick filter', async (t) => {
  const host = await render(t)

  let tagsChecked = 0
  for (const row of host.querySelectorAll('tbody tr')) {
    const cells = [...row.querySelectorAll('td')]
    const id = Number(cells[0].textContent)
    // The Title cell shows the title and then one badge per tag, and the filter searches each of them on its own.
    // Age is relative to today, so it is left out of the filter on purpose.
    const tags = [...cells[2].querySelectorAll('li')]
    tagsChecked += tags.length
    const shown = [cells[0], cells[1], cells[2].querySelector('a')!, ...tags, ...cells.slice(4)]
      .map((element) => (element.textContent ?? '').replace(' (opens in a new tab)', ''))
    for (const text of shown.filter((cell) => cell && cell !== '?Not set')) {
      assert.ok(filterBacklogBugs(bugs, text).some((bug) => bug.id === id), `"${text}" is shown for bug ${id}`)
    }
  }
  assert.equal(tagsChecked, 2, 'the tags of the fixture bugs were checked too')
})

test('visually hidden text is 1px and anchored to the scrolling table so it cannot widen the page', async (t) => {
  const host = await render(t)

  const hidden = [...host.querySelectorAll('tbody span')]
    .filter((span) => /^(\s\(opens in a new tab\)|Not set|Created .+)$/.test(span.textContent ?? ''))
  assert.equal(hidden.length, bugs.length * 2 + 3, 'a new-tab note and a created date per bug, plus the three missing values')
  for (const span of hidden) {
    const style = declaredStyle(span)
    assert.deepEqual([style('position'), style('width'), style('height')], ['absolute', '1px', '1px'])
  }
  assert.equal(declaredStyle(host.querySelector('.MuiTableContainer-root')!)('position'), 'relative')
})

test('the header counts the listed bugs, out of all of them while a filter hides some', async (t) => {
  const host = await render(t)
  const count = () => host.querySelector('header [aria-live="polite"]')!.textContent

  assert.equal(count(), '3 bugs')

  const filtered = await render(t, { bugs: bugs.slice(0, 1), totalBugCount: 3 })
  assert.equal(filtered.querySelector('header [aria-live="polite"]')!.textContent, '1 of 3 bugs')
})

test('the header has no count while there is no list to count', async (t) => {
  for (const overrides of [{ isLoading: true }, { error: 'Failed' }, { teamOptions: [], selectedTeamId: '' }]) {
    const host = await render(t, { ...overrides, bugs: [] })
    assert.equal(host.querySelector('header [aria-live="polite"]')!.textContent, '', JSON.stringify(overrides))
  }
})

test('the header says when the backlog last synced, and Syncing while it loads', async (t) => {
  const synced = await render(t, { syncedAt: Date.now() - 5 * 60_000 })
  assert.match(synced.querySelector('header')!.textContent!, /Synced 5m ago/)

  const loading = await render(t, { isLoading: true, bugs: [], syncedAt: Date.now() })
  assert.match(loading.querySelector('header')!.textContent!, /Syncing…/)
  assert.equal(button(loading, 'Refresh').getAttribute('aria-busy'), 'true')
  assert.ok(button(loading, 'Refresh').querySelector('.MuiCircularProgress-root'), 'Refresh spins while the backlog loads')

  const never = await render(t)
  assert.doesNotMatch(never.querySelector('header')!.textContent!, /Sync/)
})

test('a loading backlog shows progress instead of the table', async (t) => {
  const host = await render(t, { isLoading: true, bugs: [] })

  assert.match(host.querySelector('[role="status"]')!.textContent!, /Loading backlog/)
  assert.equal(host.querySelector('table'), null)
  assert.equal(button(host, 'Refresh').disabled, true, 'Refresh waits for the current load')
  assert.equal(button(host, 'Backlog options').disabled, false)
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
  assert.equal(button(host, 'Backlog options').disabled, true)
  assert.equal(button(host, 'Refresh').disabled, true)
})

test('without a PAT the quick filter, options, and Refresh buttons are disabled', async (t) => {
  const host = await render(t, { patConfigured: false })

  assert.equal(quickFilter(host).disabled, true)
  assert.equal(button(host, 'Backlog options').disabled, true)
  assert.equal(button(host, 'Refresh').disabled, true)
})

test('Refresh calls back to the app', async (t) => {
  let refreshes = 0
  const host = await render(t, { onRefresh: () => { refreshes++ } })

  await act(async () => button(host, 'Refresh').click())

  assert.equal(refreshes, 1)
})

test('the options button opens a placeholder dialog that Close dismisses', async (t) => {
  const host = await render(t)
  assert.equal(dialog(), null)

  await act(async () => button(host, 'Backlog options').click())

  const opened = dialog()!
  assert.ok(opened)
  assert.equal(document.getElementById(opened.getAttribute('aria-labelledby')!)?.textContent, 'Backlog options')
  assert.match(opened.textContent!, /no options yet/)

  await act(async () => [...opened.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Close')!.click())
  await waitFor(() => dialog() === null)
})

test('Escape dismisses the options dialog', async (t) => {
  const host = await render(t)
  await act(async () => button(host, 'Backlog options').click())
  assert.ok(dialog())

  await act(async () => dialog()!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  await waitFor(() => dialog() === null)
})
