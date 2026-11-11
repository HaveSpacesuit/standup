import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { TriageItem } from '../src/ado/types.ts'

// The assignee avatars read the saved PAT from the bare storage globals.
for (const name of ['localStorage', 'sessionStorage']) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value: { getItem: () => null } })
  after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  })
}
const server = await createServer({
  configFile: false, server: { middlewareMode: true, ws: false }, ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { TriagePage } = await server.ssrLoadModule('/src/features/standup/pages/TriagePage.tsx')
const { StandupContent } = await server.ssrLoadModule('/src/features/standup/components/StandupContent.tsx')
const { describeEmptyTriage, filterTriageItems, formatTriageCount, getTriageAge, getTriageTitleTags, getTriageVisibleText } = await server.ssrLoadModule('/src/features/standup/utils/triageDisplay.ts')
const { createBacklogSprintResolver } = await server.ssrLoadModule('/src/features/standup/utils/backlogSprint.ts')
const { describeTriageClearing, getTriageReadiness } = await server.ssrLoadModule('/src/features/standup/utils/triageRules.ts')
const readinessChecks = { bug: ['severity', 'impact', 'effort', 'reproSteps'], other: ['effort', 'acceptanceCriteria'] }
const noChecks = { bug: [], other: [] }
const item: TriageItem = {
  id: 42, title: 'Crash on save', workItemType: 'Bug', state: 'Reported', createdAt: '2026-02-01T00:00:00Z',
  assignedTo: { displayName: 'Developer' }, createdBy: { displayName: 'Reporter' }, priority: 1, severity: '2 - High',
  effort: 0, iterationPath: 'Project\\Sprint 1', tags: ['Triage', 'Frontend'], reasons: ['Tag: Triage', 'New bug'],
  workItemUrl: 'https://dev.azure.com/org/Project/_workitems/edit/42',
  parent: { id: 99, title: 'Parent feature', workItemUrl: 'https://dev.azure.com/org/Project/_workitems/edit/99', unavailable: false },
}
const emptyBug: TriageItem = {
  id: 43, title: 'Untouched bug', workItemType: 'Bug', state: 'New', tags: [], reasons: ['New bug'],
  workItemUrl: 'https://dev.azure.com/org/Project/_workitems/edit/43',
}
const emptyStory: TriageItem = {
  ...emptyBug, id: 44, title: 'Tagged story', workItemType: 'Product Backlog Item', state: 'Ready for Review', tags: ['Triage'],
  reasons: ['Tag: Triage'], workItemUrl: 'https://dev.azure.com/org/Project/_workitems/edit/44',
}
const noop = () => {}
function props() {
  return {
    patConfigured: true,
    teamOptions: [{ id: 'a', displayName: 'Team A', orgName: 'org', projectName: 'Project', teamName: 'A', areaPath: 'Project\\A', iterationPath: 'Project', repoName: 'repo' }],
    selectedTeamId: 'a', onTeamChange: noop, teamManagementUrl: '',
    result: { items: [item], warnings: [] }, isLoading: false, error: null, syncedAt: null, onRefresh: noop,
    options: { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags: ['Needs Info'],
      similarItems: { openBugs: true, closedBugs: true, closedDays: 180 } },
    settingsError: null, onOptionsChange: noop, quickFilterInputRef: { current: null },
    iterations: [], iterationsLoading: false, iterationsError: null, rememberLastView: false,
    similar: { openBugs: [], closedBugs: [], loading: false, warnings: [] },
  }
}
function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(Root, null, createElement(TriagePage, { ...props(), ...overrides })))
}
/** The rendered document, without emotion's SSR <style> elements, which sit inside the markup and add to textContent. */
function renderDocument(overrides: Record<string, unknown> = {}) {
  const dom = new JSDOM(render(overrides))
  for (const style of dom.window.document.querySelectorAll('style')) style.remove()
  return dom
}
const COLUMN_HEADERS = ['Work item', 'Why', 'Readiness', 'Severity', 'Impact', 'Effort', 'Age', 'Sprint', 'State', 'Assigned to', 'Created by', 'Parent']
const headersOf = (table: Element) => [...table.querySelectorAll('thead th')].map((cell) => cell.textContent!)
/** The row's data cells by the table's own headers, after the Work item cell. */
function cellsOf(row: Element) {
  const headers = headersOf(row.closest('table')!)
  return Object.fromEntries([...row.querySelectorAll('td')].map((cell, index) => [headers[index + 1], cell]))
}
/** Text a screen reader announces, skipping decorative aria-hidden content such as avatar initials. */
function readableText(element: Element) {
  const copy = element.cloneNode(true) as Element
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
  return copy.textContent
}

test('Triage table renders all requested fields, accessible type indicator and safe item/parent links', () => {
  const dom = renderDocument()
  try {
    const doc = dom.window.document
    assert.deepEqual([...doc.querySelectorAll('thead th')].map((cell) => cell.textContent), COLUMN_HEADERS)
    assert.equal(doc.querySelector('[aria-label="Bug"]')?.getAttribute('role'), 'img')
    const titleCell = doc.querySelector('tbody th')!
    assert.equal(titleCell.querySelector('.work-item-id')?.textContent, '42', 'the ID sits before the title like Backlog')
    const titleLink = titleCell.querySelector<HTMLAnchorElement>('a[href$="/42"]')!
    assert.equal(titleLink.querySelector('.work-item-title')?.textContent, 'Crash on save')
    assert.match(titleLink.textContent!, /opens in a new tab/)
    assert.deepEqual([...titleCell.querySelectorAll('ul[aria-label="Tags"] li')].map((tag) => tag.textContent), ['Frontend'],
      'the Triage tag the item matched moves to the Why column; other tags stay')
    assert.ok(![...doc.querySelectorAll('tbody td')].some((cell) => /Frontend/.test(cell.textContent!)), 'tags only appear in the title cell')
    const why = cellsOf(doc.querySelector('tbody tr')!).Why
    assert.deepEqual([...why.querySelectorAll('ul[aria-label="Why it is listed"] li')].map((reason) => reason.textContent), ['Triage tag', 'New bug'])
    assert.doesNotMatch(doc.querySelector('tbody')!.textContent!, /Tag: Triage/, 'the raw reason is not shown')
    for (const id of [42, 99]) {
      const link = doc.querySelector<HTMLAnchorElement>(`a[href$="/${id}"]`)!
      assert.equal(link.target, '_blank')
      assert.ok(link.relList.contains('noopener') && link.relList.contains('noreferrer'))
    }
    assert.ok(doc.querySelector('button[aria-label="Triage options"]'))
    assert.ok(doc.querySelector('input[aria-label="Quick filter triage items"]'))
  } finally { dom.window.close() }
})

test('Triage cells share Backlog formatting: severity chip, impact bars, age, sprint, state badge and people', () => {
  const dom = renderDocument()
  try {
    const cells = cellsOf(dom.window.document.querySelector('tbody tr')!)
    assert.equal(cells.Severity.querySelector('[data-level="2"]')?.textContent, 'S2 · High')
    assert.equal(cells.Impact.querySelectorAll('.work-item-impact-bars > span[data-on]').length, 4, 'Impact 1 lights every bar')
    assert.equal(cells.Impact.textContent, '1')
    assert.equal(cells.Effort.textContent, '0', 'zero effort is a value, not missing')
    assert.equal(cells.Age.querySelector('time')?.getAttribute('datetime'), '2026-02-01T00:00:00Z')
    assert.match(cells.Age.textContent!, /In triage since .* working days\. Waiting longer than 2 working days/)
    assert.equal(cells.Sprint.textContent, 'Sprint 1', 'without team sprints the path is named by its last segment')
    assert.equal(cells.State.querySelector('.MuiBadge-badge')?.textContent, 'Reported', 'states other than New are badges')
    for (const [column, name] of [['Assigned to', 'Developer'], ['Created by', 'Reporter']]) {
      assert.equal(readableText(cells[column]), name, column)
      assert.ok(cells[column].querySelector('[aria-hidden="true"]'), `${column} shows a decorative avatar like Backlog`)
    }
    assert.equal(cells.Parent.querySelector('a')?.textContent, '99: Parent feature')
  } finally { dom.window.close() }

  const current = { name: 'Sprint 1', path: 'Project\\Sprint 1', timeFrame: 'current', startDate: '2026-02-02', finishDate: '2026-02-13' }
  const withSprints = renderDocument({ iterations: [current] })
  try {
    assert.equal(cellsOf(withSprints.window.document.querySelector('tbody tr')!).Sprint.textContent, 'This sprint')
  } finally { withSprints.window.close() }
})

test('empty Severity, Impact and Effort are flagged when the type checks them, otherwise dashed; Unassigned and New are muted', () => {
  const dom = renderDocument({ result: { items: [item, emptyBug, emptyStory], warnings: [] } })
  try {
    const [, bug, story] = [...dom.window.document.querySelectorAll('tbody tr')].map(cellsOf)
    assert.equal(bug.Severity.textContent, 'Not set')
    assert.equal(bug.Impact.textContent, '?Not set')
    assert.equal(bug.Effort.textContent, '?Not set')
    assert.equal(bug.Age.textContent, '—Not set')
    assert.equal(bug.State.textContent, 'New')
    assert.equal(bug.State.querySelector('.MuiBadge-root'), null, 'New is muted text rather than a badge')
    assert.equal(bug['Assigned to'].textContent, 'Unassigned')
    assert.equal(bug['Created by'].textContent, 'Unknown')
    assert.equal(bug.Parent.textContent, '—Not set')
    for (const field of ['Severity', 'Impact']) assert.equal(story[field].textContent, '—Not set', field)
    assert.equal(story.Effort.textContent, '?Not set', 'Effort is one of the default checks for other types')
    assert.equal(story.State.querySelector('.MuiBadge-badge')?.textContent, 'RFR', 'long states are abbreviated like Backlog')
    assert.match(story.State.textContent!, /Ready for Review/, 'the full state stays available to screen readers')
  } finally { dom.window.close() }

  const unchecked = renderDocument({
    result: { items: [emptyBug, emptyStory], warnings: [] },
    options: { ...props().options, readinessChecks: { bug: ['reproSteps'], other: [] } },
  })
  try {
    for (const row of [...unchecked.window.document.querySelectorAll('tbody tr')].map(cellsOf)) {
      for (const field of ['Severity', 'Impact', 'Effort']) assert.equal(row[field].textContent, '—Not set', `${field} is not checked`)
    }
  } finally { unchecked.window.close() }
})

test('Readiness lists what each item still needs, or says it is ready to clear', () => {
  const readyBug = { ...item, filledText: { reproSteps: true } }
  const readyStory = { ...emptyStory, effort: 3, filledText: { acceptanceCriteria: true, description: false } }
  const task = { ...emptyStory, id: 45, workItemType: 'Task' }
  const dom = renderDocument({ result: { items: [readyBug, emptyBug, emptyStory, readyStory], warnings: [] } })
  try {
    const rows = [...dom.window.document.querySelectorAll('tbody tr')].map(cellsOf)
    const missing = (cell: Element) => [...cell.querySelectorAll('ul[aria-label="Missing"] li')].map((entry) => readableText(entry))
    assert.equal(rows[0].Readiness.textContent, 'Ready to clear')
    assert.ok(rows[0].Readiness.querySelector('svg'), 'the ready chip has the success icon')
    assert.deepEqual(missing(rows[1].Readiness), ['Severity', 'Impact', 'Effort', 'Repro steps'])
    assert.deepEqual(missing(rows[2].Readiness), ['Effort', 'Acceptance criteria'], 'other types use their own list')
    assert.equal(rows[3].Readiness.textContent, 'Ready to clear')
  } finally { dom.window.close() }

  assert.deepEqual(getTriageReadiness(emptyBug, readinessChecks).checks.map(({ check, filled }) => [check, filled]),
    [['severity', false], ['impact', false], ['effort', false], ['reproSteps', false]])
  assert.deepEqual(getTriageReadiness(readyBug, readinessChecks), {
    checks: [
      { check: 'severity', label: 'Severity', filled: true }, { check: 'impact', label: 'Impact', filled: true },
      { check: 'effort', label: 'Effort', filled: true }, { check: 'reproSteps', label: 'Repro steps', filled: true },
    ],
    missing: [],
    ready: true,
  }, 'zero effort counts as set')
  assert.deepEqual(getTriageReadiness(task, { bug: ['severity'], other: [] }), { checks: [], missing: [], ready: true },
    'a type with no checks is ready')

  const hidden = renderDocument({ options: { ...props().options, readinessChecks: noChecks } })
  try {
    const table = hidden.window.document.querySelector('table')!
    assert.deepEqual(headersOf(table), COLUMN_HEADERS.filter((header) => header !== 'Readiness'), 'no checks hides the column')
    assert.equal(table.querySelectorAll('col').length, COLUMN_HEADERS.length - 1)
  } finally { hidden.window.close() }
})

test('Clears when names what takes the item off the queue: its matched tags, and leaving the first state for a new bug', () => {
  assert.equal(describeTriageClearing(item, []), 'Clears when you remove the “Triage” tag and move it out of Reported.')
  assert.equal(describeTriageClearing(emptyStory, ['Project\\Backlog']), 'Clears when you remove the “Triage” tag.',
    'excluded iteration paths only clear new bugs')
  assert.equal(describeTriageClearing({ ...emptyStory, reasons: ['Tag: Triage', 'Tag: Needs Info'] }, []),
    'Clears when you remove the “Triage” and “Needs Info” tags.')
  assert.equal(describeTriageClearing(emptyBug, ['Project\\Backlog']), 'Clears when you move it out of New or into “Backlog”.',
    'an excluded iteration path is named by its last segment')
  assert.equal(describeTriageClearing(emptyBug, ['Project\\Backlog', 'Project\\Icebox', 'Project\\Later']),
    'Clears when you move it out of New or into “Backlog”, “Icebox”, or “Later”.')
  assert.equal(describeTriageClearing({ ...emptyBug, reasons: [] }, []), '')
})

test('Assigned to and Parent are hidden while no item in the queue has one, even if the quick filter hides that item', () => {
  const empty = renderDocument({ result: { items: [emptyBug, emptyStory], warnings: [] } })
  try {
    const table = empty.window.document.querySelector('table')!
    assert.deepEqual(headersOf(table), COLUMN_HEADERS.filter((header) => header !== 'Assigned to' && header !== 'Parent'))
    assert.equal(table.querySelectorAll('col').length, COLUMN_HEADERS.length - 2)
    assert.equal(table.querySelector('tbody tr')!.querySelectorAll('td').length, COLUMN_HEADERS.length - 3)
  } finally { empty.window.close() }

  const assignedOnly = renderDocument({ result: { items: [{ ...emptyBug, assignedTo: { displayName: 'Developer' } }], warnings: [] } })
  try {
    assert.deepEqual(headersOf(assignedOnly.window.document.querySelector('table')!), COLUMN_HEADERS.filter((header) => header !== 'Parent'))
  } finally { assignedOnly.window.close() }
})

test('Why names each rule an item meets, and only the matched Triage tags leave the title', () => {
  const emptyCase = { ...emptyBug, tags: ['triage', 'Needs Info', 'UI'], reasons: ['Tag: Triage', 'Tag: Needs Info'] }
  assert.deepEqual(getTriageTitleTags(emptyCase), ['UI'], 'matching ignores case, like the query')
  assert.deepEqual(getTriageTitleTags({ tags: ['Triage'], reasons: ['New bug'] }), ['Triage'], 'a tag kept when the rule did not match it')
  const dom = renderDocument({ result: { items: [emptyCase, emptyBug], warnings: [] } })
  try {
    const [tagged, newBug] = [...dom.window.document.querySelectorAll('tbody tr')].map(cellsOf)
    const reasons = (cell: Element) => [...cell.querySelectorAll('li')].map((reason) => reason.textContent)
    assert.deepEqual(reasons(tagged.Why), ['Triage tag', 'Needs Info tag'])
    assert.deepEqual(reasons(newBug.Why), ['New bug'])
    assert.ok(tagged.Why.querySelector('svg'), 'each reason has an icon')
  } finally { dom.window.close() }
})

test('Triage age counts working days and turns amber once an item has waited the configured days', () => {
  // Local times, as the age is counted in the viewer's days: Friday 6 February 2026 to the following days.
  const friday = new Date(2026, 1, 6, 10).toISOString()
  const at = (day: number, hour = 9) => new Date(2026, 1, day, hour)
  assert.deepEqual(getTriageAge(friday, 2, at(6, 17)), { label: 'Today', workingDays: 0, flagged: false })
  assert.deepEqual(getTriageAge(friday, 2, at(7)), { label: '0d', workingDays: 0, flagged: false }, 'Saturday adds no working day')
  assert.deepEqual(getTriageAge(friday, 2, at(9)), { label: '1d', workingDays: 1, flagged: false }, 'Monday is one working day later')
  assert.deepEqual(getTriageAge(friday, 2, at(10)), { label: '2d', workingDays: 2, flagged: true })
  assert.deepEqual(getTriageAge(friday, 3, at(10)), { label: '2d', workingDays: 2, flagged: false }, 'the flag follows the option')
  assert.deepEqual(getTriageAge(new Date(2026, 1, 7, 10).toISOString(), 1, at(9)), { label: '1d', workingDays: 1, flagged: true },
    'an item filed on Saturday is one working day old on Monday')
  assert.deepEqual(getTriageAge(friday, 2, at(27)), { label: '3w', workingDays: 15, flagged: true }, 'after two weeks, calendar time')
  assert.equal(getTriageAge(undefined, 2), undefined)
  assert.equal(getTriageAge('not a date', 2), undefined)

  const today = renderDocument({ result: { items: [{ ...emptyBug, createdAt: new Date().toISOString() }], warnings: [] } })
  try {
    const age = cellsOf(today.window.document.querySelector('tbody tr')!).Age
    assert.equal(age.querySelector('[aria-hidden="true"]')?.textContent, 'Today')
    assert.doesNotMatch(age.textContent!, /Waiting longer/, 'an item within the flag is not called out')
  } finally { today.window.close() }
})

test('quick filter searches the text the table displays, including why items are listed, and not paths or raw field values', () => {
  const resolveSprint = createBacklogSprintResolver([])
  const visible = getTriageVisibleText(item, resolveSprint(item.iterationPath), readinessChecks).filter(Boolean)
  for (const query of ['42', 'Crash', 'Bug', 'Frontend', 'Triage tag', 'New bug', 'Repro steps', 'S2 · High', 'Sprint 1', 'Reported', 'Developer', 'Reporter', '99: Parent feature', ...visible]) {
    assert.equal(filterTriageItems([item], String(query), resolveSprint, readinessChecks).length, 1, String(query))
  }
  for (const query of ['Tag: Triage', 'Project\\Sprint', '2 - High', 'Ready to clear', 'not in this row']) {
    assert.deepEqual(filterTriageItems([item], query, resolveSprint, readinessChecks), [], query)
  }
  const items = [item, emptyBug, emptyStory]
  assert.equal(filterTriageItems(items, '   ', resolveSprint, readinessChecks), items, 'an empty filter returns the same list')
  assert.deepEqual(filterTriageItems(items, 'unassigned', resolveSprint, readinessChecks).map(({ id }) => id), [43, 44])
  assert.deepEqual(filterTriageItems(items, 'ready for review', resolveSprint, readinessChecks).map(({ id }) => id), [44])
  assert.deepEqual(filterTriageItems(items, 'RFR', resolveSprint, readinessChecks).map(({ id }) => id), [44])
  const current = createBacklogSprintResolver([{ name: 'Sprint 1', path: 'Project\\Sprint 1', timeFrame: 'current' }])
  assert.deepEqual(filterTriageItems(items, 'this sprint', current, readinessChecks).map(({ id }) => id), [42])

  const ready = [{ ...item, filledText: { reproSteps: true } }, emptyBug, emptyStory]
  assert.deepEqual(filterTriageItems(ready, 'ready to clear', resolveSprint, readinessChecks).map(({ id }) => id), [42])
  assert.deepEqual(filterTriageItems(ready, 'acceptance criteria', resolveSprint, readinessChecks).map(({ id }) => id), [44])
  assert.deepEqual(filterTriageItems(ready, 'repro steps', resolveSprint, readinessChecks).map(({ id }) => id), [43])
  assert.deepEqual(filterTriageItems(ready, 'ready to clear', resolveSprint, noChecks), [], 'no Readiness column, nothing to match')
})
test('page distinguishes configuration, auth, loading, errors, empty rules, empty queue and parent warnings', () => {
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ teamOptions: [] }, /Configure at least one team/],
    [{ patConfigured: false }, /Configure an Azure DevOps PAT/],
    [{ isLoading: true }, /Loading triage\.\.\./],
    [{ error: 'query failed (HTTP 503)' }, /query failed \(HTTP 503\)/],
    [{ settingsError: 'Unable to read Triage options' }, /Unable to read Triage options/],
    [{ options: { tags: [], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags: [] } }, /No Triage rules/],
    [{ result: { items: [], warnings: [] } }, /Triage is clear/],
    [{ result: { items: [item], warnings: ['Some parent details are unavailable'] } }, /Some parent details are unavailable/],
  ]
  for (const [overrides, message] of cases) assert.match(render(overrides), message)
})

test('loading shows a status line over skeleton rows instead of the table', () => {
  const dom = renderDocument({ isLoading: true })
  try {
    const doc = dom.window.document
    const main = doc.querySelector('main')!
    assert.equal(main.querySelector('[role="status"]')?.textContent, 'Loading triage...Fetching unfinished items that match the Triage rules.')
    assert.equal(main.querySelectorAll('.MuiSkeleton-root').length, 8)
    assert.equal(doc.querySelector('table'), null)
  } finally {
    dom.window.close()
  }
})

test('a clear queue says so with when it was checked and the rules it was checked against; no rules opens Triage options', () => {
  const emptyCard = (options: Record<string, unknown>, syncedAt: number | null = null) => {
    const dom = renderDocument({ result: { items: [], warnings: [] }, options: { ageFlagDays: 2, readinessChecks, waitingTags: [], ...options }, syncedAt })
    try {
      const card = dom.window.document.querySelector('main .MuiCard-root')!
      assert.ok(card.querySelector('svg'), 'a success icon sits beside the heading')
      return [card.querySelector('h2')?.textContent, ...[...card.querySelectorAll('h2 ~ *')].map((line) => line.textContent)]
    } finally {
      dom.window.close()
    }
  }
  assert.deepEqual(emptyCard({ tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: ['Project\\Ignored'] }), [
    'Triage is clear', 'Nothing needs triage.', "No unfinished work items in this team's area are tagged “Triage”.",
  ])
  assert.deepEqual(emptyCard({ tags: ['Triage', 'Bug bash', 'Escalated'], includeNewBugs: true, excludedIterationPaths: [] }), [
    'Triage is clear', 'Nothing needs triage.',
    "No unfinished work items in this team's area are tagged “Triage”, “Bug bash”, or “Escalated”, and no bugs are waiting in their initial state.",
  ])
  assert.deepEqual(emptyCard({ tags: [], includeNewBugs: true, excludedIterationPaths: ['Project\\Refine'] }), [
    'Triage is clear', 'Nothing needs triage.', "No bugs in this team's area are waiting in their initial state outside the excluded iteration paths.",
  ])
  const synced = new Date(2026, 1, 9, 8, 5).getTime()
  const time = new Date(synced).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  assert.equal(emptyCard({ tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [] }, synced)[1], `Nothing needs triage as of ${time}.`)
  assert.equal(describeEmptyTriage({ tags: [], includeNewBugs: true, excludedIterationPaths: [] }), "No bugs in this team's area are waiting in their initial state.")
  assert.deepEqual([[0, 0], [1, 1], [5, 5], [0, 1], [2, 5]].map(([shown, total]) => formatTriageCount(shown, total)),
    ['0 items', '1 item', '5 items', '0 of 1 item', '2 of 5 items'])

  const dom = renderDocument({ options: { tags: [], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags: [] } })
  try {
    const card = dom.window.document.querySelector('main .MuiCard-root')!
    assert.equal(card.querySelector('h2')?.textContent, 'No Triage rules')
    assert.equal(card.querySelector('button')?.textContent, 'Open Triage options')
  } finally {
    dom.window.close()
  }
})

test('Open in ADO opens the Triage rules as a query in a new tab, and is disabled until the queue has loaded', () => {
  const queryUrl = 'https://dev.azure.com/org/Project/_queries/query/?wiql=SELECT'
  const loaded = renderDocument({ result: { items: [item], warnings: [], queryUrl } })
  try {
    const link = [...loaded.window.document.querySelectorAll<HTMLAnchorElement>('a')].find((anchor) => /Open in ADO/.test(anchor.textContent!))!
    assert.equal(link.href, queryUrl)
    assert.equal(link.target, '_blank')
    assert.ok(link.relList.contains('noopener') && link.relList.contains('noreferrer'))
    assert.equal(link.textContent, 'Open in ADO (opens in a new tab)')
  } finally { loaded.window.close() }

  for (const overrides of [{}, { isLoading: true, result: { items: [], warnings: [], queryUrl } }, { error: 'failed', result: { items: [], warnings: [], queryUrl } }]) {
    const dom = renderDocument(overrides)
    try {
      const button = [...dom.window.document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === 'Open in ADO')!
      assert.equal(button.disabled, true, JSON.stringify(overrides))
    } finally { dom.window.close() }
  }
})

test('the View toggle lists Table before Inbox and opens on Table, or on the Inbox when it is the remembered view', () => {
  const toggles = (doc: Document) => [...doc.querySelectorAll('[aria-label="Triage view"] button')]
    .map((button) => [button.textContent, button.getAttribute('aria-pressed')])
  const dom = renderDocument()
  try {
    const doc = dom.window.document
    assert.deepEqual(toggles(doc), [['Table', 'true'], ['Inbox', 'false']])
    assert.ok(doc.querySelector('table'))
    assert.equal(doc.querySelector('ul[aria-label="Triage summary"]'), null)
  } finally { dom.window.close() }

  const stub = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')!
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: (key: string) => (key === 'standup:last-view:triage' ? 'inbox' : null) },
  })
  try {
    const ignored = renderDocument()
    try {
      assert.ok(ignored.window.document.querySelector('table'), 'a saved view is ignored while Remember last view is off')
    } finally { ignored.window.close() }
    const remembered = renderDocument({ rememberLastView: true })
    try {
      const doc = remembered.window.document
      assert.deepEqual(toggles(doc), [['Table', 'false'], ['Inbox', 'true']])
      assert.equal(doc.querySelector('table'), null)
      assert.match(doc.querySelector('ul[aria-label="Triage summary"]')!.textContent!, /1 in triage/)
      assert.ok(doc.querySelector('[data-triage-card="42"]'))
    } finally { remembered.window.close() }
  } finally { Object.defineProperty(globalThis, 'localStorage', stub) }
})

test('the triage route renders Triage through StandupContent rather than Backlog', () => {
  const html = renderToStaticMarkup(createElement(Root, null, createElement(StandupContent, {
    activeView: 'triage', teamAssignmentsPageProps: { selectedTeamId: 'a' }, qualityAssurancePageProps: {},
    backlogPageProps: {}, testsPageProps: {}, triagePageProps: props(),
  })))
  assert.match(html, /Triage work items, oldest created first/)
  assert.doesNotMatch(html, /No open bugs|Plan a sprint/)
})
