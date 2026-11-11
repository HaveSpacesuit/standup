import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement } from 'react'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import type { TriageItem, WorkItemPreview } from '../src/ado/types.ts'
import type { WorkItemPreviewSource } from '../src/features/standup/hooks/useWorkItemPreview.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
// The panel width, last view and last visit are kept in the bare storage globals; the avatars read the saved PAT from them.
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
const { TriagePage } = await server.ssrLoadModule('/src/features/standup/pages/TriagePage.tsx')
const { isPreviewRowClick } = await server.ssrLoadModule('/src/features/standup/hooks/usePreviewPanel.ts')

const workItemUrl = (id: number) => `https://dev.azure.com/org/Project/_workitems/edit/${id}`
const bug = (id: number, title: string): TriageItem => ({
  id, title, workItemType: 'Bug', state: 'New', tags: ['Triage'], reasons: ['Tag: Triage'], workItemUrl: workItemUrl(id),
  createdAt: '2026-02-01T00:00:00Z', createdBy: { displayName: 'Quinn Tester' },
})
const items = [bug(42, 'Crash on save'), bug(43, 'Freeze on open'), bug(44, 'Typo in dialog')]
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
  return {
    patConfigured: true,
    teamOptions: [{ id: 'a', displayName: 'Team A', orgName: 'org', projectName: 'Project', teamName: 'A', areaPath: 'Project\\A', iterationPath: 'Project', repoName: 'repo' }],
    selectedTeamId: 'a', onTeamChange: noop, teamManagementUrl: '',
    result: { items, warnings: [] }, isLoading: false, error: null, syncedAt: null, onRefresh: noop,
    options: {
      tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, waitingTags: ['Needs Info'],
      readinessChecks: { bug: ['severity', 'reproSteps'], other: [] }, similarItems: { openBugs: false, closedBugs: false, closedDays: 180 },
    },
    settingsError: null, onOptionsChange: noop, quickFilterInputRef: { current: null },
    iterations: [], iterationsLoading: false, iterationsError: null, rememberLastView: false,
    similar: { openBugs: [], closedBugs: [], loading: false, warnings: [] },
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
  const render = (next: Record<string, unknown>) => act(async () => root.render(createElement(Root, null, createElement(TriagePage, pageProps(next)))))
  await render(overrides)
  return { host, render }
}

const click = (element: Element) => act(async () => (element as HTMLElement).click())
const press = (key: string) => act(async () => {
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
})
const panel = () => document.querySelector<HTMLElement>('aside#triage-preview-panel')
const panelTitle = () => panel()?.querySelector('h2')?.textContent
const toggleFor = (host: Element, id: number) => host.querySelector<HTMLButtonElement>(`[data-preview-toggle="${id}"]`)!
const sectionHeadings = () => [...panel()!.querySelectorAll('section h3')].map((heading) => heading.textContent)

test('without a preview source the rows have no preview buttons', async (t) => {
  const { host } = await renderPage(t)
  assert.equal(host.querySelector('[data-preview-toggle]'), null)
  await click(host.querySelector('tbody tr td')!)
  assert.equal(panel(), null)
})

test('the eye button previews an item beside the table, loading the next one ahead', async (t) => {
  const source = previewSource()
  const { host } = await renderPage(t, { preview: source })
  assert.equal(host.querySelectorAll('tbody [data-preview-toggle]').length, 3)

  await click(toggleFor(host, 42))
  assert.equal(panelTitle(), 'Crash on save')
  assert.equal(panel()!.closest('[data-preview-layout]')!.contains(host.querySelector('table')), true, 'the panel sits beside the table')
  assert.deepEqual([toggleFor(host, 42).getAttribute('aria-pressed'), toggleFor(host, 42).getAttribute('aria-controls')], ['true', 'triage-preview-panel'])
  assert.ok(host.querySelector('tr[data-preview-id="42"]')!.classList.contains('Mui-selected'))
  assert.deepEqual(sectionHeadings(), ["Why it's here", 'Readiness', 'Repro steps', 'Attachments', 'Comments', 'Links'])
  assert.match(panel()!.textContent!, /Steps for 42/)
  assert.deepEqual(source.loaded, [42, 43])

  await click(toggleFor(host, 42))
  assert.equal(panel(), null, 'the same button closes it')
})

test('clicking a row previews it, and J, K and Esc move through and close the panel', async (t) => {
  const { host } = await renderPage(t, { preview: previewSource() })
  await click(host.querySelector('tr[data-preview-id="43"] td:last-child')!)
  assert.equal(panelTitle(), 'Freeze on open')
  await press('j')
  assert.equal(panelTitle(), 'Typo in dialog')
  await press('k')
  await press('k')
  assert.equal(panelTitle(), 'Crash on save')
  await press('Escape')
  assert.equal(panel(), null)
})

test('clicks on a row link or button, modified clicks and text selection do not preview', async () => {
  const row = document.createElement('div')
  row.innerHTML = '<a href="#x">Title</a><span>Text</span>'
  document.body.append(row)
  const event = (target: Element, init: Partial<MouseEvent> = {}) => ({
    defaultPrevented: false, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target, currentTarget: row, ...init,
  }) as never
  const text = row.querySelector('span')!
  assert.equal(isPreviewRowClick(event(text)), true)
  assert.equal(isPreviewRowClick(event(row.querySelector('a')!)), false)
  assert.equal(isPreviewRowClick(event(text, { ctrlKey: true })), false)
  assert.equal(isPreviewRowClick(event(text, { button: 1 })), false)
  window.getSelection()!.selectAllChildren(text)
  assert.equal(isPreviewRowClick(event(text)), false)
  window.getSelection()!.removeAllRanges()
  row.remove()
})

test('an item that leaves the queue says so, and J moves on to the next', async (t) => {
  const source = previewSource()
  const { host, render } = await renderPage(t, { preview: source })
  await click(toggleFor(host, 42))
  await render({ preview: source, result: { items: items.slice(1), warnings: [] } })

  assert.equal(panelTitle(), 'No longer in triage')
  assert.match(panel()!.textContent!, /Item 42 has left the triage queue\. Press J for the next item\./)
  assert.equal(panel()!.querySelector('a[aria-label="Open in Azure DevOps"]'), null)
  await press('j')
  assert.equal(panelTitle(), 'Freeze on open')
})

test('Inbox cards preview too', async (t) => {
  const { host } = await renderPage(t, { preview: previewSource() })
  await click([...host.querySelectorAll('button')].find((button) => button.textContent === 'Inbox')!)
  assert.equal(host.querySelector('table'), null)

  const card = host.querySelector('[data-preview-id="44"]')!
  await click(card.querySelector('[data-preview-toggle="44"]')!)
  assert.equal(panelTitle(), 'Typo in dialog')
  assert.ok(card.classList.contains('selected'))
  await click(card.querySelector('[data-preview-toggle="44"]')!)
  assert.equal(panel(), null)
})
