import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement, useState, type ComponentProps } from 'react'
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
const { formatBacklogValue, formatCreatedDate, getBacklogAgeDays, rankBacklogBugs } = await server.ssrLoadModule('/src/features/standup/utils/backlogValue.ts')
const { formatDayCount } = await server.ssrLoadModule('/src/features/standup/utils/sprintDates.ts')
const { createDefaultBacklogOptions } = await server.ssrLoadModule('/src/features/standup/utils/backlogOptions.ts')
const { BACKLOG_TIER_COLORS } = await server.ssrLoadModule('/src/features/standup/utils/backlogTiers.ts')
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
  // Two of the three bugs are Minimal, which starts collapsed by default; the tier tests turn that back on.
  backlogOptions: { ...createDefaultBacklogOptions(), startLowCollapsed: false },
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
// Each Value tier is a tbody that starts with its header row, so the bug rows are the others, bar Plan a sprint's cut line.
const BUG_ROWS = 'tbody tr:not(.backlog-tier-header):not(.backlog-cut-line)'
const bugRows = (host: Element) => [...host.querySelectorAll(BUG_ROWS)]
const tierHeaders = (host: Element) => [...host.querySelectorAll('tr.backlog-tier-header')]
const rowId = (row: Element) => Number(row.querySelector('.work-item-id')!.textContent)
const listedIds = (host: Element) => bugRows(host).map(rowId)
const rowFor = (host: Element, id: number) => bugRows(host).find((row) => rowId(row) === id)!
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

  const rows = bugRows(host)
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

  const [row] = bugRows(host)
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

  const [row] = bugRows(host)
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
  const controls = [...table.querySelectorAll('button, input, select, textarea, [role="button"], [role="checkbox"], [aria-sort], [aria-selected], [tabindex]')]
  assert.deepEqual(
    controls.map((control) => control.getAttribute('aria-label')),
    ['Collapse Top', 'Collapse Minimal'],
    'the only buttons collapse the Value tiers',
  )
  assert.ok(controls.every((control) => control.closest('.backlog-tier-header')))
  assert.equal(table.querySelectorAll('a').length, bugs.length, 'the title links are the only other interactive elements, so the tags are not')
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

test('bug rows highlight on hover and the header rows do not', async (t) => {
  const host = await render(t)

  const rows = bugRows(host)
  assert.equal(rows.length, bugs.length)
  for (const row of rows) {
    assert.ok(row.classList.contains('MuiTableRow-hover'), `the row for bug ${rowId(row)}`)
  }
  assert.equal(host.querySelector('thead tr')!.classList.contains('MuiTableRow-hover'), false)
  assert.equal(tierHeaders(host).length, 2)
  for (const header of tierHeaders(host)) {
    assert.equal(header.classList.contains('MuiTableRow-hover'), false, 'a tier header is not a bug to point at')
  }
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
  for (const row of bugRows(host)) {
    const cells = [...row.querySelectorAll('td')]
    const id = rowId(row)
    // The Bug cell shows the id, the title, and then one badge per tag, and the filter searches each of them on its own.
    // Rank and Age shift as bugs come and go and grow older, so they are left out of the filter on purpose.
    const tags = [...cells[2].querySelectorAll('li')]
    tagsChecked += tags.length
    const shown = [cells[2].querySelector('.work-item-id')!, cells[1], cells[2].querySelector('a')!, ...tags, ...cells.slice(3, 6), ...cells.slice(7)]
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
    [
      ...Array(bugs.length).fill(' (opens in a new tab)'), ...Array(bugs.length).fill('Created'), 'Not set', 'Not set',
      '1 bug', '2 bugs',
    ].sort(),
    'a new-tab note and a created date per bug, the missing impact and effort, and the size of each tier',
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
  assert.equal(nestedStyle(wrapper, '.work-item-title')('text-overflow'), 'ellipsis', 'only the title gives way')
  assert.equal(nestedStyle(wrapper, '.work-item-title')('overflow'), 'hidden')
  assert.equal(cell.querySelector('a .work-item-title')?.textContent, 'Data loss')

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
  assert.equal(nestedStyle(titleCell(host, 102).firstElementChild!, '.work-item-title')('text-overflow'), '')
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

type BacklogOptions = NonNullable<PageProps['backlogOptions']>
const tierBugIds = (host: Element) => Object.fromEntries([...host.querySelectorAll('tbody')].map((body) => [
  body.getAttribute('data-tier'),
  [...body.querySelectorAll('tr:not(.backlog-tier-header):not(.backlog-cut-line)')].map(rowId),
]))
const tierHeader = (host: Element, name: string) =>
  tierHeaders(host).find((header) => header.querySelector('.backlog-tier-name')?.textContent === name)!

// Owns the Backlog options as the app does, so a change made in the dialog reaches the list.
function BacklogPageWithOptions({ onBacklogOptionsChange, ...props }: PageProps) {
  const [options, setOptions] = useState(props.backlogOptions!)
  return createElement(BacklogPage, {
    ...props,
    backlogOptions: options,
    onBacklogOptionsChange: (next: BacklogOptions) => {
      onBacklogOptionsChange?.(next)
      setOptions(next)
    },
  })
}

const renderWithOptions = (t: TestContext, overrides: Partial<PageProps> = {}) =>
  mount(t, createElement(BacklogPageWithOptions, { ...defaultProps, ...overrides }))

async function openOptions(host: Element) {
  await act(async () => button(host, 'Backlog options').click())
  return dialog()!
}

function thresholdInput(opened: Element, label: string) {
  const labelElement = [...opened.querySelectorAll('label')].find((candidate) => candidate.textContent === label)!
  return document.getElementById(labelElement.htmlFor) as HTMLInputElement
}

async function typeInto(input: HTMLInputElement, text: string) {
  await act(async () => {
    setNativeValue.call(input, text)
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
}

test('the bugs are grouped into Value tiers, each under a header with its size, range, and effort', async (t) => {
  const host = await render(t)

  assert.deepEqual(tierBugIds(host), { top: [102], low: [103, 101] }, 'in ranked order, leaving out tiers with no bugs')
  assert.deepEqual(listedIds(host), [102, 103, 101], 'the ranks still run down the page')

  const top = tierHeader(host, 'Top')
  const cell = top.querySelector('th')!
  assert.equal(top.parentElement!.firstElementChild, top, 'the header leads its tier')
  assert.equal(cell.getAttribute('scope'), 'rowgroup', 'it names the rows of its tier')
  assert.equal(cell.getAttribute('colspan'), '10')
  assert.equal(top.querySelector('.backlog-tier-count [aria-hidden="true"]')!.textContent, '1')
  assert.equal(visibleText(top.querySelector('.backlog-tier-count')!), '1 bug', 'the count is read out with its noun')
  assert.equal(top.querySelector('.backlog-tier-range')!.textContent, 'Value 80+')
  assert.equal(visibleText(top.querySelector('.backlog-tier-effort')!), '4 pts')
  assert.equal(top.querySelector('.backlog-tier-effort [aria-hidden="true"]')!.textContent, 'Σ ')

  const low = tierHeader(host, 'Minimal')
  assert.equal(visibleText(low.querySelector('.backlog-tier-count')!), '2 bugs')
  assert.equal(low.querySelector('.backlog-tier-range')!.textContent, 'Value under 12')
  assert.equal(visibleText(low.querySelector('.backlog-tier-effort')!), '8 pts + 1 unestimated', 'a bug without Effort is counted, not summed')

  const [topBody, lowBody] = [...host.querySelectorAll<HTMLElement>('tbody')]
  assert.equal(topBody.style.getPropertyValue('--backlog-tier'), BACKLOG_TIER_COLORS.top, 'the tier color stripes its rows')
  assert.equal(lowBody.style.getPropertyValue('--backlog-tier'), BACKLOG_TIER_COLORS.low)
  assert.equal(lowBody.style.getPropertyValue('--backlog-tier-meter'), 'var(--stratakit-color-bg-mono-base)', 'Minimal meters are neutral')
  assert.equal(topBody.style.getPropertyValue('--backlog-tier-meter'), '')

  const style = declaredStyle(cell)
  assert.equal(style('position'), 'sticky', 'the header stays in view while its tier scrolls')
  assert.equal(style('top'), 'calc(var(--backlog-head-height, 37px) - 1px)', 'just under the column header')
})

test('the tiers follow the thresholds in the Backlog options', async (t) => {
  const host = await render(t, {
    backlogOptions: { ...createDefaultBacklogOptions(), tierThresholds: { top: 300, high: 100, medium: 5 }, startLowCollapsed: false },
  })

  assert.deepEqual(tierBugIds(host), { high: [102], medium: [103], low: [101] })
  assert.equal(tierHeader(host, 'Substantial').querySelector('.backlog-tier-range')!.textContent, 'Value 100–300')
  assert.equal(tierHeader(host, 'Moderate').querySelector('.backlog-tier-range')!.textContent, 'Value 5–100')
})

test('the Minimal tier starts collapsed by default, and its chevron or Show button expands it', async (t) => {
  const host = await render(t, { backlogOptions: createDefaultBacklogOptions() })

  assert.deepEqual(listedIds(host), [102], 'only the bugs above Minimal are listed')
  const low = tierHeader(host, 'Minimal')
  assert.equal(visibleText(low.querySelector('.backlog-tier-count')!), '2 bugs', 'a collapsed tier still says how many it holds')
  const expand = button(host, 'Expand Minimal')
  assert.equal(expand.getAttribute('aria-expanded'), 'false')
  const show = button(host, 'Show 2 bugs in Minimal')
  assert.equal(show.textContent, 'Show 2')
  assert.equal(button(host, 'Collapse Top').getAttribute('aria-expanded'), 'true')
  assert.equal(host.querySelector('button[aria-label="Show 1 bug in Top"]'), null, 'an open tier has no Show button')

  await act(async () => show.click())
  assert.deepEqual(listedIds(host), [102, 103, 101])
  assert.equal(host.querySelector('button[aria-label="Show 2 bugs in Minimal"]'), null)
  const collapse = button(host, 'Collapse Minimal')
  assert.equal(document.activeElement, collapse, 'focus moves to the chevron rather than being lost with the Show button')
  assert.equal(collapse.getAttribute('aria-expanded'), 'true')

  await act(async () => collapse.click())
  assert.deepEqual(listedIds(host), [102])
  await act(async () => button(host, 'Collapse Top').click())
  assert.deepEqual(listedIds(host), [], 'any tier can collapse')
  assert.equal(tierHeaders(host).length, 2, 'the headers stay to expand them again')
  await act(async () => button(host, 'Expand Top').click())
  assert.deepEqual(listedIds(host), [102])
})

for (const compactRows of [false, true]) {
  for (const planning of [false, true]) {
    test(`tier toggles preserve the column layout (${compactRows ? 'compact' : 'comfortable'}, ${planning ? 'planning' : 'list'})`, async (t) => {
      const host = await render(t, { compactRows })
      if (planning) await startPlanning(host)
      const table = host.querySelector('table')!
      const columns = [...table.querySelectorAll<HTMLTableColElement>('colgroup col')]
      const widths = columns.map((column) => column.style.width)
      assert.equal(columns.length, planning ? 12 : 10)
      assert.equal(widths.filter((width) => !width).length, 1, 'only the Bug column flexes')
      assert.equal(widths[planning ? 3 : 2], '')
      assert.equal(widths.at(-1), compactRows ? '112px' : '200px')
      assert.equal(declaredStyle(table)('table-layout'), 'fixed')
      assert.equal(
        Number.parseFloat(declaredStyle(table)('min-width')),
        widths.reduce((total, width) => total + (Number.parseFloat(width) || 300), 0),
        'the table scrolls rather than squeezing columns below their allocated widths',
      )
      assert.equal(declaredStyle(host.querySelector('.MuiTableContainer-root')!)('scrollbar-gutter'), 'stable')

      for (const label of ['Collapse Minimal', 'Collapse Top', 'Expand Minimal', 'Expand Top']) {
        await act(async () => button(host, label).click())
        assert.deepEqual([...table.querySelectorAll<HTMLTableColElement>('col')].map((column) => column.style.width), widths)
        assert.equal(declaredStyle(table)('table-layout'), 'fixed')
      }
      assert.deepEqual(listedIds(host), [102, 103, 101])
    })
  }
}

test('long sprint and state labels stay within their columns without losing their text', async (t) => {
  const state = 'Awaiting deployment'
  const sprint = 'An unusually long sprint name'
  const host = await render(t, {
    compactRows: true,
    bugs: rankBacklogBugs([{
      id: 501, title: 'Ready', state, iterationPath: `Project\\${sprint}`, workItemUrl: workItemUrl(501),
    }]),
  })
  const cells = rowFor(host, 501).querySelectorAll('td')
  const sprintLabel = cells[7].querySelector('.MuiBox-root')!.lastElementChild!
  assert.equal(sprintLabel.textContent, sprint)
  assert.equal(declaredStyle(sprintLabel)('text-overflow'), 'ellipsis')
  assert.equal(declaredStyle(sprintLabel)('white-space'), 'nowrap')
  const badge = cells[8].querySelector<HTMLElement>('.MuiBadge-badge')!
  assert.equal(badge.textContent, state)
  assert.equal(badge.style.maxWidth, '100%')
  assert.equal((badge.firstElementChild as HTMLElement).style.textOverflow, 'ellipsis')
})

test('a quick filter match in a collapsed tier waits behind its Show button', async (t) => {
  const host = await render(t, { backlogOptions: createDefaultBacklogOptions(), bugs: filterBacklogBugs(bugs, 'slow'), totalBugCount: bugs.length })

  assert.deepEqual(listedIds(host), [])
  assert.equal(button(host, 'Show 1 bug in Minimal').textContent, 'Show 1', 'the header counts the matching bugs')
  await act(async () => button(host, 'Show 1 bug in Minimal').click())
  assert.deepEqual(listedIds(host), [103])
})

test('the options dialog sets the tier thresholds, applying them once all three make sense together', async (t) => {
  const changes: BacklogOptions[] = []
  const host = await renderWithOptions(t, { onBacklogOptionsChange: (next: BacklogOptions) => changes.push(next) })
  const opened = await openOptions(host)

  const section = opened.querySelector('section[aria-labelledby="backlog-options-tiers"]')!
  assert.equal(section.querySelector('h3')!.textContent, 'Value tiers')
  const top = thresholdInput(opened, 'Top from Value')
  const high = thresholdInput(opened, 'Substantial from Value')
  const medium = thresholdInput(opened, 'Moderate from Value')
  assert.deepEqual([top.value, high.value, medium.value], ['80', '30', '12'])
  assert.deepEqual([top.type, top.min], ['number', '1'])
  assert.match(document.getElementById(top.getAttribute('aria-describedby')!)!.textContent!, /groups bugs by Value/)
  assert.match(section.textContent!, /Minimal: everything below Moderate/)
  assert.equal(opened.querySelector('[role="alert"]'), null)

  await typeInto(high, '90')
  const alert = opened.querySelector('[role="alert"]')!
  assert.equal(alert.textContent, 'Each threshold must be lower than the one above it.')
  assert.deepEqual([top, high, medium].map((input) => input.getAttribute('aria-invalid')), ['true', 'true', 'false'])
  assert.match(high.getAttribute('aria-describedby')!, new RegExp(`\\b${alert.id}\\b`), 'the message is tied to the fields it flags')
  assert.deepEqual(changes, [], 'the tiers keep the last thresholds that made sense')

  await typeInto(high, '')
  assert.equal(opened.querySelector('[role="alert"]')!.textContent, 'Enter a Value above 0 for each tier.')
  assert.deepEqual([top, high, medium].map((input) => input.getAttribute('aria-invalid')), ['false', 'true', 'false'])

  await typeInto(high, '30')
  await typeInto(medium, '10')
  assert.equal(opened.querySelector('[role="alert"]'), null)
  assert.deepEqual(changes.map((change) => change.tierThresholds), [{ top: 80, high: 30, medium: 12 }, { top: 80, high: 30, medium: 10 }])
  assert.deepEqual(tierBugIds(host), { top: [102], medium: [103], low: [101] }, 'the list regroups straight away')
  assert.equal(tierHeader(host, 'Moderate').querySelector('.backlog-tier-range')!.textContent, 'Value 10–30')
})

test('turning "Start with the Minimal tier collapsed" on or off applies to the list straight away', async (t) => {
  const host = await renderWithOptions(t)
  assert.deepEqual(listedIds(host), [102, 103, 101])
  const opened = await openOptions(host)
  const checkbox = [...opened.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    .find((input) => input.closest('label')?.textContent === 'Start with the Minimal tier collapsed')!
  assert.equal(checkbox.checked, false)

  await act(async () => checkbox.click())
  assert.equal(checkbox.checked, true)
  assert.deepEqual(listedIds(host), [102])

  await act(async () => checkbox.click())
  assert.deepEqual(listedIds(host), [102, 103, 101])
})

test('collapsed tiers stay collapsed through a refresh', async (t) => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  const renderPage = (overrides: Partial<PageProps>) =>
    act(async () => root.render(createElement(Root, null, createElement(BacklogPage, { ...defaultProps, ...overrides }))))

  await renderPage({})
  await act(async () => button(host, 'Collapse Top').click())
  assert.deepEqual(listedIds(host), [103, 101])

  await renderPage({ isLoading: true, bugs: [] })
  assert.equal(host.querySelector('table'), null)
  await renderPage({})
  assert.deepEqual(listedIds(host), [103, 101], 'the loading skeleton does not reset which tiers are open')
})

const DAY_MS = 86_400_000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString()
const futureIterations = [
  ...iterations,
  { name: 'Sprint 6', path: 'Project\\Team\\2026\\Sprint 6', timeFrame: 'future', startDate: '2026-06-15', finishDate: '2026-06-26' },
]
// One bug for each Needs attention facet, dated from today so the age facet holds whenever the tests run.
const attentionBugs: PageProps['bugs'] = rankBacklogBugs([
  {
    id: 201, title: 'Crash on save', state: 'New', createdAt: daysAgo(30), iterationPath: 'Project',
    severity: '1 - Critical', priority: 1, effort: 2, workItemUrl: workItemUrl(201),
  },
  {
    id: 202, title: 'Stale sprint bug', state: 'Active', createdAt: daysAgo(10), iterationPath: 'Project\\Team\\2026\\Sprint 4',
    severity: '3 - Medium', priority: 2, effort: 3, workItemUrl: workItemUrl(202),
  },
  {
    id: 203, title: 'Ancient request', state: 'New', createdAt: daysAgo(800), iterationPath: 'Project',
    priority: 2, workItemUrl: workItemUrl(203),
  },
  {
    id: 204, title: 'Planned crash', state: 'Active', createdAt: daysAgo(3), iterationPath: 'Project\\Team\\2026\\Sprint 5',
    severity: '2 - High', priority: 1, effort: 1, workItemUrl: workItemUrl(204),
  },
], futureIterations)
const ribbon = (host: Element) => host.querySelector('section[aria-label="Backlog summary"]')
const facetToggle = (host: Element, key: string) => host.querySelector<HTMLElement>(`[data-attention-facet="${key}"]`)!
// The chip's label carries its pressed state and its spoken name.
const facetLabel = (host: Element, key: string) => facetToggle(host, key).querySelector('[aria-pressed]')!
const facetLabels = (host: Element) =>
  [...host.querySelectorAll('[data-attention-facet] [aria-pressed]')].map((toggle) => toggle.getAttribute('aria-label'))
const attentionStatus = (host: Element) => facetToggle(host, 'severe').closest('[role="group"]')!.parentElement!.querySelector('[role="status"]')!

test('the summary ribbon sums up the backlog: its size, effort, Value and severity mix, sprints, and age', async (t) => {
  const host = await render(t, { teamIterations: iterations })
  const text = ribbon(host)!.textContent!

  assert.match(text, /^3 open bugs/)
  assert.match(text, /Total effort 12 pts \+ 1 unestimated/, 'the Σ is read as "Total effort"')
  assert.match(text, /Value1 top0 substantial0 moderate2 minimal/)
  assert.match(text, /Severity1 S10 S21 S30 S41 not set/)
  assert.match(text, /Planned1 this · 0 next · 1 ended/)
  assert.match(text, /\+0 new this sprint/)
  assert.match(text, /Median age \d+[dwmoy]+$/)
  assert.ok(
    [...ribbon(host)!.querySelectorAll('[tabindex="0"]')].length >= 5,
    'each group can take focus, so its tooltip opens from the keyboard too',
  )
})

test('the ribbon describes the whole backlog while the quick filter narrows the list', async (t) => {
  const host = await render(t, { bugs: filterBacklogBugs(bugs, 'slow'), allBugs: bugs, totalBugCount: bugs.length, teamIterations: iterations })

  assert.deepEqual(listedIds(host), [103])
  assert.match(ribbon(host)!.textContent!, /^3 open bugs/)
})

test('without the team sprints the ribbon leaves out what is planned and new this sprint', async (t) => {
  const text = ribbon(await render(t))!.textContent!

  assert.match(text, /^3 open bugs/)
  assert.doesNotMatch(text, /Planned/)
  assert.doesNotMatch(text, /new this sprint/)
})

test('there is no summary or Needs attention bar without bugs to describe, and the skeleton stands in while loading', async (t) => {
  for (const overrides of [{ bugs: [] }, { error: 'Failed', bugs: [] }]) {
    const host = await render(t, overrides)
    assert.equal(ribbon(host), null, JSON.stringify(overrides))
    assert.equal(host.querySelector('[data-attention-facet]'), null)
  }

  const loading = await render(t, { isLoading: true, bugs: [] })
  assert.equal(ribbon(loading), null)
  const skeleton = loading.querySelector('[data-backlog-summary-skeleton]')!
  assert.equal(skeleton.getAttribute('aria-hidden'), 'true')
})

test('the Needs attention chips count the listed bugs that show each signal', async (t) => {
  const host = await render(t, { bugs: attentionBugs, teamIterations: futureIterations })

  assert.deepEqual(facetLabels(host), [
    'Severe, not planned, 1 bug',
    'In an ended sprint, 1 bug',
    'Missing severity or impact, 1 bug',
    'No effort, 1 bug',
    'Older than 1 year, 1 bug',
  ])
  assert.equal(attentionStatus(host).textContent, '')
  assert.ok(bugRows(host).every((row) => !row.hasAttribute('data-emphasis')), 'nothing is dimmed until a chip is pressed')
  assert.equal(host.querySelector('.backlog-tier-matches'), null)

  const filtered = await render(t, {
    bugs: filterBacklogBugs(attentionBugs, 'ancient'), allBugs: attentionBugs, totalBugCount: 4, teamIterations: futureIterations,
  })
  assert.deepEqual(facetLabels(filtered), [
    'Severe, not planned, 0 bugs',
    'In an ended sprint, 0 bugs',
    'Missing severity or impact, 1 bug',
    'No effort, 1 bug',
    'Older than 1 year, 1 bug',
  ], 'the counts follow the quick filter')
  assert.match(ribbon(filtered)!.textContent!, /^4 open bugs/)
})

test('pressing a chip dims the other bugs, counts its matches in each tier, and Clear undoes it', async (t) => {
  const host = await render(t, { bugs: attentionBugs, teamIterations: futureIterations })

  await act(async () => facetToggle(host, 'old').click())
  assert.equal(facetLabel(host, 'old').getAttribute('aria-pressed'), 'true')
  assert.equal(attentionStatus(host).textContent, '1 of 4 bugs highlighted · Older than 1 year')
  assert.deepEqual(
    Object.fromEntries(bugRows(host).map((row) => [rowId(row), row.getAttribute('data-emphasis')])),
    { 201: 'dim', 202: 'dim', 203: 'match', 204: 'dim' },
  )
  assert.match(rowFor(host, 203).textContent!, /Highlighted/, 'screen readers hear which rows the chip picks out')
  assert.doesNotMatch(rowFor(host, 201).textContent!, /Highlighted/)

  for (const body of host.querySelectorAll('tbody')) {
    const matches = body.querySelector('.backlog-tier-matches')!
    const holdsMatch = [...body.querySelectorAll('tr:not(.backlog-tier-header)')].some((row) => rowId(row) === 203)
    assert.equal(matches.textContent, holdsMatch ? ' · 1 match' : ' · 0 match')
    assert.equal(matches.hasAttribute('data-none'), !holdsMatch, 'only a tier with matches calls them out')
  }

  const clear = [...host.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Clear')!
  await act(async () => clear.click())
  assert.equal(facetLabel(host, 'old').getAttribute('aria-pressed'), 'false')
  assert.ok(bugRows(host).every((row) => !row.hasAttribute('data-emphasis')))
})

test('a match in a collapsed tier is counted on its header', async (t) => {
  const host = await render(t, { bugs: attentionBugs, teamIterations: futureIterations, backlogOptions: createDefaultBacklogOptions() })

  await act(async () => facetToggle(host, 'old').click())
  assert.ok(!listedIds(host).includes(203), 'the old bug is in the collapsed Minimal tier')
  assert.equal(tierHeader(host, 'Minimal').querySelector('.backlog-tier-matches')!.textContent, ' · 1 match')
})

test('dimmed rows fade but come back on hover or focus', async (t) => {
  const host = await render(t, { bugs: attentionBugs, teamIterations: futureIterations })
  const table = host.querySelector('table')!
  const prefixes = Array.from(table.classList, (name) => `.${name} `)
  const rules: CSSStyleRule[] = []
  const visit = (list: CSSRuleList) => {
    for (const rule of Array.from(list) as Array<CSSStyleRule & CSSGroupingRule>) {
      if (rule.selectorText && prefixes.some((prefix) => rule.selectorText.includes(prefix))) rules.push(rule)
      if (rule.cssRules) visit(rule.cssRules)
    }
  }
  for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules)
  const ruleFor = (pattern: RegExp) => rules.find((rule) => pattern.test(rule.selectorText))!

  const dim = ruleFor(/tr\[data-emphasis="dim"\]\s*>\s*td$/)
  assert.equal(dim.style.getPropertyValue('opacity'), '0.35')
  assert.match(dim.style.getPropertyValue('filter'), /grayscale/)
  const restored = ruleFor(/tr\[data-emphasis="dim"\]:hover\s*>\s*td/)
  assert.match(restored.selectorText, /tr\[data-emphasis="dim"\]:focus-within\s*>\s*td/)
  assert.equal(restored.style.getPropertyValue('opacity'), '1')
})

test('the options dialog sets how old a New bug is before the chip flags it', async (t) => {
  const changes: BacklogOptions[] = []
  const host = await renderWithOptions(t, {
    bugs: attentionBugs, teamIterations: futureIterations, onBacklogOptionsChange: (next: BacklogOptions) => changes.push(next),
  })
  const opened = await openOptions(host)

  const section = opened.querySelector('section[aria-labelledby="backlog-options-attention"]')!
  assert.equal(section.querySelector('h3')!.textContent, 'Needs attention')
  const months = thresholdInput(opened, 'Flag New bugs older than (months)')
  assert.deepEqual([months.value, months.type, months.min, months.max], ['12', 'number', '1', '120'])
  assert.match(document.getElementById(months.getAttribute('aria-describedby')!)!.textContent!, /still New after this many months/)

  for (const invalid of ['0', '2.5', '121', '']) {
    await typeInto(months, invalid)
    assert.equal(opened.querySelector('[role="alert"]')!.textContent, 'Enter a whole number of months from 1 to 120.', invalid)
    assert.equal(months.getAttribute('aria-invalid'), 'true')
  }
  assert.deepEqual(changes, [], 'the chip keeps the last age that made sense')

  await typeInto(months, '24')
  assert.equal(opened.querySelector('[role="alert"]'), null)
  assert.deepEqual(changes.map((change) => change.agingMonths), [24])
  assert.equal(facetLabel(host, 'old').getAttribute('aria-label'), 'Older than 2 years, 1 bug')

  await typeInto(months, '30')
  assert.equal(facetLabel(host, 'old').getAttribute('aria-label'), 'Older than 30 months, 0 bugs', 'about 26 months old is not flagged')
})

const planStart = (host: Element) => [...host.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Plan a sprint')
const planBar = (host: Element) => host.querySelector('[role="region"][aria-label="Plan a sprint"]')
const planStatus = (host: Element) => planBar(host)!.querySelector('[role="status"]')!.textContent
const pickBox = (host: Element, id: number) => host.querySelector<HTMLInputElement>(`input[aria-label="Pick ${id}"]`)!
const pickedIds = (host: Element) => bugRows(host).filter((row) => row.hasAttribute('data-picked')).map(rowId)
const handPicked = (host: Element, id: number) => pickBox(host, id).closest('.backlog-pick')!.hasAttribute('data-hand')
const running = (host: Element, id: number) => rowFor(host, id).querySelector('.backlog-running, .backlog-skip-reason')?.textContent ?? ''
const budgetInput = (host: Element) => host.querySelector<HTMLInputElement>('input[aria-label="Effort budget in points"]')!
const planButton = (host: Element, text: string) =>
  [...planBar(host)!.querySelectorAll('button')].find((candidate) => candidate.textContent === text)!
const stripCheckbox = (host: Element, label: string) => [...planBar(host)!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
  .find((input) => input.closest('label')?.textContent === label)!
const headTexts = (host: Element) => [...host.querySelectorAll('thead th')].map((cell) => cell.textContent)

async function startPlanning(host: Element) {
  await act(async () => planStart(host)!.click())
}

async function closePlan(host: Element) {
  await act(async () => planButton(host, 'Close').click())
}

test('Plan a sprint picks the highest-Value bugs that fit the budget, with their running effort and a cut line', async (t) => {
  const host = await render(t, { bugs: attentionBugs, teamIterations: futureIterations })
  assert.deepEqual(listedIds(host), [201, 204, 202, 203])
  const plainHead = headTexts(host)

  assert.ok(planStart(host)!.classList.contains('MuiButton-contained'), 'a primary button, like Start standup')
  assert.equal(planStart(host)!.hasAttribute('aria-pressed'), false)
  assert.equal(planBar(host), null)
  assert.equal(pickBox(host, 201), null)

  await startPlanning(host)
  assert.equal(planStart(host), undefined, 'the strip takes the place of the button, as the presenter bar does')
  assert.ok(planBar(host))
  assert.equal(document.activeElement, budgetInput(host), 'focus moves into the strip')
  assert.deepEqual(headTexts(host), ['Pick', ...plainHead.slice(0, 6), 'Running', ...plainHead.slice(6)])
  assert.equal(tierHeaders(host)[0].querySelector('th')!.getAttribute('colspan'), '12', 'the tier headers span the new columns')

  assert.deepEqual(pickedIds(host), [201, 202], 'the planned bug and the one without an Effort are passed over')
  assert.deepEqual([201, 204, 202, 203].map((id) => pickBox(host, id).checked), [true, false, true, false])
  assert.deepEqual([201, 204, 202, 203].map((id) => running(host, id)), ['2 pts', 'This sprint', '5 pts', ''],
    'a bug passed over above the line says why; nothing below it does')
  assert.match(planStatus(host)!, /^2 bugs5 of 10 pts.*Total Value/)

  const cutLine = rowFor(host, 202).nextElementSibling!
  assert.ok(cutLine.classList.contains('backlog-cut-line'), 'the cut line follows the last pick')
  assert.equal(cutLine.textContent, 'Cut line · 5 of 10 pts · 2 bugs above')
  assert.equal(host.querySelectorAll('.backlog-cut-line').length, 1)
  const pickedCounts = [...host.querySelectorAll('.backlog-tier-picked')].map((count) => count.textContent)
  assert.equal(pickedCounts.reduce((sum, text) => sum + Number(/(\d+) picked/.exec(text!)![1]), 0), 2, 'each tier counts its picks')

  await closePlan(host)
  assert.equal(planBar(host), null)
  assert.equal(document.activeElement, planStart(host), 'focus goes back to the button')
  assert.equal(host.querySelector('.backlog-cut-line'), null)
  assert.deepEqual(headTexts(host), plainHead)
})

test('picks made by hand override the planner, are ringed, and Reset clears them', async (t) => {
  const host = await render(t, { bugs: attentionBugs, teamIterations: futureIterations })
  await startPlanning(host)
  const reset = planButton(host, 'Reset')
  assert.equal(reset.disabled, true, 'nothing to reset yet')

  await act(async () => pickBox(host, 201).click())
  assert.deepEqual(pickedIds(host), [202])
  assert.equal(handPicked(host, 201), true)
  assert.equal(running(host, 201), 'Unchecked')

  await act(async () => pickBox(host, 204).click())
  assert.deepEqual(pickedIds(host), [204, 202], 'a hand pick goes in even though it is planned')
  assert.equal(handPicked(host, 204), true)
  assert.equal(handPicked(host, 202), false)
  assert.deepEqual([running(host, 204), running(host, 202)], ['1 pts', '4 pts'])

  await act(async () => pickBox(host, 204).click())
  assert.deepEqual(pickedIds(host), [202], 'unchecking a hand pick hands it back to the planner, which skips it')
  assert.equal(handPicked(host, 204), false)

  assert.equal(reset.disabled, false)
  await act(async () => reset.click())
  assert.deepEqual(pickedIds(host), [201, 202])
  assert.equal(handPicked(host, 201), false)
  assert.equal(reset.disabled, true)
})

test('the budget can be typed or stepped, keeps the last usable value, and starts from the team default', async (t) => {
  const host = await renderWithOptions(t, {
    bugs: attentionBugs, teamIterations: futureIterations, backlogOptions: { ...defaultProps.backlogOptions!, defaultPlanBudget: 4 },
  })
  await startPlanning(host)
  const budget = budgetInput(host)
  assert.deepEqual([budget.value, budget.min, budget.max], ['4', '1', '999'])
  assert.deepEqual(pickedIds(host), [201])
  assert.match(planStatus(host)!, /^1 bug2 of 4 pts/)

  await act(async () => button(host, 'Increase budget').click())
  assert.equal(budget.value, '5')
  assert.deepEqual(pickedIds(host), [201, 202])

  for (const invalid of ['0', '2.5', '1000', '']) {
    await typeInto(budget, invalid)
    assert.equal(budget.getAttribute('aria-invalid'), 'true', invalid)
    assert.equal(planBar(host)!.querySelector('[role="alert"]')!.textContent, 'Enter a whole number of points from 1 to 999.')
    assert.deepEqual(pickedIds(host), [201, 202], 'the plan keeps the last budget that made sense')
  }
  await act(async () => budget.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })))
  assert.equal(budget.value, '5', 'leaving the field puts the budget back')
  assert.equal(budget.getAttribute('aria-invalid'), 'false')

  await typeInto(budget, '1')
  assert.deepEqual(pickedIds(host), [], 'nothing fits in 1 pt')
  assert.match(planStatus(host)!, /^0 bugs0 of 1 pts/)
  assert.equal(host.querySelector('.backlog-cut-line'), null)
  assert.equal(button(host, 'Decrease budget').disabled, true)
  assert.equal(planButton(host, 'Copy list').disabled, true, 'there is nothing to copy')

  await typeInto(budget, '20')
  await act(async () => pickBox(host, 204).click())
  assert.match(planStatus(host)!, /^3 bugs6 of 20 pts/)
  await act(async () => planButton(host, 'Reset').click())
  assert.equal(budget.value, '4', 'Reset goes back to the default budget')
})

test('a hand pick can run the plan over budget, which the summary calls out', async (t) => {
  const host = await render(t, { bugs: attentionBugs, teamIterations: futureIterations })
  await startPlanning(host)
  await typeInto(budgetInput(host), '2')
  assert.deepEqual(pickedIds(host), [201])

  await act(async () => pickBox(host, 202).click())
  assert.deepEqual(pickedIds(host), [202], 'the hand pick counts first, leaving no room for the planner')
  assert.match(planStatus(host)!, /^1 bug3 of 2 ptsover by 1/)
})

test('with Skip unestimated off, a bug without an Effort counts as the minimum and the summary says so', async (t) => {
  const host = await render(t, {
    bugs: attentionBugs, teamIterations: futureIterations, backlogOptions: { ...defaultProps.backlogOptions!, skipUnestimatedBugs: false },
  })
  await startPlanning(host)

  assert.deepEqual(pickedIds(host), [201, 202, 203])
  assert.equal(running(host, 203), '9 pts')
  assert.match(planStatus(host)!, /1 without effort$/)
})

test('the strip\'s skip checkboxes are the team options, and the options dialog sets the default budget', async (t) => {
  const changes: BacklogOptions[] = []
  const host = await renderWithOptions(t, {
    bugs: attentionBugs, teamIterations: futureIterations, onBacklogOptionsChange: (next: BacklogOptions) => changes.push(next),
  })
  await startPlanning(host)

  await act(async () => stripCheckbox(host, 'Skip planned').click())
  assert.deepEqual(changes.map((change) => change.skipPlannedBugs), [false])
  assert.deepEqual(pickedIds(host), [201, 204, 202], 'the planned bug can be picked now')

  const opened = await openOptions(host)
  const section = opened.querySelector('section[aria-labelledby="backlog-options-plan"]')!
  assert.equal(section.querySelector('h3')!.textContent, 'Plan a sprint')
  const optionCheckbox = (label: string) => [...section.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    .find((input) => input.closest('label')?.textContent === label)!
  assert.equal(optionCheckbox('Skip bugs already in this sprint or the next').checked, false, 'the same setting as the strip')
  assert.equal(optionCheckbox('Skip bugs without an Effort').checked, true)

  const defaultBudget = thresholdInput(opened, 'Default budget (pts)')
  assert.deepEqual([defaultBudget.value, defaultBudget.min, defaultBudget.max], ['10', '1', '999'])
  assert.match(document.getElementById(defaultBudget.getAttribute('aria-describedby')!)!.textContent!, /fit an effort budget/)
  await typeInto(defaultBudget, '1000')
  assert.equal(section.querySelector('[role="alert"]')!.textContent, 'Enter a whole number of points from 1 to 999.')
  await typeInto(defaultBudget, '3')
  assert.equal(changes.at(-1)!.defaultPlanBudget, 3)
  assert.equal(budgetInput(host).value, '3', 'an unedited budget follows the default')
  assert.deepEqual(pickedIds(host), [201, 204])

  await act(async () => optionCheckbox('Skip bugs without an Effort').click())
  assert.equal(changes.at(-1)!.skipUnestimatedBugs, false)
  assert.equal(stripCheckbox(host, 'Skip unestimated').checked, false)
})

test('with a Needs attention chip on, the plan picks only from its bugs', async (t) => {
  const host = await render(t, { bugs: attentionBugs, teamIterations: futureIterations })
  await act(async () => facetToggle(host, 'ended').click())
  await startPlanning(host)

  assert.deepEqual(pickedIds(host), [202])
  for (const id of [201, 204, 203]) {
    assert.equal(pickBox(host, id).disabled, true, `${id} is outside the chip`)
  }
  assert.equal(running(host, 201), '', 'a bug outside the chip gives no reason')
})

test('Copy list copies the picks, one per line, and says whether it worked', async (t) => {
  const copied: string[] = []
  let fail = false
  const descriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        if (fail) throw new Error('denied')
        copied.push(text)
      },
    },
  })
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis.navigator, 'clipboard', descriptor)
    else Reflect.deleteProperty(globalThis.navigator, 'clipboard')
  })

  const host = await render(t, { bugs: attentionBugs, teamIterations: futureIterations })
  await startPlanning(host)
  const copy = planButton(host, 'Copy list')
  await act(async () => copy.click())
  assert.equal(copied.length, 1)
  assert.match(copied[0], /^201\tCrash on save\t2 pts\tValue [\d.]+\n202\tStale sprint bug\t3 pts\tValue [\d.]+$/)
  assert.equal(copy.textContent, 'Copied')

  fail = true
  await act(async () => copy.click())
  assert.equal(copy.textContent, 'Copy failed')
})

test('Plan a sprint waits for bugs, and its picks outlast a refresh but not a change of team', async (t) => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  const otherTeam = { ...team, id: 'other', displayName: 'Team Beta' }
  const base = { ...defaultProps, bugs: attentionBugs, teamIterations: futureIterations, teamOptions: [team, otherTeam] }
  const renderPage = (overrides: Partial<PageProps>) =>
    act(async () => root.render(createElement(Root, null, createElement(BacklogPage, { ...base, ...overrides }))))

  await renderPage({ bugs: [] })
  assert.equal(planStart(host)!.disabled, true, 'there is nothing to plan')

  await renderPage({})
  await startPlanning(host)
  await act(async () => pickBox(host, 204).click())
  assert.deepEqual(pickedIds(host), [201, 204, 202])

  await closePlan(host)
  await startPlanning(host)
  assert.deepEqual(pickedIds(host), [201, 204, 202], 'closing the plan keeps the hand picks for when it opens again')

  await renderPage({ isLoading: true, bugs: [] })
  assert.equal(planBar(host), null)
  assert.equal(planStart(host), undefined, 'the header stays as it was while the backlog reloads')
  await renderPage({})
  assert.deepEqual(pickedIds(host), [201, 204, 202], 'the loading skeleton does not drop the hand picks')

  await renderPage({ selectedTeamId: otherTeam.id })
  assert.deepEqual(pickedIds(host), [201, 202], 'another team starts its plan over')
})

// Two bugs with the same inputs share a bubble; the one without a severity is placed by an assumed default.
const mapBugs: PageProps['bugs'] = rankBacklogBugs([
  {
    id: 301, title: 'Crash on open', state: 'Active', createdAt: '2026-02-01T10:00:00Z', iterationPath: 'Project',
    severity: '1 - Critical', priority: 1, effort: 4, workItemUrl: workItemUrl(301),
  },
  {
    id: 302, title: 'Crash on close', state: 'New', createdAt: '2026-03-01T10:00:00Z', iterationPath: 'Project',
    severity: '1 - Critical', priority: 1, effort: 4, workItemUrl: workItemUrl(302),
  },
  {
    id: 303, title: 'Slow search', state: 'Active', createdAt: '2026-01-15T10:00:00Z', iterationPath: 'Project\\Team\\2026\\Sprint 5',
    severity: '3 - Medium', priority: 2, effort: 8, workItemUrl: workItemUrl(303),
  },
  {
    id: 304, title: 'Odd spacing', state: 'New', createdAt: '2026-01-20T10:00:00Z', iterationPath: 'Project',
    priority: 3, effort: 2, workItemUrl: workItemUrl(304),
  },
], iterations)
const valueOf = (id: number) => mapBugs.find((bug) => bug.id === id)!.value

const viewToggle = (host: Element, name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Backlog view"] button')].find((candidate) => candidate.textContent === name)!
const valueMap = (host: Element) => host.querySelector('svg[role="group"]')
const mapPanel = (host: Element) => host.querySelector('aside[aria-label="Bugs on the map"]')!
const panelIds = (host: Element) => [...mapPanel(host).querySelectorAll('li[data-bug-id]')].map((row) => Number(row.getAttribute('data-bug-id')))
const panelHeading = (host: Element) => mapPanel(host).querySelector('h2')!.textContent
const bubbles = (host: Element) => [...host.querySelectorAll<SVGGElement>('.backlog-bubble')]
const bubbleLabels = (host: Element) => bubbles(host).map((bubble) => bubble.getAttribute('aria-label')).sort()
// Bubbles are named by their bug count and Value, which no two bubbles in these fixtures share.
const bubbleWithValue = (host: Element, value: number) =>
  bubbles(host).find((bubble) => bubble.getAttribute('aria-label')!.split(', ')[1] === `Value ${formatBacklogValue(value)}`)!
const keyDown = (target: Element, key: string) =>
  act(async () => { target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) })

async function openMap(host: Element) {
  await act(async () => viewToggle(host, 'Map').click())
}

test('the View toggle switches the list for the Value map, which groups bugs with the same inputs into a bubble', async (t) => {
  const host = await render(t, { bugs: mapBugs, teamIterations: iterations })
  assert.deepEqual(['List', 'Map'].map((name) => viewToggle(host, name).getAttribute('aria-pressed')), ['true', 'false'])
  assert.ok(host.querySelector('table'))
  assert.equal(valueMap(host), null)

  await openMap(host)
  assert.deepEqual(['List', 'Map'].map((name) => viewToggle(host, name).getAttribute('aria-pressed')), ['false', 'true'])
  assert.equal(host.querySelector('table'), null)
  assert.ok(ribbon(host), 'the summary and Needs attention stay above the map')
  assert.ok(facetToggle(host, 'severe'))

  const map = valueMap(host)!
  assert.equal(map.getAttribute('aria-label'), 'Value map: effort against severity and impact')
  assert.match(document.getElementById(map.getAttribute('aria-describedby')!)!.textContent!, /Arrow keys move between them by Value/)
  assert.deepEqual(bubbleLabels(host), [
    `1 bug, Value ${formatBacklogValue(valueOf(303))}`,
    `1 bug, Value ${formatBacklogValue(valueOf(304))}`,
    `2 bugs, Value ${formatBacklogValue(valueOf(301))}`,
  ].sort())
  const shared = bubbleWithValue(host, valueOf(301))
  assert.equal(shared.querySelector('text')!.textContent, '2', 'a bubble of several bugs shows how many')
  assert.equal(shared.getAttribute('data-tier'), 'top')
  assert.equal(bubbleWithValue(host, valueOf(304)).hasAttribute('data-assumed'), true, 'a guessed severity is marked')
  assert.equal(bubbleWithValue(host, valueOf(303)).hasAttribute('data-assumed'), false)
  assert.deepEqual(
    [...map.querySelectorAll('[data-effort-tick]')].map((tick) => tick.textContent),
    ['≤4', '8'],
    'the effort labels are the team\'s own efforts, with 2 counted as 4',
  )

  assert.equal(panelHeading(host), 'Reading the map')
  assert.deepEqual([...mapPanel(host).querySelectorAll('ul[aria-label="Key"] li')].map((item) => item.textContent), [
    'Top · Value 80+', 'Substantial · Value 30–80', 'Moderate · Value 12–30', 'Minimal · Value under 12', 'Uses an assumed default',
  ])
  assert.equal(mapPanel(host).querySelector('h3')!.textContent, 'Top 4 by Value')
  assert.deepEqual(panelIds(host), mapBugs.map((bug) => bug.id))
  assert.match(visibleText(mapPanel(host).querySelector('li[data-bug-id="303"]')!), /^303 Slow search.*8 pts.*This sprint$/)

  await act(async () => viewToggle(host, 'List').click())
  assert.ok(host.querySelector('table'))
  assert.equal(valueMap(host), null)
})

test('selecting a bubble lists its bugs, and Back, Escape, or selecting it again returns to the reading guide', async (t) => {
  const host = await render(t, { bugs: mapBugs, teamIterations: iterations })
  await openMap(host)
  const shared = bubbleWithValue(host, valueOf(301))

  await act(async () => shared.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(shared.getAttribute('aria-pressed'), 'true')
  assert.equal(shared.hasAttribute('data-selected'), true)
  assert.equal(panelHeading(host), `2 bugs · Value ${formatBacklogValue(valueOf(301))}`)
  assert.match(mapPanel(host).textContent!, /Effort 4 pts or less · Severity × Impact/)
  assert.deepEqual(panelIds(host), mapBugs.filter((bug) => bug.id === 301 || bug.id === 302).map((bug) => bug.id))
  assert.ok(mapPanel(host).querySelector('ul[aria-label="Bugs in the selected bubble"]'))

  const back = [...mapPanel(host).querySelectorAll('button')].find((candidate) => candidate.textContent === 'Back to the reading guide')!
  await act(async () => back.click())
  assert.equal(panelHeading(host), 'Reading the map')
  assert.equal(shared.getAttribute('aria-pressed'), 'false')
  assert.equal(document.activeElement, shared, 'focus goes back to the bubble')

  const assumed = bubbleWithValue(host, valueOf(304))
  await act(async () => assumed.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.match(mapPanel(host).textContent!, /Uses an assumed default, so the position is a guess\./)
  await act(async () => assumed.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(panelHeading(host), 'Reading the map', 'selecting the selected bubble lets it go')

  await act(async () => assumed.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  await keyDown(assumed, 'Escape')
  assert.equal(panelHeading(host), 'Reading the map')
})

test('the map is one tab stop; arrow keys move between bubbles by Value and Enter selects', async (t) => {
  const host = await render(t, { bugs: mapBugs, teamIterations: iterations })
  await openMap(host)
  const byValue = [301, 303, 304].sort((a, b) => valueOf(b) - valueOf(a)).map((id) => bubbleWithValue(host, valueOf(id)))
  const tabStops = () => bubbles(host).filter((bubble) => bubble.getAttribute('tabindex') === '0')

  assert.deepEqual(tabStops(), [byValue[0]], 'the highest Value bubble takes the tab stop')
  await act(async () => byValue[0].focus())
  await keyDown(byValue[0], 'ArrowRight')
  assert.equal(document.activeElement, byValue[1])
  assert.deepEqual(tabStops(), [byValue[1]])
  await keyDown(byValue[1], 'End')
  assert.equal(document.activeElement, byValue[2])
  await keyDown(byValue[2], 'ArrowDown')
  assert.equal(document.activeElement, byValue[2], 'the last bubble stays put')
  await keyDown(byValue[2], 'Home')
  assert.equal(document.activeElement, byValue[0])
  await keyDown(byValue[0], 'ArrowLeft')
  assert.equal(document.activeElement, byValue[0])

  await keyDown(byValue[0], 'Enter')
  assert.equal(byValue[0].getAttribute('aria-pressed'), 'true')
  await keyDown(byValue[0], ' ')
  assert.equal(byValue[0].getAttribute('aria-pressed'), 'false')
})

test('bubbles outside the quick filter or a Needs attention chip fade, and the panel lists what is left', async (t) => {
  const filtered = await render(t, { bugs: filterBacklogBugs(mapBugs, 'crash'), allBugs: mapBugs, totalBugCount: mapBugs.length })
  await openMap(filtered)
  assert.equal(bubbles(filtered).length, 3, 'every bug stays on the map, so it keeps its shape')
  assert.deepEqual(bubbles(filtered).filter((bubble) => !bubble.hasAttribute('data-dim')), [bubbleWithValue(filtered, valueOf(301))])
  assert.match(bubbleWithValue(filtered, valueOf(303)).getAttribute('aria-label')!, /, outside the filter$/)
  assert.equal(mapPanel(filtered).querySelector('h3')!.textContent, 'Top 2 by Value · filtered')
  assert.deepEqual(panelIds(filtered).sort(), [301, 302])

  const none = await render(t, { bugs: [], allBugs: mapBugs, totalBugCount: mapBugs.length })
  await openMap(none)
  assert.ok(bubbles(none).every((bubble) => bubble.hasAttribute('data-dim')))
  assert.equal(mapPanel(none).querySelector('[role="status"]')!.textContent, 'No bugs match.')

  const faceted = await render(t, { bugs: attentionBugs, teamIterations: futureIterations })
  await openMap(faceted)
  await act(async () => facetToggle(faceted, 'old').click())
  const ancient = attentionBugs.find((bug) => bug.id === 203)!
  assert.deepEqual(bubbles(faceted).filter((bubble) => !bubble.hasAttribute('data-dim')), [bubbleWithValue(faceted, ancient.value)])
  assert.deepEqual(panelIds(faceted), [203])

  await act(async () => bubbleWithValue(faceted, attentionBugs[0].value).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  const row = mapPanel(faceted).querySelector('li[data-bug-id]')!
  assert.equal(row.getAttribute('data-emphasis'), 'dim', 'a selected bubble outside the chip still lists its bugs, faded')
  assert.match(row.textContent!, /Outside the filter/)
})

test('Plan a sprint rings the bubbles it picks, and the key explains the ring', async (t) => {
  const host = await render(t, { bugs: attentionBugs, teamIterations: futureIterations })
  await openMap(host)
  assert.equal(host.querySelector('[data-picked]'), null)
  assert.doesNotMatch(mapPanel(host).textContent!, /Picked in Plan a sprint/)

  await startPlanning(host)
  const picked = bubbles(host).filter((bubble) => bubble.hasAttribute('data-picked'))
  const valueFor = (id: number) => attentionBugs.find((bug) => bug.id === id)!.value
  assert.deepEqual(
    picked.map((bubble) => bubble.getAttribute('aria-label')).sort(),
    [201, 202].map((id) => `1 bug, Value ${formatBacklogValue(valueFor(id))}, picked`).sort(),
  )
  assert.match(mapPanel(host).textContent!, /Picked in Plan a sprint/)
  assert.match(visibleText(mapPanel(host).querySelector('li[data-bug-id="201"]')!), /Picked$/)
  assert.doesNotMatch(visibleText(mapPanel(host).querySelector('li[data-bug-id="204"]')!), /Picked/)
})

test('the map has its own loading skeleton, and its selection outlasts a refresh but not a change of team', async (t) => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  const otherTeam = { ...team, id: 'other', displayName: 'Team Beta' }
  const base = { ...defaultProps, bugs: mapBugs, teamOptions: [team, otherTeam] }
  const renderPage = (overrides: Partial<PageProps>) =>
    act(async () => root.render(createElement(Root, null, createElement(BacklogPage, { ...base, ...overrides }))))

  await renderPage({})
  await openMap(host)
  await act(async () => bubbleWithValue(host, valueOf(303)).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.deepEqual(panelIds(host), [303])

  await renderPage({ isLoading: true, bugs: [] })
  assert.equal(valueMap(host), null)
  const skeleton = host.querySelector('[data-backlog-map-skeleton]')!
  assert.equal(skeleton.getAttribute('aria-hidden'), 'true')
  assert.equal(host.querySelector('table'), null, 'no list skeleton stands in for the map')

  await renderPage({})
  assert.equal(bubbleWithValue(host, valueOf(303)).getAttribute('aria-pressed'), 'true', 'the refresh keeps the selected bubble')
  assert.deepEqual(panelIds(host), [303])

  await renderPage({ selectedTeamId: otherTeam.id })
  assert.ok(valueMap(host), 'the view stays on the map')
  assert.equal(panelHeading(host), 'Reading the map', 'another team starts with nothing selected')
})

test('with Remember last view on, the page reopens on the map it was left on', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => (key === 'standup:last-view:backlog' ? 'map' : null), setItem: noop },
  })
  t.after(() => Object.defineProperty(globalThis, 'localStorage', descriptor))

  const remembered = await render(t, { bugs: mapBugs, rememberLastView: true })
  assert.equal(viewToggle(remembered, 'Map').getAttribute('aria-pressed'), 'true')
  assert.ok(valueMap(remembered))

  const fresh = await render(t, { bugs: mapBugs })
  assert.equal(viewToggle(fresh, 'List').getAttribute('aria-pressed'), 'true')
  assert.ok(fresh.querySelector('table'))
})
