import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { AutoRefreshOptions } from '../src/features/standup/utils/autoRefresh.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: dom.window.localStorage })
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(async () => {
  await server.close()
  dom.window.close()
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})
const { useAutoRefresh } = await server.ssrLoadModule('/src/features/standup/hooks/useAutoRefresh.ts')
const { AUTO_REFRESH_STORAGE_KEY, DEFAULT_AUTO_REFRESH, loadAutoRefresh, saveAutoRefresh, isValidRefreshMinutes } =
  await server.ssrLoadModule('/src/features/standup/utils/autoRefresh.ts')

const MINUTE = 60_000
const START = Date.UTC(2026, 10, 9, 12)

type Props = {
  options: AutoRefreshOptions
  active: boolean
  scope: string
  syncedAt: number | null
  isLoading: boolean
}

async function setup(t: TestContext, overrides: Partial<Props> = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: START })
  const calls: string[] = []
  let props: Props = {
    options: { enabled: true, minutes: 15 }, active: true, scope: 'development:a',
    syncedAt: START, isLoading: false, ...overrides,
  }
  function Page() {
    useAutoRefresh({ ...props, onRefresh: () => { calls.push(props.scope) } })
    return null
  }
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  const update = async (next: Partial<Props> = {}) => {
    props = { ...props, ...next }
    await act(async () => root.render(createElement(Page)))
    await act(async () => t.mock.timers.tick(0))
  }
  await update()
  return {
    calls, update,
    tick: async (ms: number) => { await act(async () => t.mock.timers.tick(ms)) },
  }
}

test('auto-refresh defaults to disabled and 15 minutes; local storage round-trips both fields', () => {
  localStorage.clear()
  assert.deepEqual(loadAutoRefresh(), { enabled: false, minutes: 15 })
  saveAutoRefresh({ enabled: true, minutes: 7 })
  assert.deepEqual(loadAutoRefresh(), { enabled: true, minutes: 7 })
  saveAutoRefresh({ enabled: false, minutes: 7 })
  assert.deepEqual(loadAutoRefresh(), { enabled: false, minutes: 7 })
  localStorage.clear()
  assert.deepEqual(DEFAULT_AUTO_REFRESH, { enabled: false, minutes: 15 })
})

test('only positive safe integer intervals are accepted; invalid storage and writes are reported', () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(isValidRefreshMinutes(value), false)
    assert.throws(() => saveAutoRefresh({ enabled: true, minutes: value }), /whole number/)
  }
  for (const value of ['bad json', '{}', '{"enabled":true,"minutes":0}', '{"enabled":"true","minutes":15}']) {
    localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, value)
    assert.throws(loadAutoRefresh)
  }
  localStorage.clear()
})

test('disabled never refreshes; enabling already stale data refreshes immediately', async (t) => {
  const page = await setup(t, { options: { ...DEFAULT_AUTO_REFRESH } })
  await page.tick(20 * MINUTE)
  assert.deepEqual(page.calls, [])
  await page.update({ options: { enabled: true, minutes: 15 } })
  assert.deepEqual(page.calls, ['development:a'])
})

test('the exact threshold triggers a refresh and successful/manual loads reset the clock', async (t) => {
  const page = await setup(t)
  await page.tick(15 * MINUTE - 1)
  assert.equal(page.calls.length, 0)
  await page.tick(1)
  assert.equal(page.calls.length, 1)
  await page.update({ isLoading: true })
  await page.tick(MINUTE)
  await page.update({ isLoading: false, syncedAt: Date.now() })
  await page.tick(10 * MINUTE)
  await page.update({ syncedAt: Date.now() })
  await page.tick(15 * MINUTE - 1)
  assert.equal(page.calls.length, 1)
  await page.tick(1)
  assert.equal(page.calls.length, 2)
})

test('inactive pages never refresh; opening a stale page refreshes it, not another page', async (t) => {
  const page = await setup(t, { active: false, scope: 'tests' })
  await page.tick(20 * MINUTE)
  assert.deepEqual(page.calls, [])
  await page.update({ active: true })
  assert.deepEqual(page.calls, ['tests'])
  await page.update({ scope: 'backlog:a', syncedAt: START + 10 * MINUTE })
  assert.deepEqual(page.calls, ['tests'])
  await page.tick(5 * MINUTE)
  assert.deepEqual(page.calls, ['tests', 'backlog:a'])
  await page.update({ scope: 'backlog:b', syncedAt: START })
  assert.deepEqual(page.calls, ['tests', 'backlog:a', 'backlog:b'])
})

test('loading and initial loads do not overlap an automatic refresh', async (t) => {
  const page = await setup(t, { syncedAt: null })
  await page.tick(30 * MINUTE)
  assert.deepEqual(page.calls, [])
  await page.update({ syncedAt: START, isLoading: true })
  await page.tick(30 * MINUTE)
  assert.deepEqual(page.calls, [])
  await page.update({ syncedAt: Date.now(), isLoading: false })
  await page.tick(15 * MINUTE)
  assert.equal(page.calls.length, 1)
})

test('a failed refresh waits an interval rather than repeatedly retrying stale data', async (t) => {
  const page = await setup(t, { syncedAt: START - 20 * MINUTE })
  assert.equal(page.calls.length, 1)
  await page.update({ isLoading: true })
  await page.update({ isLoading: false })
  await act(async () => window.dispatchEvent(new dom.window.Event('focus')))
  assert.equal(page.calls.length, 1)
  await page.tick(15 * MINUTE)
  assert.equal(page.calls.length, 2)
})

test('changing the interval and disabling apply immediately; waking the browser checks elapsed time', async (t) => {
  const page = await setup(t)
  await page.tick(5 * MINUTE)
  await page.update({ options: { enabled: true, minutes: 5 } })
  assert.equal(page.calls.length, 1)
  await page.update({ options: { enabled: false, minutes: 5 } })
  await page.tick(30 * MINUTE)
  assert.equal(page.calls.length, 1)
  await page.update({ options: { enabled: true, minutes: 15 }, syncedAt: Date.now() })
  t.mock.timers.setTime(Date.now() + 16 * MINUTE)
  await act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')))
  assert.equal(page.calls.length, 2)
})

test('long intervals do not overflow the browser timer into an immediate refresh', async (t) => {
  const page = await setup(t, { options: { enabled: true, minutes: 100_000 } })
  await page.tick(MINUTE)
  assert.equal(page.calls.length, 0)
})
