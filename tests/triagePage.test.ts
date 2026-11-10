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
const { describeEmptyTriage, filterTriageItems, formatTriageCount, getTriageVisibleText } = await server.ssrLoadModule('/src/features/standup/utils/triageDisplay.ts')
const { createBacklogSprintResolver } = await server.ssrLoadModule('/src/features/standup/utils/backlogSprint.ts')
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
    options: { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [] },
    settingsError: null, onOptionsChange: noop, quickFilterInputRef: { current: null },
    iterations: [], iterationsLoading: false, iterationsError: null,
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
const COLUMN_HEADERS = ['Work item', 'Severity', 'Impact', 'Effort', 'Age', 'Sprint', 'State', 'Assigned to', 'Created by', 'Parent']
/** The row's data cells by header, after the Work item cell. */
function cellsOf(row: Element) {
  return Object.fromEntries([...row.querySelectorAll('td')].map((cell, index) => [COLUMN_HEADERS[index + 1], cell]))
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
    assert.deepEqual([...titleCell.querySelectorAll('ul[aria-label="Tags"] li')].map((tag) => tag.textContent), ['Triage', 'Frontend'])
    assert.ok(![...doc.querySelectorAll('tbody td')].some((cell) => /Frontend/.test(cell.textContent!)), 'tags only appear in the title cell')
    assert.doesNotMatch(doc.querySelector('tbody')!.textContent!, /Tag: Triage|New bug/, 'why an item qualified is not shown')
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
    assert.match(cells.Age.textContent!, /Created /)
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

test('empty Severity, Impact and Effort are flagged on bugs and dashed on other types; Unassigned and New are muted', () => {
  const dom = renderDocument({ result: { items: [emptyBug, emptyStory], warnings: [] } })
  try {
    const [bug, story] = [...dom.window.document.querySelectorAll('tbody tr')].map(cellsOf)
    assert.equal(bug.Severity.textContent, 'Not set')
    assert.equal(bug.Impact.textContent, '?Not set')
    assert.equal(bug.Effort.textContent, '?Not set')
    assert.equal(bug.Age.textContent, '—Not set')
    assert.equal(bug.State.textContent, 'New')
    assert.equal(bug.State.querySelector('.MuiBadge-root'), null, 'New is muted text rather than a badge')
    assert.equal(bug['Assigned to'].textContent, 'Unassigned')
    assert.equal(bug['Created by'].textContent, 'Unknown')
    assert.equal(bug.Parent.textContent, '—Not set')
    for (const field of ['Severity', 'Impact', 'Effort']) assert.equal(story[field].textContent, '—Not set', field)
    assert.equal(story.State.querySelector('.MuiBadge-badge')?.textContent, 'RFR', 'long states are abbreviated like Backlog')
    assert.match(story.State.textContent!, /Ready for Review/, 'the full state stays available to screen readers')
  } finally { dom.window.close() }
})

test('quick filter searches the text the table displays, and not reasons, paths or raw field values', () => {
  const resolveSprint = createBacklogSprintResolver([])
  const visible = getTriageVisibleText(item, resolveSprint(item.iterationPath)).filter(Boolean)
  for (const query of ['42', 'Crash', 'Bug', 'Frontend', 'S2 · High', 'Sprint 1', 'Reported', 'Developer', 'Reporter', '99: Parent feature', ...visible]) {
    assert.equal(filterTriageItems([item], String(query), resolveSprint).length, 1, String(query))
  }
  for (const query of ['New bug', 'Tag: Triage', 'Project\\Sprint', '2 - High', 'not in this row']) {
    assert.deepEqual(filterTriageItems([item], query, resolveSprint), [], query)
  }
  const items = [item, emptyBug, emptyStory]
  assert.equal(filterTriageItems(items, '   ', resolveSprint), items, 'an empty filter returns the same list')
  assert.deepEqual(filterTriageItems(items, 'unassigned', resolveSprint).map(({ id }) => id), [43, 44])
  assert.deepEqual(filterTriageItems(items, 'ready for review', resolveSprint).map(({ id }) => id), [44])
  assert.deepEqual(filterTriageItems(items, 'RFR', resolveSprint).map(({ id }) => id), [44])
  const current = createBacklogSprintResolver([{ name: 'Sprint 1', path: 'Project\\Sprint 1', timeFrame: 'current' }])
  assert.deepEqual(filterTriageItems(items, 'this sprint', current).map(({ id }) => id), [42])
})
test('page distinguishes configuration, auth, loading, errors, empty rules, empty queue and parent warnings', () => {
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ teamOptions: [] }, /Configure at least one team/],
    [{ patConfigured: false }, /Configure an Azure DevOps PAT/],
    [{ isLoading: true }, /Loading triage\.\.\./],
    [{ error: 'query failed (HTTP 503)' }, /query failed \(HTTP 503\)/],
    [{ settingsError: 'Unable to read Triage options' }, /Unable to read Triage options/],
    [{ options: { tags: [], includeNewBugs: false, excludedIterationPaths: [] } }, /No Triage rules/],
    [{ result: { items: [], warnings: [] } }, /Nothing to triage/],
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

test('empty queues use a centered card that names the rules, and the no-rules card opens Triage options', () => {
  const emptyCard = (options: Record<string, unknown>) => {
    const dom = renderDocument({ result: { items: [], warnings: [] }, options })
    try {
      const card = dom.window.document.querySelector('main .MuiCard-root')!
      return [card.querySelector('h2')?.textContent, card.querySelector('h2 + *')?.textContent]
    } finally {
      dom.window.close()
    }
  }
  assert.deepEqual(emptyCard({ tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: ['Project\\Ignored'] }), [
    'Nothing to triage', "No unfinished work items in this team's area are tagged “Triage”.",
  ])
  assert.deepEqual(emptyCard({ tags: ['Triage', 'Bug bash', 'Escalated'], includeNewBugs: true, excludedIterationPaths: [] }), [
    'Nothing to triage',
    "No unfinished work items in this team's area are tagged “Triage”, “Bug bash”, or “Escalated”, and no bugs are waiting in their initial state.",
  ])
  assert.deepEqual(emptyCard({ tags: [], includeNewBugs: true, excludedIterationPaths: ['Project\\Refine'] }), [
    'Nothing to triage', "No bugs in this team's area are waiting in their initial state outside the excluded iteration paths.",
  ])
  assert.equal(describeEmptyTriage({ tags: [], includeNewBugs: true, excludedIterationPaths: [] }), "No bugs in this team's area are waiting in their initial state.")
  assert.deepEqual([[0, 0], [1, 1], [5, 5], [0, 1], [2, 5]].map(([shown, total]) => formatTriageCount(shown, total)),
    ['0 items', '1 item', '5 items', '0 of 1 item', '2 of 5 items'])

  const dom = renderDocument({ options: { tags: [], includeNewBugs: false, excludedIterationPaths: [] } })
  try {
    const card = dom.window.document.querySelector('main .MuiCard-root')!
    assert.equal(card.querySelector('h2')?.textContent, 'No Triage rules')
    assert.equal(card.querySelector('button')?.textContent, 'Open Triage options')
  } finally {
    dom.window.close()
  }
})

test('the triage route renders Triage through StandupContent rather than Backlog', () => {
  const html = renderToStaticMarkup(createElement(Root, null, createElement(StandupContent, {
    activeView: 'triage', teamAssignmentsPageProps: { selectedTeamId: 'a' }, qualityAssurancePageProps: {},
    backlogPageProps: {}, testsPageProps: {}, triagePageProps: props(),
  })))
  assert.match(html, /Triage work items, oldest created first/)
  assert.doesNotMatch(html, /No open bugs|Plan a sprint/)
})
