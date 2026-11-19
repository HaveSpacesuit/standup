import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: ['react'] },
  plugins: [{
    name: 'work-item-assignees-hook-test',
    enforce: 'pre',
    resolveId: (id) => id === 'react' ? '\0work-item-assignees-react' : undefined,
    load: (id) => id === '\0work-item-assignees-react' ? `
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
const { useWorkItemAssignees } = await server.ssrLoadModule('/src/features/standup/hooks/useWorkItemAssignees.ts')
const { beginRender, effects, state } = await server.ssrLoadModule('\0work-item-assignees-react')

type Card = { id: number; assignedTo?: { displayName: string } }

test('a card edited in place re-resolves assignees without blanking them or showing a loading state', async () => {
  const loading: boolean[] = []
  const args = {
    adoQueryEngine: {
      resolveWorkItemAssignee: async (_team: unknown, _lookup: unknown, item: Card) => ({ kind: 'member', displayName: item.assignedTo?.displayName ?? null }),
    },
    team: { orgName: 'org', projectName: 'project' },
    members: [{ displayName: 'Developer' }],
    membersLoading: false,
    membersError: null,
    workItems: [{ id: 1 }, { id: 2 }] as Card[],
    workItemsLoading: false,
    workItemsError: null,
  }
  function Render() {
    beginRender()
    useWorkItemAssignees(args)
    const cleanup = effects.shift()()
    loading.push(state[1])
    return cleanup
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  let cleanup = Render()
  await settle()
  const shown = state[0]
  assert.equal(shown[1].displayName, null)

  cleanup()
  args.workItems = [{ id: 1, assignedTo: { displayName: 'Developer' } }, { id: 2 }]
  cleanup = Render()
  assert.equal(state[0], shown)
  await settle()
  assert.equal(state[0][1].displayName, 'Developer')
  assert.equal(state[1], false)

  cleanup()
  args.workItems = [...args.workItems, { id: 3 }]
  cleanup = Render()
  assert.deepEqual(loading, [true, false, true], 'a different set of cards is a new resolution')
  cleanup()
})

test('a card a tag rule hides and reveals again keeps its assignee, without loading or a new map', async () => {
  state.length = 0
  const loading: boolean[] = []
  const args = {
    adoQueryEngine: {
      resolveWorkItemAssignee: async (_team: unknown, _lookup: unknown, item: Card) => (item.id === 2
        ? { kind: 'history-unavailable', displayName: null }
        : { kind: 'member', displayName: 'Developer' }),
    },
    team: { orgName: 'org', projectName: 'project' },
    members: [{ displayName: 'Developer' }],
    membersLoading: false,
    membersError: null,
    workItems: [{ id: 1 }, { id: 2 }] as Card[],
    workItemsLoading: false,
    workItemsError: null,
  }
  let warning: string | null = null
  function Render() {
    beginRender()
    warning = useWorkItemAssignees(args).assigneesHistoryWarning
    const cleanup = effects.shift()()
    loading.push(state[1])
    return cleanup
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  let cleanup = Render()
  await settle()
  const shown = state[0]

  cleanup()
  args.workItems = [{ id: 1 }]
  cleanup = Render()
  await settle()
  assert.equal(state[0], shown, 'equal assignees keep the shown map')
  beginRender()
  assert.equal(useWorkItemAssignees(args).assigneesHistoryWarning, null, 'a hidden card is not counted')
  effects.length = 0

  cleanup()
  args.workItems = [{ id: 1 }, { id: 2 }]
  cleanup = Render()
  await settle()
  assert.equal(state[0], shown)
  assert.match(warning ?? '', /unavailable for 1 item,/)
  assert.deepEqual(loading, [true, false, false])
  cleanup()
})