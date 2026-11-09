import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { act, createElement } from 'react'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import type { AppView } from '../src/features/standup/hooks/useAppNavigation.ts'

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
  plugins: [{
    name: 'standup-content-pages',
    enforce: 'pre',
    resolveId: (id) => /\/(TeamAssignmentsPage|QualityAssurancePage|BacklogPage)$/.test(id) ? `\0${id}` : undefined,
    load: (id) => {
      if (!id.startsWith('\0')) return
      const name = id.split('/').at(-1)
      return `export const ${name} = () => '${name}'`
    },
  }],
})
after(async () => {
  await server.close()
  dom.window.close()
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { StandupContent } = await server.ssrLoadModule('/src/features/standup/components/StandupContent.tsx')

test('Tests loads lazily and retains results across navigation and team changes, but Refresh and PAT changes reload', async (t) => {
  storage.set('standup:test-pipelines', JSON.stringify([
    { id: 'web', orgName: 'org', projectName: 'Example', kind: 'build', definitionId: 7, name: 'Web', stageName: 'E2E' },
  ]))
  const requests: { url: URL; signal: AbortSignal | null | undefined }[] = []
  let finishRequest: (() => void) | undefined
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async (input: URL, init?: RequestInit) => {
    const url = new URL(input)
    if (url.protocol !== 'https:') return previousFetch(input, init)
    assert.ok(url.pathname.endsWith('/_apis/build/builds'), `Unexpected request: ${url}`)
    requests.push({ url, signal: init?.signal })
    await new Promise<void>((resolve) => { finishRequest = resolve })
    return new Response(JSON.stringify({ value: [] }), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  const host = dom.window.document.createElement('div')
  dom.window.document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
    storage.clear()
    globalThis.fetch = previousFetch
  })

  const render = async (activeView: AppView, team = 'a', pat: string | null = 'token') => {
    await act(async () => root.render(createElement(Root, null, createElement(StandupContent, {
      activeView,
      teamAssignmentsPageProps: { selectedTeamId: team },
      qualityAssurancePageProps: {},
      backlogPageProps: {},
      testsPageProps: {
        pat, defaultOrg: team, defaultProject: team,
        teamIterations: [{ name: `Sprint ${team}`, path: `Project\\${team}`, timeFrame: 'current', startDate: '2026-11-02', finishDate: '2026-11-13' }],
      },
    }))))
  }
  const refresh = () => host.querySelector<HTMLButtonElement>('button[aria-label="Refresh"]')!
  const complete = async () => {
    assert.ok(finishRequest, 'a request is in flight')
    await act(async () => finishRequest!())
    assert.equal(refresh().disabled, false)
  }

  await render('development')
  assert.equal(requests.length, 0, 'Tests does not fetch before its first visit')
  assert.equal(host.querySelector('h1'), null)

  await render('tests')
  assert.equal(requests.length, 1)
  const heading = host.querySelector('h1')!
  const overlay = host.querySelector<HTMLButtonElement>('button[value="overlay"]')!
  await act(async () => overlay.click())

  await render('backlog')
  assert.ok(heading.closest('[hidden]'), 'inactive Tests is hidden from view and accessibility')
  await render('backlog', 'b')
  assert.equal(requests[0].signal?.aborted, false, 'navigation and team changes do not abort an in-flight load')
  await complete()

  await render('tests', 'b')
  assert.equal(host.querySelector('h1'), heading, 'Tests remains mounted')
  assert.equal(heading.closest('[hidden]'), null)
  assert.equal(requests.length, 1, 'returning with another team reuses the loaded results')
  assert.equal(overlay.getAttribute('aria-pressed'), 'true', 'the selected view is preserved')

  await render('development', 'b')
  await render('tests', 'b')
  assert.equal(requests.length, 1, 'ordinary navigation also reuses results')

  await act(async () => refresh().click())
  assert.equal(requests.length, 2, 'explicit Refresh still reloads')
  await complete()

  await render('backlog', 'b')
  await render('backlog', 'b', 'replacement-token')
  assert.equal(requests.length, 3, 'a changed PAT still reloads')
  await complete()
  await render('tests', 'b', 'replacement-token')
  assert.equal(requests.length, 3)

  await render('backlog', 'b', null)
  await render('tests', 'b', null)
  assert.equal(refresh().disabled, true, 'clearing the PAT disables loading')
  assert.equal(requests.length, 3)
})
