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

function createHookHarness(t: TestContext) {
  const states: unknown[] = []
  let stateIndex = 0
  let effect: () => (() => void) | undefined
  let cleanup: (() => void) | undefined
  hooks.useState.mock.mockImplementation((initial: unknown) => {
    const index = stateIndex++
    if (!(index in states)) states[index] = initial
    return [states[index], (value: unknown) => { states[index] = value }]
  })
  hooks.useMemo.mock.mockImplementation((factory: () => unknown) => factory())
  hooks.useEffect.mock.mockImplementation((setup: typeof effect) => { effect = setup })
  t.after(() => cleanup?.())

  const read = function useHistorySnapshot(args: HookArgs) {
    stateIndex = 0
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
