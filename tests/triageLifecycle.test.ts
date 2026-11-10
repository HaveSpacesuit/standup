import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { act, createElement } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { TriageResult } from '../src/ado/types.ts'
import type { TriageOptions } from '../src/features/standup/utils/triageOptions.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: dom.window.localStorage })
const { createRoot } = await import('react-dom/client')
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(async () => { await server.close(); dom.window.close() })
const { useTriageItems } = await server.ssrLoadModule('/src/features/standup/hooks/useTriageItems.ts')
const { useBoardViewModel } = await server.ssrLoadModule('/src/features/standup/hooks/useBoardViewModel.ts')
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')
const { createDefaultAssignmentOptions } = await server.ssrLoadModule('/src/features/standup/utils/standupOptionDefaults.ts')
const team = {
  id: 'a', orgName: 'org', projectName: 'Project', displayName: 'Team A',
  areaPath: 'Project\\A', iterationPath: 'Project', teamName: 'A', repoName: 'repo',
}
const defaults: TriageOptions = { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [] }
const teamProfiles = [team]
const assignmentOptionsByTeam = { a: createDefaultAssignmentOptions() }
function result(id: number): TriageResult {
  return { items: [{ id, title: `Item ${id}`, workItemType: 'Bug', state: 'New', tags: ['Triage'], reasons: ['Tag: Triage'], workItemUrl: '' }], warnings: [] }
}

test('hook suppresses stale team, settings and PAT results without canceling shared reads; skips inactive and empty rules', async (t) => {
  const pending: Array<{ resolve: (value: TriageResult) => void; reject: (reason: Error) => void }> = []
  const engine = { getTriageItems: () => new Promise<TriageResult>((resolve, reject) => pending.push({ resolve, reject })) }
  let args = { adoQueryEngine: engine, selectedTeam: team, options: defaults, enabled: false, reloadNonce: 0 }
  let state: ReturnType<typeof useTriageItems>
  function Hook() { state = useTriageItems(args); return null }
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  const render = () => act(async () => root.render(createElement(Hook)))
  await render()
  assert.equal(pending.length, 0)
  args = { ...args, enabled: true, options: { ...defaults, tags: [] } }
  await render()
  assert.equal(pending.length, 0)
  args = { ...args, options: defaults }
  await render()
  assert.equal(state!.triageLoading, true)
  args = { ...args, selectedTeam: { ...team, id: 'b' } }
  await render()
  assert.deepEqual(state!.triageResult.items, [])
  await act(async () => pending[0].resolve(result(1)))
  assert.equal(state!.triageLoading, true)
  assert.deepEqual(state!.triageResult.items, [])
  await act(async () => pending[1].resolve(result(2)))
  assert.equal(state!.triageResult.items[0].id, 2)
  args = { ...args, options: { ...defaults, tags: ['Other'] } }
  await render()
  assert.deepEqual(state!.triageResult.items, [])
  await act(async () => pending[2].reject(new Error('query failed')))
  assert.equal(state!.triageError, 'query failed')
  args = { ...args, adoQueryEngine: { ...engine } }
  await render()
  assert.equal(state!.triageError, null)
  await act(async () => pending[3].resolve(result(3)))
  assert.equal(state!.triageResult.items[0].id, 3)
})

test('Board routes manual/automatic refresh to Triage only, tracks fresh sync time, and disables no-rule fetches', async (t) => {
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  t.mock.method(globalThis, 'fetch', async () => Response.json({ value: [], workItems: [] }))
  const reads = t.mock.method(AdoQueryEngine.prototype, 'getTriageItems', async () => result(42))
  const clears = t.mock.method(AdoQueryEngine.prototype, 'clearTriageDataCache')
  const development = t.mock.method(AdoQueryEngine.prototype, 'getWorkItemsForCurrentAndNextIteration')
  const backlog = t.mock.method(AdoQueryEngine.prototype, 'getBacklogBugs')
  let options = defaults
  let settingsError: string | null = null
  let state: ReturnType<typeof useBoardViewModel>
  function Board() {
    state = useBoardViewModel({
      pat: 'fixture-token', teamProfiles, assignmentOptionsByTeam, autoRefresh: { enabled: true, minutes: 15 },
      triageSettingsByTeam: { a: { options, error: settingsError } },
    })
    return null
  }
  dom.window.history.replaceState(null, '', '/#backlog')
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  await act(async () => root.render(createElement(Board)))
  assert.equal(reads.mock.callCount(), 0)
  await act(async () => {
    dom.window.location.hash = '#triage'
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'))
  })
  assert.equal(reads.mock.callCount(), 1)
  assert.equal(state!.triageResult.items[0].id, 42)
  assert.equal(state!.triageSyncedAt, now)
  const before = { development: development.mock.callCount(), backlog: backlog.mock.callCount() }
  now += 60_000
  await act(async () => state.onRefresh())
  assert.equal(reads.mock.callCount(), 2)
  assert.equal(clears.mock.callCount(), 1)
  assert.equal(state!.triageSyncedAt, now)
  now += 15 * 60_000
  await act(async () => dom.window.dispatchEvent(new dom.window.Event('focus')))
  assert.equal(reads.mock.callCount(), 3)
  assert.equal(state!.triageSyncedAt, now)
  assert.equal(development.mock.callCount(), before.development)
  assert.equal(backlog.mock.callCount(), before.backlog)
  options = { ...defaults, tags: ['Other'] }
  now += 60_000
  await act(async () => root.render(createElement(Board)))
  assert.equal(reads.mock.callCount(), 4)
  assert.equal(state!.triageSyncedAt, now)
  options = { ...defaults, tags: [] }
  await act(async () => root.render(createElement(Board)))
  now += 15 * 60_000
  await act(async () => dom.window.dispatchEvent(new dom.window.Event('focus')))
  assert.equal(reads.mock.callCount(), 4)
  assert.equal(state!.triageSyncedAt, null)
  options = defaults
  settingsError = 'Unreadable settings'
  await act(async () => root.render(createElement(Board)))
  assert.equal(reads.mock.callCount(), 4)
})
