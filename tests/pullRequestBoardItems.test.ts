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
        return [state[slot], (value) => { state[slot] = value }]
      }
    ` : undefined,
  }],
})
after(() => server.close())
const { usePullRequestBoardItems } = await server.ssrLoadModule('/src/features/standup/hooks/usePullRequestBoardItems.ts')
const { beginRender, effects, state } = await server.ssrLoadModule('\0pull-request-react')

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
    return effects.shift()()
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
