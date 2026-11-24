import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
let storageFailureKey: string | null = null
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (key === storageFailureKey) throw new Error('Browser storage quota exceeded.')
      storage.set(key, value)
    },
    removeItem: (key: string) => storage.delete(key),
  },
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
const chartLinePath = new dom.window.DOMParser()
  .parseFromString(readFileSync(new URL(import.meta.resolve('@stratakit/icons/chart-line.svg')), 'utf8'), 'image/svg+xml')
  .querySelector('symbol[id="icon-large"] path')!.getAttribute('d')

async function render(t: TestContext, props: { pat?: string | null; rememberLastView?: boolean } = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
    storage.clear()
    storageFailureKey = null
  })
  const setActive = async (isActive: boolean) => {
    const page = createElement(TestsPage, { pat: null, defaultOrg: 'example-org', defaultProject: 'example-project', ...props, isActive })
    await act(async () => root.render(createElement(Root, null, page)))
  }
  await setActive(true)
  return Object.assign(host, { setActive })
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
const optionsButton = (label: string) => [...dialog()!.querySelectorAll('button')].find((candidate) => candidate.textContent === label)!
const settingsInput = (label: string) => {
  const fieldLabel = [...dialog()!.querySelectorAll('label')].find((candidate) => candidate.textContent === label)!
  return document.getElementById(fieldLabel.htmlFor) as HTMLInputElement
}
const setNativeValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
async function typeSetting(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.focus()
    setNativeValue.call(input, value)
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
}

test('the header offers Test options and the empty state points to it', async (t) => {
  const host = await render(t)

  assert.equal(button(host, 'Test options')?.disabled, false)
  assert.equal(button(host, 'Tests settings'), null)
  assert.match(host.textContent!, /Add a build or release pipeline in Test options to start tracking test pass rates\./)
})

test('the toolbar holds the only page heading and a Refresh that waits for a PAT and pipelines', async (t) => {
  const host = await render(t)

  assert.deepEqual([...host.querySelectorAll('h1')].map((heading) => heading.textContent), ['Tests'])
  const iconHref = () => host.querySelector('h1')?.parentElement?.querySelector('svg use')?.getAttribute('href')
  await waitFor(() => {
    const href = iconHref()
    return !!href && !!document.getElementById(href.slice(1))?.querySelector('path')
  })
  assert.ok(chartLinePath)
  assert.equal(document.getElementById(iconHref()!.slice(1))?.querySelector('path')?.getAttribute('d'), chartLinePath)
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
  storage.set('standup:last-view:tests', 'overlay')
  storage.set('standup:test-daily-options', '{obsolete invalid options')
  const host = await render(t, { pat: 'token', rememberLastView: true })

  const toggles = [...host.querySelector('[aria-label="Tests view"]')!.querySelectorAll('button')]
  assert.deepEqual(toggles.map((toggle) => toggle.textContent), ['Rows', 'Calendar'])
  assert.deepEqual(toggles.map((toggle) => toggle.getAttribute('aria-pressed')), ['true', 'false'])
  assert.equal(storage.get('standup:last-view:tests'), 'rows', 'the retired Overlay preference falls back to Rows')
  assert.doesNotMatch(host.textContent!, /daily options are invalid/)
  assert.ok(host.querySelector('[data-testid="tests-loading-rows"]'))
  assert.match(host.textContent!, /One row per pipeline · the shaded band is its usual range · last 60 days/)

  await act(async () => toggles[1].click())
  assert.equal(toggles[1].getAttribute('aria-pressed'), 'true')
  assert.ok(host.querySelector('[data-testid="tests-loading-calendar"]'))
  assert.equal(host.querySelector('[data-testid="tests-loading-rows"]'), null)
  assert.equal(host.querySelectorAll('[data-testid="tests-loading-calendar-cell"]').length, 9 * 5, 'about 60 days of weekday cells for the one pipeline')
  assert.match(host.textContent!, /One cell per day, colored by its worst run · last 60 days/)
  assert.equal(storage.get('standup:last-view:tests'), 'calendar')
  await act(async () => toggles[0].click())
  assert.ok(host.querySelector('[data-testid="tests-loading-rows"]'))
  assert.equal(host.querySelector('[data-testid="tests-loading-calendar"]'), null)
  assert.equal(storage.get('standup:last-view:tests'), 'rows')
})

test('Test options opens a dialog and tab list with the same name, and Cancel dismisses it', async (t) => {
  const host = await render(t)
  assert.equal(dialog(), null)

  await act(async () => button(host, 'Test options')!.click())

  const opened = dialog()!
  assert.ok(opened)
  assert.equal(document.getElementById(opened.getAttribute('aria-labelledby')!)?.textContent, 'Test options')
  assert.equal(opened.querySelector('[role="tablist"]')?.getAttribute('aria-label'), 'Test options')
  assert.deepEqual([...opened.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent), ['Options', 'Pipelines'])
  assert.doesNotMatch(opened.textContent!, /Daily result|Show at most one result|Overlay/)

  await act(async () => optionsButton('Cancel').click())
  await waitFor(() => dialog() === null)
})

test('Test options sets when a pipeline counts as having no recent runs or fewer tests', async (t) => {
  const host = await render(t)
  await act(async () => button(host, 'Test options')!.click())
  const labels = [...dialog()!.querySelectorAll('label')].map((label) => label.textContent)
  assert.ok(labels.includes('Flag no recent runs after (working days)'))
  assert.ok(labels.includes('Flag fewer tests below (% of usual)'))
  assert.equal(dialog()!.querySelector('h3')?.textContent, 'Pipeline health')
  await act(async () => optionsButton('Cancel').click())
  await waitFor(() => dialog() === null)
})

for (const dismiss of ['Cancel', 'Escape', 'backdrop']) {
  test(`Test options discard numeric and pipeline edits on ${dismiss}, then reset on reopening`, async (t) => {
    const pipeline = { id: 'web', orgName: 'org', projectName: 'Example', kind: 'build', definitionId: 7, name: 'Web', stageName: 'E2E' }
    storage.set('standup:test-pipelines', JSON.stringify([pipeline]))
    const host = await render(t)
    const before = [...storage]
    await act(async () => button(host, 'Test options')!.click())
    await typeSetting(settingsInput('Lookback (days)'), '14')
    await typeSetting(settingsInput('Flag no recent runs after (working days)'), '5')
    // Leaving a field and switching tabs used to save immediately.
    await act(async () => dialog()!.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click())
    await typeSetting(dialog()!.querySelector<HTMLInputElement>('[aria-label="Short name for Web · E2E"]')!, 'PWW')
    await act(async () => optionsButton('Remove').click())
    assert.deepEqual([...storage], before)
    if (dismiss === 'Cancel') {
      await act(async () => optionsButton('Cancel').click())
    } else if (dismiss === 'Escape') {
      await act(async () => dialog()!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    } else {
      await act(async () => document.querySelector<HTMLElement>('.MuiBackdrop-root')!.click())
    }
    await waitFor(() => dialog() === null)
    assert.deepEqual([...storage], before)
    await act(async () => button(host, 'Test options')!.click())
    assert.equal(settingsInput('Lookback (days)').value, '60')
    assert.equal(settingsInput('Flag no recent runs after (working days)').value, '2')
    await act(async () => dialog()!.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click())
    assert.match(dialog()!.textContent!, /Web · E2E/)
    assert.equal(dialog()!.querySelector<HTMLInputElement>('[aria-label="Short name for Web · E2E"]')!.value, '')
  })
}

test('Test options validate every field before saving numeric and pipeline changes together', async (t) => {
  storage.set('standup:test-pipelines', JSON.stringify([
    { id: 'web', orgName: 'org', projectName: 'Example', kind: 'build', definitionId: 7, name: 'Web', stageName: 'E2E' },
  ]))
  const host = await render(t)
  const before = [...storage]
  await act(async () => button(host, 'Test options')!.click())
  await typeSetting(settingsInput('Lookback (days)'), '14')
  await typeSetting(settingsInput('Flag no recent runs after (working days)'), '0')
  await typeSetting(settingsInput('Flag fewer tests below (% of usual)'), '65')
  await act(async () => dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
  await typeSetting(settingsInput('Pass rate threshold (%)'), '98.5')
  await act(async () => dialog()!.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click())
  await act(async () => optionsButton('Remove').click())
  await act(async () => optionsButton('Save').click())
  assert.ok(dialog(), 'invalid settings keep the dialog open')
  assert.match(dialog()!.textContent!, /whole number of working days from 1 to 30/)
  assert.ok(document.activeElement === settingsInput('Flag no recent runs after (working days)'))
  assert.deepEqual([...storage], before, 'no valid setting is committed while another is invalid')
  await typeSetting(settingsInput('Flag no recent runs after (working days)'), '5')
  await act(async () => optionsButton('Save').click())
  await waitFor(() => dialog() === null)
  assert.equal(storage.get('standup:test-pipelines'), '[]')
  assert.equal(storage.get('standup:test-lookback-days'), '14')
  assert.deepEqual(JSON.parse(storage.get('standup:test-health-options')!), { staleDays: 5, fewerPercent: 65 })
  assert.deepEqual(JSON.parse(storage.get('standup:test-pass-rate-filter')!), { enabled: true, threshold: 98.5 })
})

test('editing or discarding Test options does not reload results; saving a lookback change reloads once', async (t) => {
  storage.set('standup:test-pipelines', JSON.stringify([
    { id: 'web', orgName: 'org', projectName: 'Example', kind: 'build', definitionId: 7, name: 'Web', stageName: 'E2E' },
  ]))
  let resultQueries = 0
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async (input: URL, init?: RequestInit) => {
    const url = new URL(input)
    if (url.protocol !== 'https:') return previousFetch(input, init)
    if (url.pathname.endsWith('/_apis/build/builds')) resultQueries += 1
    return new Response(JSON.stringify({ value: [] }), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  t.after(() => { globalThis.fetch = previousFetch })
  const host = await render(t, { pat: 'token' })
  await waitFor(() => resultQueries === 1 && !host.textContent?.includes('Syncing'))
  await act(async () => button(host, 'Test options')!.click())
  await typeSetting(settingsInput('Lookback (days)'), '14')
  await act(async () => dialog()!.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click())
  await typeSetting(dialog()!.querySelector<HTMLInputElement>('[aria-label="Short name for Web · E2E"]')!, 'PWW')
  assert.equal(resultQueries, 1)
  await act(async () => optionsButton('Cancel').click())
  await waitFor(() => dialog() === null)
  assert.equal(resultQueries, 1)
  await act(async () => button(host, 'Test options')!.click())
  await typeSetting(settingsInput('Lookback (days)'), '14')
  await act(async () => optionsButton('Save').click())
  await waitFor(() => dialog() === null && resultQueries === 2)
  assert.equal(resultQueries, 2)
})

test('a later Test options storage failure rolls back earlier writes and leaves the view unchanged', async (t) => {
  storage.set('standup:test-lookback-days', '60')
  const host = await render(t)
  const before = [...storage]
  await act(async () => button(host, 'Test options')!.click())
  await typeSetting(settingsInput('Lookback (days)'), '14')
  await typeSetting(settingsInput('Flag no recent runs after (working days)'), '5')
  storageFailureKey = 'standup:test-health-options'
  await act(async () => optionsButton('Save').click())
  assert.ok(dialog(), 'failed Save keeps the draft open')
  assert.match(dialog()!.textContent!, /Browser storage quota exceeded/)
  assert.deepEqual([...storage], before, 'the successful lookback write is restored')
  assert.equal(settingsInput('Lookback (days)').value, '14', 'the draft remains available to correct or retry')
  await act(async () => optionsButton('Cancel').click())
  await waitFor(() => dialog() === null)
  await act(async () => button(host, 'Test options')!.click())
  assert.equal(settingsInput('Lookback (days)').value, '60', 'runtime options were not partly applied')
  assert.equal(settingsInput('Flag no recent runs after (working days)').value, '2')
  assert.deepEqual([...storage], before)
  storageFailureKey = null
  await typeSetting(settingsInput('Lookback (days)'), '14')
  await typeSetting(settingsInput('Flag no recent runs after (working days)'), '5')
  await act(async () => optionsButton('Save').click())
  await waitFor(() => dialog() === null)
  assert.equal(storage.get('standup:test-lookback-days'), '14')
  assert.deepEqual(JSON.parse(storage.get('standup:test-health-options')!), { staleDays: 5, fewerPercent: 80 })
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
  assert.match(details()!.textContent!, /Sharp drop to 70\.0%/)
  assert.equal(details()!.querySelector('a[href*="buildId=15"]')?.getAttribute('target'), '_blank')

  await host.setActive(false)
  await act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })))
  assert.ok(details(), 'Escape on another page leaves the hidden run selection alone')
  assert.equal(focusButton().getAttribute('aria-pressed'), 'true')
  await host.setActive(true)

  await act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })))
  assert.equal(details(), null)
  assert.equal(focusButton().getAttribute('aria-pressed'), 'true', 'the first Esc keeps the focus')
  await act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })))
  assert.equal(focusButton().getAttribute('aria-pressed'), 'false')

  await act(async () => change()!.click())
  await waitFor(() => /Again/.test(details()?.textContent ?? ''))
  assert.equal(failingRequests().length, 2, 'reopening a run reads its failing tests from the cache')
})
