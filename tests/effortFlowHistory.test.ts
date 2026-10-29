import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { after, mock, test, type TestContext } from 'node:test'
import { createServer } from 'vite'

const React = createRequire(import.meta.url)('react')
const hooks = {
  useState: mock.method(React, 'useState'),
  useMemo: mock.method(React, 'useMemo'),
  useEffect: mock.method(React, 'useEffect'),
}
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(() => server.close())
const { useEffortFlowHistory } = await server.ssrLoadModule('/src/features/standup/hooks/useEffortFlowHistory.ts')
type HookArgs = Parameters<typeof import('../src/features/standup/hooks/useEffortFlowHistory.ts').useEffortFlowHistory>[0]

const item = { id: 123, title: 'Example', status: 'Active' as const, effort: 3, createdAt: '2026-10-01' }
const baseArgs: HookArgs = {
  adoQueryEngine: null,
  team: { orgName: 'example-org', projectName: 'example-project' },
  tagRules: [],
  workItems: [item],
  iterationWindow: { current: { name: 'Sprint', fullName: 'Project\\Sprint', startDate: '2026-10-01', finishDate: '2026-10-14' }, next: null },
}

function revision(at: string, state: string, effort = 8): import('../src/ado/queryEngine.ts').WorkItemUpdate {
  return {
    revisedDate: at,
    fields: {
      'System.State': { newValue: state },
      'Microsoft.VSTS.Scheduling.Effort': { newValue: effort },
    },
  }
}

function createHookHarness(t: TestContext) {
  const states: unknown[] = []
  const memos: { deps: unknown[]; value: unknown }[] = []
  let stateIndex = 0
  let memoIndex = 0
  let effect: () => (() => void) | undefined
  let cleanup: (() => void) | undefined
  hooks.useState.mock.mockImplementation((initial: unknown) => {
    const index = stateIndex++
    if (!(index in states)) states[index] = initial
    return [states[index], (value: unknown) => { states[index] = value }]
  })
  hooks.useMemo.mock.mockImplementation((factory: () => unknown, deps: unknown[]) => {
    const index = memoIndex++
    const previous = memos[index]
    if (previous && previous.deps.length === deps.length && previous.deps.every((dep, i) => Object.is(dep, deps[i]))) {
      return previous.value
    }
    const value = factory()
    memos[index] = { deps, value }
    return value
  })
  hooks.useEffect.mock.mockImplementation((setup: typeof effect) => { effect = setup })
  t.after(() => cleanup?.())

  const read = function useHistorySnapshot(args: HookArgs) {
    stateIndex = 0
    memoIndex = 0
    return useEffortFlowHistory(args)
  }
  return {
    read,
    update(args: HookArgs) {
      cleanup?.()
      read(args)
      cleanup = effect()
      return read(args)
    },
  }
}

test('a cold empty history is settled and makes no requests', (t) => {
  const getWorkItemUpdates = t.mock.fn(async () => [])
  const args = {
    ...baseArgs,
    adoQueryEngine: { getWorkItemUpdates } as HookArgs['adoQueryEngine'],
    workItems: [],
  }
  const result = createHookHarness(t).update(args)
  assert.equal(result.isLoading, false)
  assert.deepEqual(result.points, [])
  assert.deepEqual(result.visitedStatusesByItemId, {})
  assert.equal(getWorkItemUpdates.mock.callCount(), 0)
  assert.equal(result.sprintForecast.status, 'unavailable')
})

test('forecast uses exact sprint-start history rather than the first end-of-day chart point', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 26).getTime() })
  const getWorkItemUpdates = t.mock.fn(async () => [
    revision('2026-10-16T12:00:00', 'New'),
    revision('2026-10-19T12:00:00', 'Active'),
  ])
  const args: HookArgs = {
    ...baseArgs,
    adoQueryEngine: { getWorkItemUpdates } as HookArgs['adoQueryEngine'],
    workItems: [{ ...item, status: 'Active', effort: 8, createdAt: '2026-10-16' }],
    iterationWindow: {
      current: { name: 'Sprint', fullName: 'Project\\Sprint', startDate: '2026-10-19', finishDate: '2026-10-30' },
      next: null,
    },
  }
  const hook = createHookHarness(t)
  assert.equal(hook.update(args).sprintForecast.status, 'loading')
  await new Promise((resolve) => setImmediate(resolve))
  const result = hook.read(args)
  assert.equal(result.sprintForecast.status, 'ready')
  if (result.sprintForecast.status !== 'ready') return
  assert.deepEqual(result.sprintForecast.start, { complete: 0, inProgress: 0, notStarted: 8, total: 8 })
  assert.deepEqual(result.sprintForecast.current, { complete: 0, inProgress: 8, notStarted: 0, total: 8 })
  assert.deepEqual(result.sprintForecast.projected, { complete: 0, inProgress: 8, notStarted: 0, total: 8 })
  assert.equal(result.points[0].Active, 8)
  assert.equal(result.points[0].New, 0)
  assert.equal(getWorkItemUpdates.mock.callCount(), 1)

  const changedTeam = { ...args, team: { ...args.team, projectName: 'other' } }
  assert.equal(hook.read(changedTeam).sprintForecast.status, 'loading')
})

for (const missingHistory of ['request failure', 'empty revisions', 'missing baseline', 'unknown starting state'] as const) {
  test(`forecast is explicitly unavailable for ${missingHistory} while retaining chart fallback`, async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 26).getTime() })
    const getWorkItemUpdates = t.mock.fn(async () => {
      if (missingHistory === 'request failure') throw new Error('503 Service Unavailable')
      return missingHistory === 'empty revisions' ? [] : [
        ...(missingHistory === 'unknown starting state'
          ? [{ revisedDate: '2026-09-30T12:00:00', fields: { 'System.Tags': { newValue: 'triage' } } }]
          : []),
        revision('2026-10-20T12:00:00', 'Active'),
      ]
    })
    const args = { ...baseArgs, adoQueryEngine: { getWorkItemUpdates } as HookArgs['adoQueryEngine'] }
    const hook = createHookHarness(t)
    hook.update(args)
    await new Promise((resolve) => setImmediate(resolve))
    const result = hook.read(args)
    assert.equal(result.sprintForecast.status, 'unavailable')
    if (result.sprintForecast.status === 'unavailable') {
      assert.match(result.sprintForecast.reason, /history.*(?:could not be loaded|does not establish)/)
    }
    assert.ok(result.points.length > 0)
  })
}

test('forecast follows selected work items, excludes PR-only cards, and starts new items at zero', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 26).getTime() })
  const items: HookArgs['workItems'] = [
    { ...item, id: 1, status: 'Done', effort: 8, createdAt: '2026-10-01' },
    { ...item, id: 2, status: 'New', effort: 5, createdAt: '2026-10-21T12:00:00' },
    { ...item, id: -3, kind: 'pull-request', effort: 100 },
  ]
  const getWorkItemUpdates = t.mock.fn(async (_team, id: number) => id === 1
    ? [revision('2026-10-01T12:00:00', 'New', 8)]
    : id === 2 ? [revision('2026-10-21T12:00:00', 'New', 5)] : [])
  const args: HookArgs = {
    ...baseArgs, workItems: items, historyWorkItems: items,
    adoQueryEngine: { getWorkItemUpdates } as HookArgs['adoQueryEngine'],
    iterationWindow: {
      current: { name: 'Sprint', fullName: 'Project\\Sprint', startDate: '2026-10-19', finishDate: '2026-10-30' },
      next: null,
    },
  }
  const hook = createHookHarness(t)
  hook.update(args)
  await new Promise((resolve) => setImmediate(resolve))
  const result = hook.read(args)
  assert.equal(result.sprintForecast.status, 'ready')
  if (result.sprintForecast.status !== 'ready') return
  assert.equal(result.sprintForecast.current.total, 13)
  assert.equal(result.sprintForecast.start.notStarted, 8)
  assert.equal(result.sprintForecast.current.notStarted, 5)
  assert.equal(result.sprintForecast.current.complete, 8)

  const selected = hook.read({ ...args, workItems: [items[0]] })
  assert.equal(selected.sprintForecast.status, 'ready')
  if (selected.sprintForecast.status === 'ready') assert.equal(selected.sprintForecast.current.total, 8)
})

test('finished sprint forecast stops at sprint end instead of including later changes', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 26).getTime() })
  const getWorkItemUpdates = t.mock.fn(async () => [
    revision('2026-09-30T12:00:00', 'New', 8),
    revision('2026-10-12T12:00:00', 'Active', 8),
    revision('2026-10-20T12:00:00', 'Done', 13),
  ])
  const args: HookArgs = {
    ...baseArgs, adoQueryEngine: { getWorkItemUpdates } as HookArgs['adoQueryEngine'],
    workItems: [{ ...item, status: 'Done', effort: 13 }],
  }
  const hook = createHookHarness(t)
  hook.update(args)
  await new Promise((resolve) => setImmediate(resolve))
  const result = hook.read(args)
  assert.equal(result.sprintForecast.status, 'ready')
  if (result.sprintForecast.status !== 'ready') return
  assert.deepEqual(result.sprintForecast.start, { complete: 0, inProgress: 0, notStarted: 8, total: 8 })
  assert.deepEqual(result.sprintForecast.current, { complete: 0, inProgress: 8, notStarted: 0, total: 8 })
  assert.deepEqual(result.sprintForecast.projected, result.sprintForecast.current)
})

test('sprint-start membership counts removed effort and treats late joiners as added', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 26).getTime() })
  const items: HookArgs['workItems'] = [
    { ...item, id: 1, status: 'Done', effort: 8, createdAt: '2026-10-01' },
    { ...item, id: 2, status: 'New', effort: 5, createdAt: '2026-10-01' },
  ]
  const removed = { ...item, id: 4, status: 'New' as const, effort: 6, createdAt: '2026-10-01' }
  const getWorkItemUpdates = t.mock.fn(async (_team, id: number) =>
    [revision('2026-10-01T12:00:00', 'New', id === 1 ? 8 : id === 2 ? 5 : 6)])
  const args: HookArgs = {
    ...baseArgs, workItems: items, historyWorkItems: items,
    adoQueryEngine: { getWorkItemUpdates } as HookArgs['adoQueryEngine'],
    iterationWindow: {
      current: { name: 'Sprint', fullName: 'Project\\Sprint', startDate: '2026-10-19', finishDate: '2026-10-30' },
      next: null,
    },
    sprintScope: { status: 'ready', startItemIds: new Set([1, 4]), removedItems: [removed] },
  }
  const hook = createHookHarness(t)
  hook.update(args)
  await new Promise((resolve) => setImmediate(resolve))
  const result = hook.read(args)
  assert.equal(result.sprintForecast.status, 'ready')
  if (result.sprintForecast.status !== 'ready') return
  assert.deepEqual(getWorkItemUpdates.mock.calls.map((call) => call.arguments[1]).sort(), [1, 2, 4])
  assert.deepEqual(result.sprintForecast.start, { complete: 0, inProgress: 0, notStarted: 14, total: 14 })
  assert.deepEqual(result.sprintForecast.current, { complete: 8, inProgress: 0, notStarted: 5, total: 13 })
  assert.equal(result.sprintForecast.addedEffort, 5)
  assert.equal(result.sprintForecast.removedEffort, 6)

  assert.equal(hook.read({ ...args, sprintScope: { status: 'loading' } }).sprintForecast.status, 'loading')
  const unavailable = hook.read({ ...args, sprintScope: { status: 'unavailable' } }).sprintForecast
  assert.equal(unavailable.status, 'unavailable')
  if (unavailable.status === 'unavailable') assert.match(unavailable.reason, /membership/)
})

for (const transition of ['empty history', 'missing query engine'] as const) {
  test(`an in-flight load settles on ${transition} and can recover`, async (t) => {
    const pending = Promise.withResolvers<[]>()
    let signal: AbortSignal | undefined
    const getWorkItemUpdates = t.mock.fn((_team, _id, requestSignal: AbortSignal) => {
      signal = requestSignal
      return pending.promise
    })
    const args = { ...baseArgs, adoQueryEngine: { getWorkItemUpdates } as HookArgs['adoQueryEngine'] }
    const hook = createHookHarness(t)
    assert.equal(hook.update(args).isLoading, true)

    const emptyArgs = {
      ...args,
      ...(transition === 'empty history' ? { workItems: [] } : { adoQueryEngine: null }),
    }
    const empty = hook.update(emptyArgs)
    assert.equal(signal?.aborted, true)
    assert.equal(empty.isLoading, false)
    assert.deepEqual(empty.visitedStatusesByItemId, {})
    if (transition === 'empty history') assert.deepEqual(empty.points, [])

    pending.resolve([])
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(hook.read(emptyArgs).isLoading, false)
    assert.deepEqual(hook.read(emptyArgs).visitedStatusesByItemId, {})

    assert.equal(hook.update(args).isLoading, true)
    await new Promise((resolve) => setImmediate(resolve))
    const recovered = hook.read(args)
    assert.equal(recovered.isLoading, false)
    assert.ok(recovered.points.some((point) => point.Active === 3))
    assert.deepEqual(recovered.visitedStatusesByItemId, { 123: ['Active'] })

    const settled = hook.update({ ...args, workItems: [] })
    assert.equal(settled.isLoading, false)
    assert.deepEqual(settled.points, [])
    assert.deepEqual(settled.visitedStatusesByItemId, {})
  })
}
