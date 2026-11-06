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
const storage = new Map<string, string>()
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
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

async function render(t: TestContext, props: { pat?: string | null } = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
    storage.clear()
  })
  const page = createElement(TestsPage, { pat: null, defaultOrg: 'example-org', defaultProject: 'example-project', ...props })
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
  assert.equal(host.querySelector('[aria-label="Tests view"]'), null, 'there is nothing to view yet')
})

test('with pipelines to load, Rows is the first view; each view has its own skeleton and the choice is saved', async (t) => {
  storage.set('standup:test-pipelines', JSON.stringify([
    { id: 'web', orgName: 'org', projectName: 'Example', kind: 'build', definitionId: 7, name: 'ProjectWise Web (PWW)', stageName: 'E2E' },
  ]))
  // Results never arrive, so the page stays on its loading state.
  const previousFetch = globalThis.fetch
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  })) as typeof fetch
  t.after(() => {
    globalThis.fetch = previousFetch
  })
  const host = await render(t, { pat: 'token' })

  const toggles = [...host.querySelector('[aria-label="Tests view"]')!.querySelectorAll('button')]
  assert.deepEqual(toggles.map((toggle) => toggle.textContent), ['Rows', 'Overlay', 'Calendar'])
  assert.deepEqual(toggles.map((toggle) => toggle.getAttribute('aria-pressed')), ['true', 'false', 'false'])
  assert.ok(host.querySelector('[data-testid="tests-loading-rows"]'))
  assert.equal(host.querySelector('[data-testid="tests-loading-overlay"]'), null)
  assert.match(host.textContent!, /One row per pipeline · the shaded band is its usual range · last 60 days/)

  await act(async () => toggles[1].click())
  assert.equal(toggles[1].getAttribute('aria-pressed'), 'true')
  assert.ok(host.querySelector('[data-testid="tests-loading-overlay"]'))
  assert.equal(host.querySelector('[data-testid="tests-loading-rows"]'), null)
  assert.match(host.textContent!, /Share of executed tests that passed in each run/)
  assert.equal(storage.get('standup:last-view:tests'), 'overlay')

  await act(async () => toggles[2].click())
  assert.ok(host.querySelector('[data-testid="tests-loading-calendar"]'))
  assert.equal(host.querySelector('[data-testid="tests-loading-overlay"]'), null)
  assert.equal(host.querySelectorAll('[data-testid="tests-loading-calendar-cell"]').length, 9 * 5, 'about 60 days of weekday cells for the one pipeline')
  assert.match(host.textContent!, /One cell per day, colored by its worst run · last 60 days/)
  assert.equal(storage.get('standup:last-view:tests'), 'calendar')
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

test('Test options sets when a pipeline counts as having no recent runs or fewer tests', async (t) => {
  const host = await render(t)
  await act(async () => button(host, 'Test options')!.click())
  const labels = [...dialog()!.querySelectorAll('label')].map((label) => label.textContent)
  assert.ok(labels.includes('Flag no recent runs after (working days)'))
  assert.ok(labels.includes('Flag fewer tests below (% of usual)'))
  assert.equal(dialog()!.querySelector('h3')?.textContent, 'Pipeline health')
  await act(async () => [...dialog()!.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Close')!.click())
  await waitFor(() => dialog() === null)
})

test('failing tests load only when a change is opened, labelled against the previous run; Esc closes the run, then the focus', async (t) => {
  storage.set('standup:test-pipelines', JSON.stringify([
    { id: 'web', orgName: 'org', projectName: 'Example', kind: 'build', definitionId: 7, name: 'ProjectWise Web (PWW)', stageName: 'E2E' },
  ]))
  // Fifteen daily builds ending an hour ago; the latest is a sharp drop.
  const builds = Array.from({ length: 15 }, (_, index) => ({
    id: index + 1, status: 'completed', finishTime: new Date(Date.now() - (14 - index) * 86_400_000 - 3_600_000).toISOString(),
  }))
  const failedBy = (id: number) => id === 15 ? 300 : id === 14 ? 8 : 6 + (id % 3)
  const failing: Record<string, unknown[]> = {
    15: [{ automatedTestName: 'Suite.opens a folder', outcome: 'Failed' }, { automatedTestName: 'Suite.uploads a file', outcome: 'Failed' }],
    14: [{ automatedTestName: 'Suite.opens a folder', outcome: 'Failed' }],
  }
  const requested: URL[] = []
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async (input: URL, init?: RequestInit) => {
    const url = new URL(input)
    if (url.protocol !== 'https:') return previousFetch(input, init)
    requested.push(url)
    if (url.pathname.endsWith('/_apis/build/builds')) return json({ value: [...builds].reverse() })
    const pipelineId = Number(url.searchParams.get('pipelineId'))
    if (url.pathname.endsWith('/_apis/testresults/metrics')) {
      const failed = failedBy(pipelineId)
      return json({ resultSummary: { resultSummaryByRunState: { Completed: { aggregatedResultDetailsByOutcome: {
        Passed: { count: 1000 - failed, outcome: 'Passed' }, Failed: { count: failed, outcome: 'Failed' },
      } } } } })
    }
    if (url.pathname.endsWith('/_apis/testresults/resultsbypipeline')) return json(failing[pipelineId] ?? [])
    throw new Error(`Unexpected request: ${url}`)
  }) as typeof fetch
  t.after(() => {
    globalThis.fetch = previousFetch
  })
  const host = await render(t, { pat: 'token' })
  const failingRequests = () => requested.filter((url) => url.pathname.endsWith('/resultsbypipeline'))
  const change = () => host.querySelector<HTMLButtonElement>('aside[aria-label="Changes"] button[data-change="web:drop:15"]')
  const details = () => host.querySelector('[data-testid="tests-run-details"]')
  const focusButton = () => host.querySelector<HTMLButtonElement>('button[data-pipeline="web"]')!
  await waitFor(() => change() !== null)
  assert.equal(failingRequests().length, 0, 'visiting the page reads no failing tests')
  assert.equal(details(), null)

  await act(async () => focusButton().click())
  assert.equal(focusButton().getAttribute('aria-pressed'), 'true')
  await act(async () => change()!.click())
  assert.equal(change()!.getAttribute('aria-pressed'), 'true')
  await waitFor(() => /Again/.test(details()?.textContent ?? ''))
  assert.deepEqual(failingRequests().map((url) => url.searchParams.get('pipelineId')).sort(), ['14', '15'])
  const rows = [...details()!.querySelectorAll('[data-testid="tests-failing"] li')].map((item) => item.textContent)
  assert.deepEqual(rows, ['Suite.uploads a fileNew', 'Suite.opens a folderAgain'], 'tests new since the previous run come first')
  assert.match(details()!.textContent!, /Sharp drop to 70%/)
  assert.equal(details()!.querySelector('a[href*="buildId=15"]')?.getAttribute('target'), '_blank')

  await act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })))
  assert.equal(details(), null)
  assert.equal(focusButton().getAttribute('aria-pressed'), 'true', 'the first Esc keeps the focus')
  await act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })))
  assert.equal(focusButton().getAttribute('aria-pressed'), 'false')

  await act(async () => change()!.click())
  await waitFor(() => /Again/.test(details()?.textContent ?? ''))
  assert.equal(failingRequests().length, 2, 'reopening a run reads its failing tests from the cache')
})
