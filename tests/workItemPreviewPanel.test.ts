import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement, createRef, type ReactNode } from 'react'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import type { WorkItemPreview } from '../src/ado/types.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
// The panel width is kept in the bare storage global; the assignee avatars read the saved PAT from it too.
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: dom.window.localStorage })
after(() => {
  if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})
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
const { usePreviewPanelWidth, usePreviewSelection } = await server.ssrLoadModule('/src/features/standup/hooks/usePreviewPanel.ts')
const { PreviewToggleButton, WorkItemPreviewDetails, WorkItemPreviewPanel } = await server.ssrLoadModule('/src/features/standup/components/WorkItemPreviewPanel.tsx')
const { describeEmptyText, formatFileSize, getPreviewTextSections } = await server.ssrLoadModule('/src/features/standup/components/workItemPreviewDisplay.ts')

async function mount(t: TestContext, element: ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  const render = (next: ReactNode) => act(async () => root.render(createElement(Root, null, next)))
  await render(element)
  return { host, render }
}

const press = (key: string, target: EventTarget = document, init: KeyboardEventInit = {}) => act(async () => {
  target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
})

test('text sections lead with what the type needs, and keep required fields even when empty', () => {
  const fields = (sections: Array<{ field: string; required: boolean; html?: string }>) => sections.map((section) => [section.field, section.required, Boolean(section.html)])
  assert.deepEqual(fields(getPreviewTextSections('Bug', { description: '<p>d</p>', systemInfo: '<p>s</p>' }, new Set(['reproSteps']))), [
    ['reproSteps', true, false],
    ['systemInfo', false, true],
    ['description', false, true],
  ])
  assert.deepEqual(fields(getPreviewTextSections('Product Backlog Item', { reproSteps: '<p>r</p>', acceptanceCriteria: '<p>a</p>' })), [
    ['acceptanceCriteria', false, true],
    ['reproSteps', false, true],
  ])
  // With nothing to show, the type's main field still shows as empty.
  assert.deepEqual(fields(getPreviewTextSections('bug', {})), [['reproSteps', false, false]])
  assert.deepEqual(fields(getPreviewTextSections('Task', {})), [['description', false, false]])

  assert.equal(describeEmptyText('Repro steps'), 'Repro steps are empty')
  assert.equal(describeEmptyText('Acceptance criteria'), 'Acceptance criteria are empty')
  assert.equal(describeEmptyText('Description'), 'Description is empty')
  assert.deepEqual([formatFileSize(undefined), formatFileSize(900), formatFileSize(2048), formatFileSize(1.5 * 1024 * 1024)], ['', '900 B', '2 KB', '1.5 MB'])
})

type Selection = { selectedId: number | null; nextId?: number; listed: boolean; toggle: (id: number) => void }

function SelectionHarness({ ids, state }: { ids: number[]; state: { current?: Selection } }) {
  const selection = usePreviewSelection({ ids, getUrl: (id: number) => `https://example.test/${id}` })
  state.current = selection
  return createElement('div', null,
    ...ids.map((id) => createElement('button', { key: id, type: 'button', 'data-preview-toggle': id, onClick: () => selection.toggle(id) }, `Preview ${id}`)),
    selection.selectedId === null ? null : createElement('aside', { ref: selection.panelRef }, createElement('button', { type: 'button', id: 'inside' }, 'Inside')),
    createElement('input', { id: 'field', 'aria-label': 'Field' }))
}

test('J and K move through the list, opening the panel where it was; Esc closes it', async (t) => {
  const state: { current?: Selection } = {}
  const { host, render } = await mount(t, createElement(SelectionHarness, { ids: [1, 2, 3], state }))
  const selected = () => state.current!.selectedId

  await press('j')
  assert.equal(selected(), 1)
  await press('J')
  assert.deepEqual([selected(), state.current!.nextId], [2, 3])
  await press('k')
  await press('k')
  assert.equal(selected(), 1, 'K stops at the first item')

  // Esc hands focus back to the item's preview button.
  host.querySelector<HTMLButtonElement>('#inside')!.focus()
  await press('Escape')
  assert.equal(selected(), null)
  assert.equal(document.activeElement, host.querySelector('[data-preview-toggle="1"]'))

  await press('k')
  assert.equal(selected(), 1, 'reopens on the last previewed item')
  await press('j', host.querySelector('#field')!)
  await press('j', document, { ctrlKey: true })
  await press('J', document, { shiftKey: true })
  assert.equal(selected(), 1, 'typing and modified keys are left alone')

  // The previewed item leaves the list; J goes to the one that took its place.
  await render(createElement(SelectionHarness, { ids: [2, 3], state }))
  assert.deepEqual([selected(), state.current!.listed], [1, false])
  await press('j')
  assert.equal(selected(), 2)
})

test('O opens the previewed item in Azure DevOps', async (t) => {
  const opened = t.mock.method(dom.window, 'open', () => null)
  const state: { current?: Selection } = {}
  await mount(t, createElement(SelectionHarness, { ids: [7], state }))
  await press('o')
  assert.equal(opened.mock.callCount(), 0, 'nothing is open yet')
  await act(async () => state.current!.toggle(7))
  await press('o')
  assert.deepEqual(opened.mock.calls[0].arguments, ['https://example.test/7', '_blank', 'noopener,noreferrer'])
  await act(async () => state.current!.toggle(7))
  assert.equal(state.current!.selectedId, null, 'toggling the previewed item closes it')
})

test('the panel width is kept once resized, within its limits', async (t) => {
  const key = 'standup:preview-panel-width'
  localStorage.clear()
  const state: { current?: [number, (width: number) => void] } = {}
  function WidthHarness() {
    state.current = usePreviewPanelWidth()
    return null
  }
  const first = await mount(t, createElement(WidthHarness))
  assert.equal(state.current![0], 440)
  assert.equal(localStorage.getItem(key), null, 'the default is not saved')
  await act(async () => state.current![1](100))
  assert.deepEqual([state.current![0], localStorage.getItem(key)], [320, '320'])
  await act(async () => state.current![1](5000))
  assert.deepEqual([state.current![0], localStorage.getItem(key)], [1200, '1200'])
  await first.render(null)

  localStorage.setItem(key, '700')
  await mount(t, createElement(WidthHarness))
  assert.equal(state.current![0], 700)
  localStorage.setItem(key, 'wide')
  await mount(t, createElement(WidthHarness))
  assert.equal(state.current![0], 440)
})

const item = { id: 42, title: 'Crash on save', workItemType: 'Bug', workItemUrl: 'https://dev.azure.com/org/Project/_workitems/edit/42' }

test('the panel names the item and resizes from its edge by keyboard', async (t) => {
  const widths: number[] = []
  const onClose = t.mock.fn()
  const panel = (props: Record<string, unknown>) => createElement('div', null, createElement(WorkItemPreviewPanel, {
    panelId: 'test-preview-panel', panelRef: createRef(), width: 500, onResize: (width: number) => widths.push(width), onClose, id: 42, ...props,
  }, createElement('p', null, 'Body')))
  const { host, render } = await mount(t, panel({ item, facts: createElement('span', null, 'Severity 2') }))

  const aside = host.querySelector('aside')!
  assert.equal(aside.id, 'test-preview-panel')
  assert.equal(aside.style.width, '500px')
  assert.equal(document.getElementById(aside.getAttribute('aria-labelledby')!)!.textContent, 'Crash on save')
  assert.equal(host.querySelector<HTMLAnchorElement>('a[aria-label="Open in Azure DevOps"]')!.href, item.workItemUrl)
  assert.match(aside.textContent!, /Severity 2/)

  const grip = aside.querySelector<HTMLElement>('[role="separator"]')!
  assert.deepEqual(['aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-orientation'].map((name) => grip.getAttribute(name)), ['500', '320', '1200', 'vertical'])
  // The list keeps 360px of the 1000px layout.
  Object.defineProperty(aside.parentElement!, 'clientWidth', { configurable: true, value: 1000 })
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'a']) await press(key, grip)
  await act(async () => grip.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true })))
  assert.deepEqual(widths, [532, 468, 320, 640, 440])

  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Close preview"]')!.click())
  assert.equal(onClose.mock.callCount(), 1)

  await render(panel({ missingTitle: 'No longer in triage' }))
  assert.equal(host.querySelector('h2')!.textContent, 'No longer in triage')
  assert.equal(host.querySelector('a[aria-label="Open in Azure DevOps"]'), null)
})

const preview: WorkItemPreview = {
  id: 42,
  text: { description: '<p>Seen after saving.</p>' },
  attachments: [{ name: 'crash.png', url: 'https://dev.azure.com/org/_apis/wit/attachments/a?fileName=crash.png', size: 2048 }],
  comments: [],
  commentCount: 6,
  commentsError: 'Azure DevOps query failed (HTTP 500). Try refreshing.',
  links: [{ label: 'Parent', id: 5, workItemUrl: 'https://dev.azure.com/org/Project/_workitems/edit/5' }],
  hyperlinks: [],
  developmentLinks: 2,
  linkTitlesError: 'Azure DevOps query failed (HTTP 503). Try refreshing.',
}
const sectionsOf = (host: Element) => Object.fromEntries([...host.querySelectorAll('section')].map((section) => [
  section.querySelector('h3')!.textContent,
  section,
]))

test('details flag empty required text, and say which parts could not load', async (t) => {
  const load = { preview, loading: false, retry: () => {} }
  const { host } = await mount(t, createElement(WorkItemPreviewDetails, { item, load, required: new Set(['reproSteps']) }))
  const sections = sectionsOf(host)
  assert.deepEqual(Object.keys(sections), ['Repro steps', 'Description', 'Attachments· 1', 'Comments· 6', 'Links· 1'])

  assert.equal(sections['Repro steps'].querySelector('.missing')!.textContent, 'Repro steps are empty')
  assert.match(sections['Description'].textContent!, /Seen after saving\./)
  assert.match(sections['Attachments· 1'].textContent!, /crash\.png2 KB \(opens in a new tab\)/)

  const comments = sections['Comments· 6']
  assert.match(comments.textContent!, /Comments could not be loaded\. Azure DevOps query failed \(HTTP 500\)\. Try refreshing\./)
  assert.doesNotMatch(comments.textContent!, /No comments yet/)
  assert.equal(comments.querySelector('a')!.getAttribute('href'), item.workItemUrl)

  const links = sections['Links· 1']
  assert.match(links.textContent!, /Linked items could not be named\. Azure DevOps query failed \(HTTP 503\)/)
  assert.match(links.textContent!, /Parent5Work item/)
  assert.match(links.textContent!, /2 development links \(pull requests, commits and builds\) in Azure DevOps/)
})

test('details show a placeholder while loading, and a retry when they fail', async (t) => {
  const retry = t.mock.fn()
  const { host, render } = await mount(t, createElement(WorkItemPreviewDetails, { item, load: { loading: true, retry } }))
  assert.equal(host.querySelector('[role="status"]')!.textContent, 'Loading details')
  assert.equal(host.querySelectorAll('section').length, 0)

  await render(createElement(WorkItemPreviewDetails, { item, load: { loading: false, error: 'The work item could not be loaded.', retry } }))
  assert.match(host.textContent!, /The work item could not be loaded\./)
  await act(async () => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Retry')!.click())
  assert.equal(retry.mock.callCount(), 1)
})

test('the preview button says whether its item is previewed', async (t) => {
  const toggled: number[] = []
  const rowClicks = t.mock.fn()
  const button = (selected: boolean) => createElement('div', { onClick: rowClicks },
    createElement(PreviewToggleButton, { id: 42, selected, panelId: 'test-preview-panel', onToggle: (id: number) => toggled.push(id) }))
  const { host, render } = await mount(t, button(false))
  const toggle = () => host.querySelector<HTMLButtonElement>('[data-preview-toggle="42"]')!

  assert.deepEqual([toggle().getAttribute('aria-label'), toggle().getAttribute('aria-pressed'), toggle().getAttribute('aria-controls')], ['Preview 42', 'false', null])
  await act(async () => toggle().click())
  assert.deepEqual(toggled, [42])
  assert.equal(rowClicks.mock.callCount(), 0, 'the row does not also handle the click')

  await render(button(true))
  assert.deepEqual([toggle().getAttribute('aria-pressed'), toggle().getAttribute('aria-controls')], ['true', 'test-preview-panel'])
})
