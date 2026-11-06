import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement } from 'react'
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

// The page reads its saved pipelines and options from the bare `localStorage` global; start it empty.
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: () => null, setItem: () => {} },
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
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { TestsPage } = await server.ssrLoadModule('/src/features/standup/pages/TestsPage.tsx')

const document = dom.window.document

async function render(t: TestContext) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  const page = createElement(TestsPage, { pat: null, defaultOrg: 'example-org', defaultProject: 'example-project' })
  await act(async () => root.render(createElement(Root, null, page)))
  return host
}

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 3000
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'timed out waiting for the page to update')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)) })
  }
}

const button = (host: Element, label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const dialog = () => document.querySelector('[role="dialog"]')

test('the header offers Test options and the empty state points to it', async (t) => {
  const host = await render(t)

  assert.equal(button(host, 'Test options')?.disabled, false)
  assert.equal(button(host, 'Tests settings'), null)
  assert.match(host.textContent!, /Add a build or release pipeline in Test options to start tracking test pass rates\./)
})

test('the toolbar holds the only page heading and a Refresh that waits for a PAT and pipelines', async (t) => {
  const host = await render(t)

  assert.deepEqual([...host.querySelectorAll('h1')].map((heading) => heading.textContent), ['Tests'])
  assert.doesNotMatch(host.textContent!, /E2E test pass rates/)
  assert.equal(button(host, 'Refresh')?.disabled, true)
  assert.equal(button(host, 'Refresh tests'), null)
  assert.doesNotMatch(host.textContent!, /How to read this chart/, 'the intro waits until there is something to read')
})

test('Test options opens a dialog and tab list with the same name, and Close dismisses it', async (t) => {
  const host = await render(t)
  assert.equal(dialog(), null)

  await act(async () => button(host, 'Test options')!.click())

  const opened = dialog()!
  assert.ok(opened)
  assert.equal(document.getElementById(opened.getAttribute('aria-labelledby')!)?.textContent, 'Test options')
  assert.equal(opened.querySelector('[role="tablist"]')?.getAttribute('aria-label'), 'Test options')
  assert.deepEqual([...opened.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent), ['Options', 'Pipelines'])

  await act(async () => [...opened.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Close')!.click())
  await waitFor(() => dialog() === null)
})
