import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: ['react'] },
  plugins: [{
    name: 'pull-request-hook-test',
    enforce: 'pre',
    resolveId: (id) => id === 'react' ? '\0pull-request-react' : undefined,
    load: (id) => id === '\0pull-request-react' ? `
      export const effects = []
      export const state = []
      let index = 0
      export const beginRender = () => { index = 0 }
      export const useEffect = (effect) => { effects.push(effect) }
      export const useState = (initial) => {
        const slot = index++
        if (!(slot in state)) state[slot] = initial
        return [state[slot], (value) => { state[slot] = typeof value === 'function' ? value(state[slot]) : value }]
      }
      export const useRef = (initial) => {
        const slot = index++
        if (!(slot in state)) state[slot] = { current: initial }
        return state[slot]
      }
    ` : undefined,
  }],
})
after(() => server.close())
const { usePullRequestBoardItems } = await server.ssrLoadModule('/src/features/standup/hooks/usePullRequestBoardItems.ts')
const { beginRender, effects, state } = await server.ssrLoadModule('\0pull-request-react')

/** Runs every effect of the render (loading cards first, then the patch subscription), returning one cleanup. */
function runEffects() {
  const cleanups = effects.splice(0).map((effect: () => (() => void) | void) => effect())
  return () => cleanups.forEach((cleanup: (() => void) | void) => cleanup?.())
}

test('repository reload clears old cards while pending and ignores late results from the previous repository', async () => {
  state.length = 0
  const pending: { resolve: (items: unknown[]) => void; signal: AbortSignal }[] = []
  const args = {
    adoQueryEngine: {
      getUnlinkedActivePullRequestItems: (
        _team: unknown, _members: unknown, _items: unknown, _iteration: unknown, signal: AbortSignal,
      ) => new Promise((resolve) => pending.push({ resolve, signal })),
    },
    selectedTeam: { id: 'team', orgName: 'org', projectName: 'project', repoName: 'SharePortal' },
    members: [{ displayName: 'Team Member' }],
    membersLoading: false,
    membersError: null,
    workItems: [],
    workItemsLoading: false,
    workItemsError: null,
    currentIteration: null,
  }
  function Render() {
    beginRender()
    usePullRequestBoardItems(args)
    return runEffects()
  }
  const settle = async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }
  const originalItems = [{ id: -682196 }]
  let cleanup = Render()
  pending[0].resolve(originalItems)
  await settle()
  assert.deepEqual(state[0], originalItems)

  cleanup()
  args.selectedTeam = { ...args.selectedTeam, repoName: 'ConstructSim' }
  cleanup = Render()
  assert.deepEqual(state[0], [], 'old standalone cards clear before the new request finishes')
  assert.equal(state[1], true)

  cleanup()
  args.selectedTeam = { ...args.selectedTeam, repoName: 'SharePortal' }
  cleanup = Render()
  assert.equal(pending[1].signal.aborted, true)
  pending[2].resolve(originalItems)
  await settle()
  assert.deepEqual(state[0], originalItems)
  assert.equal(state[1], false)

  pending[1].resolve([])
  await settle()
  assert.deepEqual(state[0], originalItems, 'late results must not overwrite the restored repository')
  cleanup()
})

test('a card edited in place keeps the shown pull request cards without a loading state', async () => {
  state.length = 0
  const pending: ((items: unknown[]) => void)[] = []
  const loading: boolean[] = []
  const args = {
    adoQueryEngine: { getUnlinkedActivePullRequestItems: () => new Promise((resolve) => pending.push(resolve)) },
    selectedTeam: { id: 'team', orgName: 'org', projectName: 'project', repoName: 'SharePortal' },
    members: [{ displayName: 'Team Member' }],
    membersLoading: false,
    membersError: null,
    workItems: [{ id: 1 }, { id: 2 }],
    workItemsLoading: false,
    workItemsError: null,
    currentIteration: null,
  }
  function Render() {
    beginRender()
    usePullRequestBoardItems(args)
    const cleanup = runEffects()
    loading.push(state[1])
    return cleanup
  }
  const settle = async () => {
    await Promise.resolve()
    await Promise.resolve()
  }
  const shownItems = [{ id: -682196 }]
  let cleanup = Render()
  pending[0](shownItems)
  await settle()

  cleanup()
  args.workItems = [{ id: 1, assignedTo: { displayName: 'Developer' } }, { id: 2 }]
  cleanup = Render()
  assert.equal(state[0], shownItems)
  const refreshedItems = [{ id: -682196 }]
  pending[1](refreshedItems)
  await settle()
  assert.equal(state[0], refreshedItems)

  cleanup()
  args.workItems = [...args.workItems, { id: 3 }]
  cleanup = Render()
  assert.equal(state[0], refreshedItems, 'a tag rule that reveals a card keeps the shown cards while they are read again')
  const revealedItems = [{ id: -682197 }]
  pending[2](revealedItems)
  await settle()
  assert.equal(state[0], revealedItems)
  assert.deepEqual(loading, [true, false, false])
  cleanup()
})

test('a pull request card reloaded on its own changes in place, and leaves once it is off the board', async () => {
  state.length = 0
  const listeners = new Set<(patch: unknown) => void>()
  const card = (id: number, title: string) => ({ id: -id, kind: 'pull-request', title, pullRequest: { id, repositoryId: 'repo', title, url: '' } })
  const args = {
    adoQueryEngine: {
      getUnlinkedActivePullRequestItems: async () => [card(456, 'Old'), card(457, 'Other')],
      subscribePullRequestPatches: (listener: (patch: unknown) => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    selectedTeam: { id: 'team', orgName: 'org', projectName: 'project', repoName: 'SharePortal' },
    members: [{ displayName: 'Team Member' }],
    membersLoading: false,
    membersError: null,
    workItems: [],
    workItemsLoading: false,
    workItemsError: null,
    currentIteration: null,
  }
  const titles = () => state[0].map((item: { title: string }) => item.title)
  beginRender()
  usePullRequestBoardItems(args)
  const cleanup = runEffects()
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(titles(), ['Old', 'Other'])

  listeners.forEach((listener) => listener({ id: 456, repositoryId: 'repo', card: card(456, 'New'), status: 'active' }))
  assert.deepEqual(titles(), ['New', 'Other'])
  listeners.forEach((listener) => listener({ id: 456, repositoryId: 'repo', card: null, status: 'abandoned' }))
  assert.deepEqual(titles(), ['Other'])
  cleanup()
  assert.equal(listeners.size, 0)
})
