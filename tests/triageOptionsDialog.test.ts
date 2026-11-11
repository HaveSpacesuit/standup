import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement } from 'react'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import type { TriageItem } from '../src/ado/types.ts'
import type { TriageOptions } from '../src/features/standup/utils/triageOptions.ts'

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
  Element: dom.window.Element,
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
const { TriagePage } = await server.ssrLoadModule('/src/features/standup/pages/TriagePage.tsx')

const item: TriageItem = {
  id: 42, title: 'Crash on save', workItemType: 'Bug', state: 'New', tags: ['Triage'], reasons: ['Tag: Triage'],
  workItemUrl: 'https://dev.azure.com/org/Project/_workitems/edit/42',
}
const noop = () => {}
const readinessChecks: TriageOptions['readinessChecks'] = { bug: ['severity', 'impact', 'effort', 'reproSteps'], other: ['effort', 'acceptanceCriteria'] }
const waitingTags = ['Needs Info']
const similarItems: TriageOptions['similarItems'] = { openBugs: true, closedBugs: true, closedDays: 180 }
const noSimilar = { openBugs: [], closedBugs: [], loading: false, warnings: [] }

async function renderPage(
  t: TestContext,
  options: TriageOptions,
  onOptionsChange: (options: TriageOptions) => void = noop,
  overrides: Record<string, unknown> = {},
) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  await act(async () => root.render(createElement(Root, null, createElement(TriagePage, {
    patConfigured: true,
    teamOptions: [{ id: 'a', displayName: 'Team A', orgName: 'org', projectName: 'Project', teamName: 'A', areaPath: 'Project\\A', iterationPath: 'Project', repoName: 'repo' }],
    selectedTeamId: 'a', onTeamChange: noop, teamManagementUrl: '',
    result: { items: [item], warnings: [] }, isLoading: false, error: null, syncedAt: null, onRefresh: noop,
    options, settingsError: null, onOptionsChange, quickFilterInputRef: { current: null },
    iterations: [{ name: 'Sprint 1', path: 'Project\\Sprint 1', timeFrame: 'current' }], iterationsLoading: false, iterationsError: null,
    similar: noSimilar, ...overrides,
  }))))
  return host
}

// React tracks an input's value, so typing has to go through the native setter for the change to be noticed.
const setNativeValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
async function typeInto(input: HTMLInputElement, text: string) {
  await act(async () => {
    setNativeValue.call(input, text)
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
}
const click = (element: HTMLElement) => act(async () => element.click())
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const buttonNamed = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === text)!

async function openOptions(host: Element) {
  await click(host.querySelector<HTMLButtonElement>('button[aria-label="Triage options"]')!)
  return dialog()!
}
const tagGroup = (opened: Element) => opened.querySelector('[role="group"][aria-labelledby]')!
const tagInput = (opened: Element) => opened.querySelector<HTMLInputElement>('input[aria-label="Add Triage tag"]')!
const tagChips = (opened: Element) => [...tagGroup(opened).querySelectorAll('.MuiChip-root')].map((chip) => chip.querySelector('.MuiChip-label')!.textContent)
function pathInput(opened: Element) {
  const label = [...opened.querySelectorAll('label')].find((candidate) => candidate.textContent === 'Excluded iteration paths')!
  return document.getElementById(label.htmlFor) as HTMLInputElement
}
const newBugsCheckbox = (opened: Element) => opened.querySelector<HTMLInputElement>('input[type="checkbox"]')!

test('Triage tags are pills edited with one input and an Add button, like QA tag filters', async (t) => {
  const saved: TriageOptions[] = []
  const host = await renderPage(t, { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }, (options) => saved.push(options))
  const opened = await openOptions(host)

  const group = tagGroup(opened)
  assert.equal(document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent, 'Triage tags')
  assert.deepEqual(tagChips(opened), ['Triage'])
  const add = buttonNamed(group, 'Add')
  assert.equal(add.disabled, true, 'Add waits for text')

  await typeInto(tagInput(opened), 'Needs review')
  assert.equal(add.disabled, false)
  await click(add)
  assert.deepEqual(tagChips(opened), ['Triage', 'Needs review'])
  assert.equal(tagInput(opened).value, '', 'the input clears after adding')

  await typeInto(tagInput(opened), 'triage; Bug bash')
  await act(async () => {
    tagInput(opened).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  })
  assert.deepEqual(tagChips(opened), ['Triage', 'Needs review', 'Bug bash'], 'Enter adds; separators split and duplicates are skipped')
  assert.equal(dialog(), opened, 'Enter does not submit or close the dialog')

  const remove = [...group.querySelectorAll<HTMLButtonElement>('.MuiChip-root button')][0]
  assert.match(remove.textContent ?? '', /Clear/, 'each pill has a labelled remove button')
  await click(remove)
  assert.deepEqual(tagChips(opened), ['Needs review', 'Bug bash'])

  await typeInto(tagInput(opened), 'Escalated')
  await click(buttonNamed(opened, 'Save'))
  assert.deepEqual(saved, [{ tags: ['Bug bash', 'Escalated', 'Needs review'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }],
    'Save includes a tag typed but not yet added')
  assert.equal(dialog(), null)
})

test('removing every tag shows the empty text, and saving with no tags keeps tag matching off', async (t) => {
  const saved: TriageOptions[] = []
  const host = await renderPage(t, { tags: ['Triage'], includeNewBugs: true, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }, (options) => saved.push(options))
  const opened = await openOptions(host)
  await click(tagGroup(opened).querySelector<HTMLButtonElement>('.MuiChip-root button')!)
  assert.deepEqual(tagChips(opened), [])
  assert.match(tagGroup(opened).textContent ?? '', /No Triage tags\. Tag matching is off\./)
  await click(buttonNamed(opened, 'Save'))
  assert.deepEqual(saved, [{ tags: [], includeNewBugs: true, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }])
})

test('excluded iteration paths are disabled while new bugs is off, and kept when saved', async (t) => {
  const saved: TriageOptions[] = []
  const options = { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: ['Project\\Refine'], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }
  const host = await renderPage(t, options, (next) => saved.push(next))
  const opened = await openOptions(host)

  assert.equal(newBugsCheckbox(opened).checked, false)
  assert.equal(pathInput(opened).disabled, true)
  assert.match(opened.textContent ?? '', /Turn on new bugs to use excluded iteration paths\. Saved paths are kept\./)
  assert.match(opened.textContent ?? '', /Project\\Refine/, 'the saved path is still shown')
  const pathRemoveButtons = () => pathInput(opened).closest('.MuiAutocomplete-root')!.querySelectorAll('.MuiAutocomplete-tag button')
  assert.equal(pathRemoveButtons().length, 0, 'a saved path cannot be removed while the field is disabled')

  await click(newBugsCheckbox(opened))
  assert.equal(pathInput(opened).disabled, false)
  assert.equal(pathRemoveButtons().length, 1)
  assert.match(opened.textContent ?? '', /excluded only for new bugs/)
  await typeInto(pathInput(opened), 'Project\\Pending')

  await click(newBugsCheckbox(opened))
  assert.equal(pathInput(opened).disabled, true)
  await click(buttonNamed(opened, 'Save'))
  assert.deepEqual(saved, [options], 'the saved paths are kept, but text typed into the disabled field is not')
})

test('turning new bugs on saves the excluded paths, including one still being typed', async (t) => {
  const saved: TriageOptions[] = []
  const host = await renderPage(t, { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: ['Project\\Refine'], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }, (next) => saved.push(next))
  const opened = await openOptions(host)
  await click(newBugsCheckbox(opened))
  await typeInto(pathInput(opened), 'Project\\Later')
  await click(buttonNamed(opened, 'Save'))
  assert.deepEqual(saved, [{ tags: ['Triage'], includeNewBugs: true, excludedIterationPaths: ['Project\\Later', 'Project\\Refine'], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }])
})

test('the age flag is a whole number of working days, saved with the rules and rejected when out of range', async (t) => {
  const saved: TriageOptions[] = []
  const host = await renderPage(t, { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }, (next) => saved.push(next))
  const opened = await openOptions(host)
  const label = [...opened.querySelectorAll('label')].find((candidate) => candidate.textContent === 'Flag age after (working days)')!
  const input = document.getElementById(label.htmlFor) as HTMLInputElement
  assert.equal(input.value, '2')
  assert.match(opened.textContent ?? '', /shows its age in amber \(1–30\)/)

  for (const value of ['0', '31', '']) {
    await typeInto(input, value)
    await click(buttonNamed(opened, 'Save'))
    assert.match(opened.querySelector('.MuiAlert-message')?.textContent ?? '', /whole number of working days from 1 to 30/)
    assert.equal(dialog(), opened, 'an invalid age flag keeps the dialog open')
  }
  assert.deepEqual(saved, [])

  await typeInto(input, '5')
  await click(buttonNamed(opened, 'Save'))
  assert.deepEqual(saved, [{ tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 5, readinessChecks, waitingTags, similarItems }])
})

test('waiting tags are edited like Triage tags and saved with the rules, including one still being typed', async (t) => {
  const saved: TriageOptions[] = []
  const host = await renderPage(t, { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }, (next) => saved.push(next))
  const opened = await openOptions(host)
  const group = [...opened.querySelectorAll('[role="group"]')].find((candidate) =>
    document.getElementById(candidate.getAttribute('aria-labelledby')!)?.textContent === 'Waiting tags')!
  assert.match(group.textContent ?? '', /the tags do not add items/)
  const chips = () => [...group.querySelectorAll('.MuiChip-label')].map((chip) => chip.textContent)
  assert.deepEqual(chips(), ['Needs Info'])
  const input = group.querySelector<HTMLInputElement>('input[aria-label="Add waiting tag"]')!
  await typeInto(input, 'Awaiting QA')
  await click(buttonNamed(group, 'Add'))
  assert.deepEqual(chips(), ['Needs Info', 'Awaiting QA'])
  await click(group.querySelector<HTMLButtonElement>('.MuiChip-root button')!)
  assert.deepEqual(chips(), ['Awaiting QA'])
  await typeInto(input, 'On hold')
  await click(buttonNamed(opened, 'Save'))
  assert.deepEqual(saved.map((options) => options.waitingTags), [['Awaiting QA', 'On hold']])
})

test('readiness checks are picked per type from the known fields and saved with the rules', async (t) => {
  const saved: TriageOptions[] = []
  const host = await renderPage(t, { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }, (next) => saved.push(next))
  const opened = await openOptions(host)
  const group = [...opened.querySelectorAll('[role="group"]')].find((candidate) =>
    document.getElementById(candidate.getAttribute('aria-labelledby')!)?.textContent === 'Readiness checks')!
  assert.match(group.textContent ?? '', /Leave both empty to hide the Readiness column/)
  const field = (name: string) => {
    const label = [...group.querySelectorAll('label')].find((candidate) => candidate.textContent === name)!
    return document.getElementById(label.htmlFor)!.closest('.MuiAutocomplete-root')!
  }
  const chips = (name: string) => [...field(name).querySelectorAll('.MuiChip-label')].map((chip) => chip.textContent)
  assert.deepEqual(chips('Required on bugs'), ['Severity', 'Impact', 'Effort', 'Repro steps'])
  assert.deepEqual(chips('Required on other types'), ['Effort', 'Acceptance criteria'])

  const impact = [...field('Required on bugs').querySelectorAll('.MuiChip-root')].find((chip) => chip.textContent?.startsWith('Impact'))!
  await click(impact.querySelector<HTMLButtonElement>('button')!)
  assert.deepEqual(chips('Required on bugs'), ['Severity', 'Effort', 'Repro steps'])

  // MUI clears the text of an Autocomplete that is not focused, so it is focused first, as a click would.
  const otherInput = field('Required on other types').querySelector('input')!
  await act(async () => otherInput.focus())
  await typeInto(otherInput, 'desc')
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
  assert.deepEqual(options.map((option) => option.textContent), ['Description'], 'already chosen checks are not offered again')
  await click(options[0])
  await click(buttonNamed(opened, 'Save'))
  assert.deepEqual(saved.map((options) => options.readinessChecks), [{ bug: ['severity', 'effort', 'reproSteps'], other: ['effort', 'acceptanceCriteria', 'description'] }])
})

test('the no-rules card opens Triage options', async (t) => {
  const host = await renderPage(t, { tags: [], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems })
  assert.equal(host.querySelector('main h2')?.textContent, 'No Triage rules')
  await click(buttonNamed(host, 'Open Triage options'))
  assert.equal(dialog()?.querySelector('h2')?.textContent, 'Triage options')
})

test('a quick filter that hides every item says so as muted status text, not the empty-queue card', async (t) => {
  const host = await renderPage(t, { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems })
  const count = () => host.querySelector('p[aria-live="polite"]')?.textContent
  assert.ok(host.querySelector('table'))
  assert.equal(count(), '1 item', 'like Backlog, the count names the total alone while nothing is filtered out')
  await typeInto(host.querySelector<HTMLInputElement>('input[aria-label="Quick filter triage items"]')!, 'no such item')
  assert.equal(count(), '0 of 1 item')
  assert.equal(host.querySelector('table'), null)
  assert.equal(host.querySelector('main [role="status"]')?.textContent, 'No items match the quick filter. Clear it to see the triage queue.')
  assert.equal(host.querySelector('.MuiCard-root'), null)
})

test('the View toggle switches between the table and the Inbox, which the quick filter narrows too', async (t) => {
  const host = await renderPage(t, { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems })
  const toggle = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Triage view"] button')].find((button) => button.textContent === name)!
  const filter = host.querySelector<HTMLInputElement>('input[aria-label="Quick filter triage items"]')!
  assert.ok(host.querySelector('table'))
  await click(toggle('Inbox'))
  assert.equal(toggle('Inbox').getAttribute('aria-pressed'), 'true')
  assert.equal(host.querySelector('table'), null)
  assert.ok(host.querySelector('[data-triage-card="42"]'))
  await typeInto(filter, 'no such item')
  assert.equal(host.querySelector('[data-triage-card]'), null)
  assert.equal(host.querySelector('main [role="status"]')?.textContent, 'No items match the quick filter. Clear it to see the triage queue.')
  await typeInto(filter, 'crash')
  assert.ok(host.querySelector('[data-triage-card="42"]'))
  await click(toggle('Table'))
  assert.ok(host.querySelector('table tbody tr'))
})

test('Similar items sources are saved with the rules, and the days are kept while closed bugs are off', async (t) => {
  const saved: TriageOptions[] = []
  const options = { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }
  const host = await renderPage(t, options, (next) => saved.push(next))
  let opened = await openOptions(host)
  const group = () => [...dialog()!.querySelectorAll('[role="group"]')].find((candidate) =>
    document.getElementById(candidate.getAttribute('aria-labelledby')!)?.textContent === 'Similar items')!
  const checkbox = (name: string) => [...group().querySelectorAll('label')].find((label) => label.textContent === name)!.querySelector('input')!
  const days = () => group().querySelector<HTMLInputElement>('input[aria-label^="Days to look back"]')!
  assert.match(group().textContent ?? '', /compared with the rest of the queue/)
  assert.deepEqual([checkbox('Open bugs').checked, checkbox('Bugs closed in the last').checked, days().value], [true, true, '180'])

  await click(checkbox('Open bugs'))
  for (const value of ['0', '366', '']) {
    await typeInto(days(), value)
    await click(buttonNamed(opened, 'Save'))
    assert.match(opened.querySelector('.MuiAlert-message')?.textContent ?? '', /whole number of days from 1 to 365/)
  }
  await typeInto(days(), '90')
  await click(buttonNamed(opened, 'Save'))
  assert.deepEqual(saved.map((next) => next.similarItems), [{ openBugs: false, closedBugs: true, closedDays: 90 }])

  opened = await openOptions(host)
  await typeInto(days(), '0')
  await click(checkbox('Bugs closed in the last'))
  assert.equal(days().disabled, true)
  await click(buttonNamed(opened, 'Save'))
  assert.deepEqual(saved[1].similarItems, { openBugs: true, closedBugs: false, closedDays: 180 },
    'the saved days are kept, but an edit to the disabled field is not')
})

test('Compare shows an item beside its closest match, and Not a duplicate moves on to the next closest', async (t) => {
  const url = (id: number) => `https://dev.azure.com/org/Project/_workitems/edit/${id}`
  const watermark: TriageItem = {
    id: 50, title: 'Watermark missing from exported PDF drawings', workItemType: 'Bug', state: 'New', tags: ['Triage'],
    reasons: ['Tag: Triage'], createdAt: '2026-04-28T10:00:00Z', createdBy: { displayName: 'Ana Diaz' }, workItemUrl: url(50),
  }
  const similar = {
    ...noSimilar,
    openBugs: [{ id: 800, title: 'Watermark missing in PDF preview', state: 'Active', iterationPath: 'Project\\Sprint 1', workItemUrl: url(800) }],
    closedBugs: [{
      id: 900, title: 'Exported PDF drawings lose watermark', state: 'Done', closedAt: '2026-01-14T12:00:00Z', severity: '2 - High',
      priority: 2, effort: 3, workItemUrl: url(900),
    }],
  }
  const options = { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks, waitingTags, similarItems }
  const host = await renderPage(t, options, noop, { result: { items: [item, watermark], warnings: [] }, similar })
  const strip = (id: number) => host.querySelector(`tr:has(a[href$="/${id}"]) [data-triage-match]`)
  assert.equal(strip(42), null, 'an item with no similar title has no strip')
  assert.equal(strip(50)?.getAttribute('data-triage-match'), 'closed')
  assert.match(strip(50)!.textContent!, /^Possible regression of 900/)

  const filter = host.querySelector<HTMLInputElement>('input[aria-label="Quick filter triage items"]')!
  await typeInto(filter, 'regression')
  assert.deepEqual([...host.querySelectorAll('tbody tr')].map((row) => row.querySelector('.work-item-id')?.textContent), ['50'],
    'the quick filter searches the match too')
  await typeInto(filter, '')

  const compare = [...strip(50)!.querySelectorAll('button')].find((button) => button.textContent!.startsWith('Compare'))!
  assert.equal(compare.textContent, 'Compare 50 with 900')
  await click(compare)
  const opened = dialog()!
  assert.equal(opened.querySelector('h2')?.textContent, 'Compare 50 and 900')
  assert.equal(opened.querySelector('p')?.textContent, 'Shared words: Watermark exported PDF drawings')
  const sides = [...opened.querySelectorAll('section')]
  assert.deepEqual(sides.map((side) => side.querySelector('.side-top')!.textContent), ['50In triage', '900Closed · possible regression'])
  assert.deepEqual(sides.map((side) => [...side.querySelectorAll('h3 mark')].map((mark) => mark.textContent)),
    [['Watermark', 'exported', 'PDF', 'drawings'], ['Exported', 'PDF', 'drawings', 'watermark']])
  for (const side of sides) {
    const link = side.querySelector<HTMLAnchorElement>('h3 a')!
    assert.equal(link.target, '_blank')
    assert.equal(document.getElementById(side.getAttribute('aria-labelledby')!), side.querySelector('h3'))
  }
  const facts = Object.fromEntries([...sides[1].querySelectorAll('dt')].map((term) => [term.textContent, term.nextElementSibling!.textContent]))
  assert.equal(facts.Closed, 'Jan 14')
  assert.equal(facts.Effort, '3')
  assert.match(opened.textContent!, /If this is a regression, link the two as Related/)

  await click(buttonNamed(opened, 'Not a duplicate'))
  assert.equal(dialog(), null)
  assert.match(strip(50)!.textContent!, /^Similar open bug 800/, 'the next closest match shows instead')
  assert.equal(strip(50)?.getAttribute('data-triage-match'), 'open')
})
