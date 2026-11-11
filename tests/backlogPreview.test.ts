import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement } from 'react'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import type { BacklogBug, WorkItemPreview } from '../src/ado/types.ts'
import type { WorkItemPreviewSource } from '../src/features/standup/hooks/useWorkItemPreview.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
// The panel width and last view are kept in the bare storage globals; the avatars read the saved PAT from them.
for (const name of ['localStorage', 'sessionStorage'] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] })
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
const { BacklogPage } = await server.ssrLoadModule('/src/features/standup/pages/BacklogPage.tsx')
const { getAssumedValueInputs, rankBacklogBugs } = await server.ssrLoadModule('/src/features/standup/utils/backlogValue.ts')
const { createDefaultBacklogOptions } = await server.ssrLoadModule('/src/features/standup/utils/backlogOptions.ts')

const workItemUrl = (id: number) => `https://dev.azure.com/org/Project/_workitems/edit/${id}`
const bug = (id: number, title: string, fields: Partial<BacklogBug> = {}): BacklogBug => ({
  id, title, state: 'New', createdAt: '2026-02-01T00:00:00Z', iterationPath: 'Project', workItemUrl: workItemUrl(id), ...fields,
})
// Ranked Data loss (Top), Slow page (Moderate), Typo (Minimal), Missing fields (Minimal, every input assumed).
const allBugs = rankBacklogBugs([
  bug(201, 'Data loss', { severity: '1 - Critical', priority: 1, effort: 4 }),
  bug(202, 'Slow page', { severity: '2 - High', priority: 2, effort: 8 }),
  bug(203, 'Missing fields'),
  bug(204, 'Typo', { severity: '3 - Medium', priority: 3, effort: 2 }),
])
const noop = () => {}

function previewSource(): WorkItemPreviewSource & { loaded: number[] } {
  const loaded: number[] = []
  return {
    loaded,
    key: 'test',
    load: async (id): Promise<WorkItemPreview> => {
      loaded.push(id)
      return { id, text: { reproSteps: `<p>Steps for ${id}</p>` }, attachments: [], comments: [], commentCount: 0, links: [], hyperlinks: [], developmentLinks: 0 }
    },
    peek: () => undefined,
    images: { canLoad: () => false, load: () => null },
  }
}

function pageProps(overrides: Record<string, unknown>) {
  const bugs = (overrides.bugs as typeof allBugs | undefined) ?? allBugs
  return {
    patConfigured: true,
    teamOptions: [{ id: 'a', displayName: 'Team A', orgName: 'org', projectName: 'Project', teamName: 'A', areaPath: 'Project\\A', iterationPath: 'Project', repoName: 'repo' }],
    selectedTeamId: 'a', onTeamChange: noop, teamManagementUrl: '',
    quickFilterInput: '', onQuickFilterInputChange: noop, onQuickFilterClear: noop, quickFilterInputRef: { current: null },
    onRefresh: noop, bugs, allBugs: bugs, totalBugCount: bugs.length, isLoading: false, error: null,
    backlogOptions: { ...createDefaultBacklogOptions(), startLowCollapsed: false },
    ...overrides,
  }
}

async function renderPage(t: TestContext, overrides: Record<string, unknown> = {}) {
  localStorage.clear()
  sessionStorage.clear()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  const render = (next: Record<string, unknown>) => act(async () => root.render(createElement(Root, null, createElement(BacklogPage, pageProps(next)))))
  await render(overrides)
  return { host, render }
}

const click = (element: Element) => act(async () => (element as HTMLElement).click())
const press = (key: string) => act(async () => {
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
})
const panel = () => document.querySelector<HTMLElement>('aside#backlog-preview-panel')
const panelTitle = () => panel()?.querySelector('h2')?.textContent
const toggleFor = (host: Element, id: number) => host.querySelector<HTMLButtonElement>(`[data-preview-toggle="${id}"]`)!
const rowFor = (host: Element, id: number) => host.querySelector(`tr[data-preview-id="${id}"]`)!
const sectionHeadings = () => [...panel()!.querySelectorAll('section h3')].map((heading) => heading.textContent)
const viewToggle = (host: Element, name: string) =>
  [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Backlog view"] button')].find((candidate) => candidate.textContent === name)!

test('getAssumedValueInputs names the inputs the Value assumed a default for', () => {
  const byId = new Map(allBugs.map((ranked: { id: number }) => [ranked.id, ranked]))
  assert.deepEqual(getAssumedValueInputs(byId.get(201)), { severity: false, impact: false, effort: false })
  assert.deepEqual(getAssumedValueInputs(byId.get(203)), { severity: true, impact: true, effort: true })
  const [unreadable] = rankBacklogBugs([bug(1, 'Odd', { severity: 'Showstopper', priority: 9, effort: Number.NaN })])
  assert.deepEqual(getAssumedValueInputs(unreadable), { severity: true, impact: true, effort: true })
})

test('without a preview source the rows have no preview buttons', async (t) => {
  const { host } = await renderPage(t)
  assert.equal(host.querySelector('[data-preview-toggle]') === null, true)
  assert.equal(host.querySelector('tr[data-preview-id]') === null, true)
  await click(host.querySelector('tbody tr:not(.backlog-tier-header) td:last-child')!)
  assert.equal(panel() === null, true)
})

test('the eye button previews a bug beside the list with why it ranks there, loading the next one ahead', async (t) => {
  const source = previewSource()
  const { host } = await renderPage(t, { preview: source })
  assert.equal(host.querySelectorAll('tbody [data-preview-toggle]').length, 4)

  await click(toggleFor(host, 201))
  assert.equal(panelTitle(), 'Data loss')
  assert.equal(panel()!.closest('[data-preview-layout]')!.contains(host.querySelector('table')), true, 'the panel sits beside the table')
  assert.deepEqual([toggleFor(host, 201).getAttribute('aria-pressed'), toggleFor(host, 201).getAttribute('aria-controls')], ['true', 'backlog-preview-panel'])
  assert.ok(rowFor(host, 201).classList.contains('Mui-selected'))
  assert.deepEqual(sectionHeadings(), ['Value', 'Repro steps', 'Attachments', 'Comments', 'Links'])

  const value = panel()!.querySelector('section')!
  assert.match(value.textContent!, /Rank 1 of 4/)
  assert.match(value.textContent!, /Top\s*Value 80\+/)
  assert.deepEqual([...value.querySelectorAll('dt')].map((term) => term.textContent), ['Severity', 'Impact', 'Effort'])
  assert.deepEqual([...value.querySelectorAll('dd.term')].map((term) => term.textContent), ['→ 10.6', '→ 8', '→ 4'])
  assert.match(value.textContent!, /Value 213 = 10\.6 × 8 ÷ 4 × 10/)
  assert.equal(value.querySelector('.assumed') === null, true, 'every input is set')
  assert.equal(value.querySelector('[data-assumed]') === null, true)
  assert.match(panel()!.querySelector('.facts')!.textContent!, /Sprint.*State.*Assigned.*Age/)
  assert.match(panel()!.textContent!, /Steps for 201/)
  assert.deepEqual(source.loaded, [201, 202])

  await click(toggleFor(host, 201))
  assert.equal(panel() === null, true, 'the same button closes it')
})

test('a bug whose Value assumed some inputs says which, and that its rank may change', async (t) => {
  const { host } = await renderPage(t, { preview: previewSource() })
  await click(toggleFor(host, 203))
  const value = panel()!.querySelector('section')!
  assert.match(value.textContent!, /Rank 4 of 4/)
  assert.match(value.textContent!, /Minimal/)
  assert.equal(value.querySelectorAll('dd.term[data-assumed]').length, 3)
  assert.equal(
    value.querySelector('.assumed')!.textContent,
    'The Value assumes a default for Severity, Impact and Effort, so this rank may change once they are set.',
  )
})

test('clicking a row previews it, and J and K follow the ranked rows, skipping collapsed tiers', async (t) => {
  const source = previewSource()
  const { host, render } = await renderPage(t, { preview: source, backlogOptions: createDefaultBacklogOptions() })
  assert.equal(rowFor(host, 204) === null, true, 'the Minimal tier starts collapsed')

  await click(rowFor(host, 202).querySelector('td:last-child')!)
  assert.equal(panelTitle(), 'Slow page')
  await press('j')
  assert.equal(panelTitle(), 'Slow page', 'J stops at the last bug shown')
  await press('k')
  assert.equal(panelTitle(), 'Data loss')

  await render({ preview: source, backlogOptions: { ...createDefaultBacklogOptions(), startLowCollapsed: false } })
  await press('j')
  await press('j')
  assert.equal(panelTitle(), 'Typo', 'an expanded tier joins the order')
  await press('Escape')
  assert.equal(panel() === null, true)
})

test('a bug that leaves the backlog says so, and J moves on to the next', async (t) => {
  const source = previewSource()
  const { host, render } = await renderPage(t, { preview: source })
  await click(toggleFor(host, 201))
  await render({ preview: source, bugs: allBugs.filter((ranked: { id: number }) => ranked.id !== 201) })

  assert.equal(panelTitle(), 'No longer in the backlog')
  assert.match(panel()!.textContent!, /Bug 201 is no longer among the open bugs for this team\. Press J for the next bug\./)
  assert.equal(panel()!.querySelector('a[aria-label="Open in Azure DevOps"]') === null, true)
  await press('j')
  assert.equal(panelTitle(), 'Slow page')
})

test('switching teams closes the preview rather than calling the last team\'s bug gone', async (t) => {
  const source = previewSource()
  const teamOptions = ['a', 'b'].map((id) => ({
    id, displayName: `Team ${id}`, orgName: 'org', projectName: 'Project', teamName: id, areaPath: `Project\\${id}`, iterationPath: 'Project', repoName: 'repo',
  }))
  const { host, render } = await renderPage(t, { preview: source, teamOptions })
  await click(toggleFor(host, 201))
  assert.equal(panelTitle(), 'Data loss')

  const teamB = rankBacklogBugs([bug(301, 'Other team bug', { severity: '2 - High' })])
  await render({ preview: { ...source, key: 'b' }, teamOptions, selectedTeamId: 'b', bugs: teamB })
  assert.equal(panel() === null, true)
  await press('j')
  assert.equal(panelTitle(), 'Other team bug')
})

test('the Map has no preview: switching to it closes the panel', async (t) => {
  const { host } = await renderPage(t, { preview: previewSource() })
  await click(toggleFor(host, 202))
  assert.equal(panelTitle(), 'Slow page')

  await click(viewToggle(host, 'Map'))
  assert.equal(host.querySelector('table') === null, true)
  assert.equal(panel() === null, true)
  assert.equal(host.querySelector('[data-preview-toggle]') === null, true)
  await press('j')
  assert.equal(panel() === null, true, 'J does nothing on the Map')

  await click(viewToggle(host, 'List'))
  assert.equal(panel() === null, true, 'the preview stays closed back on the List')
  await press('j')
  assert.equal(panelTitle(), 'Slow page', 'J reopens the bug previewed last')
})
