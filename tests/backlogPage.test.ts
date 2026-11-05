import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement, type ComponentProps } from 'react'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
// The assignee avatars read the saved PAT from the bare storage globals.
for (const name of ['localStorage', 'sessionStorage']) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value: { getItem: () => null } })
  after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  })
}
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
// The text a sighted user reads: without decorative (aria-hidden) parts such as the avatar initial or the "?" mark.
function visibleText(element: Element) {
  const copy = element.cloneNode(true) as Element
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
  return copy.textContent ?? ''
}
const button = (host: Element, label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const dialog = () => document.querySelector('[role="dialog"]')
const quickFilter = (host: Element) => host.querySelector<HTMLInputElement>('input[aria-label="Quick filter bugs"]')!
const clearFilterButton = (host: Element) => host.querySelector<HTMLButtonElement>('button[aria-label="Clear quick filter"]')
const rowId = (row: Element) => Number(row.querySelector('.backlog-bug-id')!.textContent)
const listedIds = (host: Element) => [...host.querySelectorAll('tbody tr')].map(rowId)
const rowFor = (host: Element, id: number) => [...host.querySelectorAll('tbody tr')].find((row) => rowId(row) === id)!
const titleCell = (host: Element, id: number) => rowFor(host, id).querySelector('td:nth-child(3)')!
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

/** Like declaredStyle, for a rule an element's sx sets on a descendant, such as `& .child`. */
function nestedStyle(element: Element, descendant: string) {
  const prefixes = Array.from(element.classList, (name) => `.${name}`)
  const matched: CSSStyleDeclaration[] = []
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules) as Array<CSSStyleRule & CSSGroupingRule>) {
      const selector = rule.selectorText?.replace(/\s+/g, ' ')
      if (selector && prefixes.some((prefix) => selector === `${prefix} ${descendant}`)) matched.push(rule.style)
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
    '#Rank', 'Value', 'Bug', 'Severity', 'Impact', 'Effort', 'Age', 'Sprint', 'State', 'Assigned to',
  ])

  const rows = [...host.querySelectorAll('tbody tr')]
  assert.deepEqual(rows.map((row) => [...row.querySelectorAll('td')].map(visibleText)), [
    ['1', '213.0', '102 Data loss (opens in a new tab) needs triage regression', 'S1 · Critical', '1', '4', 'Created ' + formatCreatedDate('2026-03-01T10:00:00Z'), 'This sprint', 'Active', 'Ada Lovelace'],
    ['2', '11.0', '103 Slow page (opens in a new tab)', 'S3 · Medium', '2', '8', 'Created ' + formatCreatedDate('2026-02-01T10:00:00Z'), 'Backlog', 'Active', 'grace@example.com'],
    ['3', '2.5', '101 Minor glitch (opens in a new tab)', 'Not set', 'Not set', 'Not set', 'Created ' + formatCreatedDate('2026-01-10T09:00:00Z'), 'Sprint 4 · ended', 'New', 'Unassigned'],
  ])
  assert.equal(cellTexts(rows[0])[6], ageText('2026-03-01T10:00:00Z'), 'the age is shown, and the date read out')
  assert.equal(rows[0].querySelector('time')!.getAttribute('datetime'), '2026-03-01T10:00:00Z')
  assert.equal(rows[0].querySelector('time [aria-hidden="true"]')!.textContent, formatDayCount(getBacklogAgeDays('2026-03-01T10:00:00Z')))
})

test('the rank is the place among all open bugs, so it holds while the quick filter hides some', async (t) => {
  const host = await render(t, { bugs: filterBacklogBugs(bugs, 'medium'), totalBugCount: bugs.length })

  const [row] = [...host.querySelectorAll('tbody tr')]
  assert.equal(rowId(row), 103)
  assert.equal(row.querySelector('td')!.textContent, '2')
})

test('the Value has a meter that fills on a log scale and is hidden from screen readers', async (t) => {
  const host = await render(t)

  const meters = [...host.querySelectorAll('tbody td:nth-child(2) span[aria-hidden="true"]')]
  assert.equal(meters.length, bugs.length)
  const widths = meters.map((meter) => (meter.firstElementChild as HTMLElement).style.width)
  assert.deepEqual(widths, ['100%', '33.3%', '4%'], 'the highest Value fills it; the lowest at the minimum effort keeps a sliver')
})

test('an unassigned bug says so in muted text, and an assignee has an avatar beside the name', async (t) => {
  const host = await render(t)

  const unassigned = rowFor(host, 101)
  const label = unassigned.querySelector('td:nth-child(10) > span')!
  assert.equal(label.textContent, 'Unassigned')
  assert.equal(declaredStyle(label)('color'), 'var(--stratakit-color-text-neutral-tertiary)')

  const assigned = rowFor(host, 102).querySelector('td:nth-child(10)')!
  const avatar = assigned.querySelector('.MuiAvatar-root')!
  assert.equal(avatar.getAttribute('aria-hidden'), 'true', 'the initial is not read before the name')
  assert.equal(avatar.textContent, 'A')
  assert.equal(visibleText(assigned), 'Ada Lovelace')
})

test('a New bug shows its state in muted text, and any other state is a badge', async (t) => {
  const host = await render(t)

  const fresh = rowFor(host, 101).querySelector('td:nth-child(9)')!
  assert.equal(fresh.querySelector('.MuiBadge-badge'), null)
  assert.equal(declaredStyle(fresh.firstElementChild!)('color'), 'var(--stratakit-color-text-neutral-tertiary)')

  const active = rowFor(host, 102).querySelector('td:nth-child(9) .MuiBadge-badge')!
  assert.equal(active.textContent, 'Active')
  assert.ok(active.matches('.MuiBadge-inline[data-_sk-type="outlined"]'))
})

test('a long state is abbreviated as on the cards, with the full state for screen readers', async (t) => {
  const host = await render(t, {
    bugs: rankBacklogBugs([{ id: 501, title: 'Ready', state: 'Available for Testing', workItemUrl: workItemUrl(501) }]),
  })

  const state = host.querySelector('tbody td:nth-child(9)')!
  assert.equal(state.querySelector('[aria-hidden="true"]')!.textContent, 'AFT')
  assert.equal(state.querySelector('[aria-hidden="true"] .MuiBadge-badge')!.textContent, 'AFT')
  assert.equal(state.textContent, 'AFTAvailable for Testing')
})

test('the severity is a chip whose color climbs with the level', async (t) => {
  const host = await render(t, {
    bugs: rankBacklogBugs(['1 - Critical', '2 - High', '3 - Medium', '4 - Low', 'Blocker'].map((severity, index) => ({
      id: 601 + index,
      title: severity,
      severity,
      workItemUrl: workItemUrl(601 + index),
    }))),
  })

  const chip = (id: number) => rowFor(host, id).querySelector('td:nth-child(4) > span')!
  assert.deepEqual([601, 602, 603, 604, 605].map((id) => chip(id).textContent), [
    'S1 · Critical', 'S2 · High', 'S3 · Medium', 'S4 · Low', 'Blocker',
  ])
  assert.deepEqual([601, 602, 603, 604, 605].map((id) => chip(id).getAttribute('data-level')), ['1', '2', '3', '4', null])
  assert.equal(chip(601).querySelector('b')!.textContent, 'S1', 'the level stands out from the name')
})

test('a missing severity, impact, or effort is marked as assumed by the Value', async (t) => {
  const host = await render(t)

  const cells = [...rowFor(host, 101).querySelectorAll('td')]
  const severity = cells[3].firstElementChild!
  assert.equal(severity.textContent, 'Not set')
  assert.match(declaredStyle(severity)('border'), /dashed/)

  const marks = cells.slice(4, 6)
  assert.deepEqual(marks.map((cell) => cell.querySelector('[aria-hidden="true"]')?.textContent), ['?', '?'])
  for (const cell of marks) {
    assert.match(declaredStyle(cell.firstElementChild!)('border'), /dashed/)
  }
})

test('Impact shows signal bars that fill as more users hit the bug', async (t) => {
  const host = await render(t)

  const bars = (id: number) => [...rowFor(host, id).querySelectorAll('td:nth-child(5) [aria-hidden="true"] > span')]
  assert.deepEqual(bars(102).map((bar) => bar.hasAttribute('data-on')), [true, true, true, true], 'Impact 1: most users')
  assert.deepEqual(bars(103).map((bar) => bar.hasAttribute('data-on')), [true, true, true, false], 'Impact 2')
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
  assert.equal(cellTexts(row)[5], '2', 'the Effort as entered')
  assert.equal(cellTexts(row)[1], '48.4', 'scored as if the effort were 4')
  assert.equal(declaredStyle(row.querySelector('td:nth-child(6) > span')!)('text-decoration-style'), 'dotted', 'marked as raised')
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

  assert.equal(titleCell(host, 401).textContent, '401 No tag list (opens in a new tab)')
  assert.equal(titleCell(host, 402).textContent, '402 Empty tag list (opens in a new tab)')
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
    const id = rowId(row)
    // The Bug cell shows the id, the title, and then one badge per tag, and the filter searches each of them on its own.
    // Rank and Age shift as bugs come and go and grow older, so they are left out of the filter on purpose.
    const tags = [...cells[2].querySelectorAll('li')]
    tagsChecked += tags.length
    const shown = [cells[2].querySelector('.backlog-bug-id')!, cells[1], cells[2].querySelector('a')!, ...tags, ...cells.slice(3, 6), ...cells.slice(7)]
      .map((element) => visibleText(element).replace(' (opens in a new tab)', ''))
    for (const text of shown.filter((cell) => cell && cell !== 'Not set')) {
      assert.ok(filterBacklogBugs(bugs, text).some((bug) => bug.id === id), `"${text}" is shown for bug ${id}`)
    }
  }
  assert.equal(tagsChecked, 2, 'the tags of the fixture bugs were checked too')
})

test('visually hidden text is 1px and anchored to the scrolling table so it cannot widen the page', async (t) => {
  const host = await render(t)

  const hidden = [...host.querySelectorAll('tbody span')].filter((span) => declaredStyle(span)('clip-path') === 'inset(50%)')
  assert.deepEqual(
    hidden.map((span) => span.textContent!.replace(/^Created .+$/, 'Created')).sort(),
    [...Array(bugs.length).fill(' (opens in a new tab)'), ...Array(bugs.length).fill('Created'), 'Not set', 'Not set'].sort(),
    'a new-tab note and a created date per bug, plus the missing impact and effort',
  )
  for (const span of hidden) {
    const style = declaredStyle(span)
    assert.deepEqual([style('position'), style('width'), style('height')], ['absolute', '1px', '1px'])
  }
  assert.equal(declaredStyle(host.querySelector('.MuiTableContainer-root')!)('position'), 'relative')
})

test('compact rows keep one line: the first tag, then a count of the rest, and the avatar without the name', async (t) => {
  const host = await render(t, { compactRows: true })

  const cell = titleCell(host, 102)
  assert.deepEqual(tagTexts(cell), ['needs triage', '+1and regression'])
  assert.equal(cell.querySelectorAll('.MuiBadge-badge').length, 1)
  const wrapper = cell.firstElementChild!
  assert.equal(declaredStyle(wrapper)('white-space'), 'nowrap')
  assert.equal(nestedStyle(wrapper, '.backlog-bug-title')('text-overflow'), 'ellipsis', 'only the title gives way')
  assert.equal(nestedStyle(wrapper, '.backlog-bug-title')('overflow'), 'hidden')
  assert.equal(cell.querySelector('a .backlog-bug-title')?.textContent, 'Data loss')

  const assignee = rowFor(host, 102).querySelector('td:nth-child(10)')!
  assert.ok(assignee.querySelector('.MuiAvatar-root'))
  assert.equal(visibleText(assignee), 'Ada Lovelace', 'the name is still read out')
  const name = [...assignee.querySelectorAll('span')].find((span) => span.textContent === 'Ada Lovelace')!
  assert.equal(declaredStyle(name)('clip-path'), 'inset(50%)', 'but only for screen readers')

  const filtered = filterBacklogBugs(bugs, 'regression')
  assert.deepEqual(filtered.map((bug) => bug.id), [102], 'a tag counted in "+1" still matches the quick filter')
})

test('comfortable rows list every tag and the assignee name', async (t) => {
  const host = await render(t)

  assert.deepEqual(tagTexts(titleCell(host, 102)), ['needs triage', 'regression'])
  assert.equal(declaredStyle(titleCell(host, 102).firstElementChild!)('white-space'), '')
  assert.equal(nestedStyle(titleCell(host, 102).firstElementChild!, '.backlog-bug-title')('text-overflow'), '')
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

test('the options dialog sets compact rows, the density shared with the Development and QA cards', async (t) => {
  const changes: boolean[] = []
  const host = await render(t, { compactRows: false, onCompactRowsChange: (next: boolean) => changes.push(next) })
  assert.equal(dialog(), null)

  await act(async () => button(host, 'Backlog options').click())

  const opened = dialog()!
  assert.equal(document.getElementById(opened.getAttribute('aria-labelledby')!)?.textContent, 'Backlog options')
  const checkbox = [...opened.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    .find((input) => input.closest('label')?.textContent === 'Compact rows')!
  assert.equal(checkbox.checked, false)
  assert.match(document.getElementById(checkbox.getAttribute('aria-describedby')!)!.textContent!, /Development and QA/)

  await act(async () => checkbox.click())
  assert.deepEqual(changes, [true])

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
