import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'
import { act, createElement } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const storage = new Map<string, string>()
let storageThrows = false
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => {
      if (storageThrows) throw new Error('storage unavailable')
      return storage.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (storageThrows) throw new Error('quota exceeded')
      storage.set(key, value)
    },
  },
})

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
})
const { createRoot } = await import('react-dom/client')
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(async () => {
  await server.close()
  dom.window.close()
  if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})
const {
  REMEMBER_LAST_VIEW_STORAGE_KEY,
  LAST_PAGE_STORAGE_KEY,
  loadLastPage,
  saveLastPage,
  lastViewStorageKey,
  loadLastView,
  loadRememberLastView,
  saveLastView,
  saveRememberLastView,
} = await server.ssrLoadModule('/src/features/standup/utils/lastViews.ts')
const { useRememberedView } = await server.ssrLoadModule('/src/features/standup/hooks/useRememberedView.ts')
const { useActiveAppView } = await server.ssrLoadModule('/src/features/standup/hooks/useAppNavigation.ts')

const DEVELOPMENT_VIEWS = ['people', 'sprint'] as const
const QA_VIEWS = ['testers', 'flow'] as const
const BACKLOG_VIEWS = ['list', 'map'] as const
const TESTS_VIEWS = ['rows', 'overlay'] as const

beforeEach(() => {
  storage.clear()
  storageThrows = false
  dom.window.history.replaceState(null, '', '/')
})

test('remember last view is off until it is turned on, and the choice persists', () => {
  assert.equal(loadRememberLastView(), false)
  saveRememberLastView(true)
  assert.equal(storage.get(REMEMBER_LAST_VIEW_STORAGE_KEY), 'true')
  assert.equal(loadRememberLastView(), true)
  saveRememberLastView(false)
  assert.equal(loadRememberLastView(), false)
})

test('each page saves its own last view, and unknown saved views are ignored', () => {
  assert.equal(loadLastView('development', DEVELOPMENT_VIEWS), null)
  saveLastView('development', 'sprint')
  saveLastView('qa-activity', 'flow')
  saveLastView('backlog', 'map')
  saveLastView('tests', 'overlay')
  assert.equal(new Set(['development', 'qa-activity', 'backlog', 'tests'].map(lastViewStorageKey)).size, 4)
  assert.equal(loadLastView('development', DEVELOPMENT_VIEWS), 'sprint')
  assert.equal(loadLastView('qa-activity', QA_VIEWS), 'flow')
  assert.equal(loadLastView('backlog', BACKLOG_VIEWS), 'map')
  assert.equal(loadLastView('tests', TESTS_VIEWS), 'overlay')

  storage.set(lastViewStorageKey('development'), 'assignment')
  assert.equal(loadLastView('development', DEVELOPMENT_VIEWS), null)
})

test('unavailable storage never breaks loading or saving', () => {
  storageThrows = true
  assert.equal(loadRememberLastView(), false)
  assert.equal(loadLastView('qa-activity', QA_VIEWS), null)
  assert.equal(loadLastPage(), null)
  assert.doesNotThrow(() => saveRememberLastView(true))
  assert.doesNotThrow(() => saveLastView('qa-activity', 'flow'))
  assert.doesNotThrow(() => saveLastPage('tests'))
})

test('last page validates saved routes and round-trips independently of each page view', () => {
  assert.equal(loadLastPage(), null)
  for (const page of ['development', 'qa-activity', 'backlog', 'tests']) {
    saveLastPage(page)
    assert.equal(loadLastPage(), page)
  }
  storage.set(LAST_PAGE_STORAGE_KEY, 'retired-page')
  assert.equal(loadLastPage(), null)
})

async function renderPages(t: { after: (fn: () => unknown) => void }) {
  let pages: string[] = []
  function Harness() {
    pages = [useActiveAppView(), useActiveAppView()]
    return null
  }
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  await act(async () => root.render(createElement(Harness)))
  return {
    get pages() { return pages },
    navigate: async (hash: string) => {
      dom.window.history.replaceState(null, '', `/${hash}`)
      await act(async () => dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')))
    },
  }
}

for (const page of ['development', 'qa-activity', 'backlog', 'tests']) {
  test(`opening without a route restores ${page} for both navigation readers when enabled`, async (t) => {
    saveRememberLastView(true)
    saveLastPage(page)
    const navigation = await renderPages(t)
    assert.deepEqual(navigation.pages, [page, page])
    assert.equal(dom.window.location.hash, `#${page}`)
    assert.equal(loadLastPage(), page)
  })

  test(`explicit #${page} takes precedence over the saved page`, async (t) => {
    saveRememberLastView(true)
    saveLastPage(page === 'tests' ? 'backlog' : 'tests')
    dom.window.history.replaceState(null, '', `/#${page}`)
    assert.deepEqual((await renderPages(t)).pages, [page, page])
    assert.equal(loadLastPage(), page)
  })
}

test('disabled page restoration defaults to Development but still remembers later navigation', async (t) => {
  saveLastPage('tests')
  const navigation = await renderPages(t)
  assert.deepEqual(navigation.pages, ['development', 'development'])
  assert.equal(dom.window.location.hash, '')
  await navigation.navigate('#backlog')
  assert.deepEqual(navigation.pages, ['backlog', 'backlog'])
  assert.equal(loadLastPage(), 'backlog')
  saveRememberLastView(true)
  assert.equal(loadLastPage(), 'backlog', 'enabling does not discard the latest page')
})

for (const saved of [null, 'retired-page']) {
  test(`missing or invalid saved page (${saved}) defaults to Development`, async (t) => {
    saveRememberLastView(true)
    if (saved) storage.set(LAST_PAGE_STORAGE_KEY, saved)
    assert.deepEqual((await renderPages(t)).pages, ['development', 'development'])
  })
}

test('an unknown explicit route keeps the existing Development fallback instead of restoring', async (t) => {
  saveRememberLastView(true)
  saveLastPage('tests')
  dom.window.history.replaceState(null, '', '/#unknown')
  assert.deepEqual((await renderPages(t)).pages, ['development', 'development'])
})

test('unavailable storage does not prevent navigation', async (t) => {
  storageThrows = true
  const navigation = await renderPages(t)
  assert.deepEqual(navigation.pages, ['development', 'development'])
  await navigation.navigate('#tests')
  assert.deepEqual(navigation.pages, ['tests', 'tests'])
})

async function renderView(t: { after: (fn: () => unknown) => void }, page: 'development' | 'qa-activity' | 'backlog' | 'tests', views: readonly [string, ...string[]], remember: boolean) {
  let state: readonly [string, (next: string) => void]
  function Harness() {
    state = useRememberedView(page, views, remember)
    return null
  }
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  await act(async () => root.render(createElement(Harness)))
  return {
    get view() { return state![0] },
    setView: (next: string) => act(async () => state![1](next)),
  }
}

test('pages open on their first view when remember last view is off', async (t) => {
  storage.set(lastViewStorageKey('development'), 'sprint')
  storage.set(lastViewStorageKey('qa-activity'), 'flow')
  storage.set(lastViewStorageKey('backlog'), 'map')
  storage.set(lastViewStorageKey('tests'), 'overlay')
  assert.equal((await renderView(t, 'development', DEVELOPMENT_VIEWS, false)).view, 'people')
  assert.equal((await renderView(t, 'qa-activity', QA_VIEWS, false)).view, 'testers')
  assert.equal((await renderView(t, 'backlog', BACKLOG_VIEWS, false)).view, 'list')
  assert.equal((await renderView(t, 'tests', TESTS_VIEWS, false)).view, 'rows')
})

test('pages reopen on their saved view when remember last view is on', async (t) => {
  storage.set(lastViewStorageKey('development'), 'sprint')
  storage.set(lastViewStorageKey('qa-activity'), 'flow')
  storage.set(lastViewStorageKey('backlog'), 'map')
  storage.set(lastViewStorageKey('tests'), 'overlay')
  assert.equal((await renderView(t, 'development', DEVELOPMENT_VIEWS, true)).view, 'sprint')
  assert.equal((await renderView(t, 'qa-activity', QA_VIEWS, true)).view, 'flow')
  assert.equal((await renderView(t, 'backlog', BACKLOG_VIEWS, true)).view, 'map')
  assert.equal((await renderView(t, 'tests', TESTS_VIEWS, true)).view, 'overlay')

  storage.set(lastViewStorageKey('qa-activity'), 'retired-view')
  assert.equal((await renderView(t, 'qa-activity', QA_VIEWS, true)).view, 'testers')
})

test('view changes are saved even while the setting is off, so turning it on reopens the latest view', async (t) => {
  const qa = await renderView(t, 'qa-activity', QA_VIEWS, false)
  await qa.setView('flow')
  assert.equal(qa.view, 'flow')
  assert.equal(storage.get(lastViewStorageKey('qa-activity')), 'flow')
  assert.equal(storage.get(lastViewStorageKey('development')), undefined)

  assert.equal((await renderView(t, 'qa-activity', QA_VIEWS, true)).view, 'flow')
})
