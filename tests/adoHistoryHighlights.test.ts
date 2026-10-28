import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestOptions } from '../src/ado/httpClient'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: ['react'] },
  plugins: [{
    name: 'ado-history-hook-test',
    enforce: 'pre',
    resolveId: (id) => id === 'react' ? '\0ado-history-react' : undefined,
    load: (id) => id === '\0ado-history-react' ? `
      export const effects = []
      export const state = []
      let stateIndex = 0
      export const beginRender = () => { stateIndex = 0 }
      export const useEffect = (effect) => { effects.push(effect) }
      export const useMemo = (factory) => factory()
      export const useState = (initial) => {
        const slot = stateIndex++
        if (!(slot in state)) state[slot] = initial
        return [state[slot], (value) => { state[slot] = value }]
      }
    ` : undefined,
  }],
})
after(() => server.close())
const { useAdoHistoryHighlights } = await server.ssrLoadModule('/src/features/standup/hooks/useAdoHistoryHighlights.ts')
const { beginRender, effects, state } = await server.ssrLoadModule('\0ado-history-react')

test('one history load shares linked PR detail requests across work items', async () => {
  effects.length = 0
  state.length = 0
  let detailRequests = 0
  const pullRequestId = 678973
  const relation = {
    rel: 'ArtifactLink',
    url: `vstfs:///Git/PullRequestId/project-id%2Frepo-id%2F${pullRequestId}`,
  }
  const workItems = [101, 102, 103].map((id) => ({
    id,
    title: `Work item ${id}`,
    status: 'Active',
    recentActivityAt: '2026-10-01T12:00:00Z',
  }))
  const adoQueryEngine = {
    async getWorkItemUpdates(_team: unknown, _itemId: number) {
      return [
        { id: 1, revisedDate: '2026-10-01T12:00:00Z' },
        { id: 2, revisedDate: '2026-10-02T12:00:00Z', relations: { added: [relation] } },
      ]
    },
    async request<T>(options: AdoRequestOptions) {
      detailRequests += 1
      assert.equal(
        options.path,
        `/example-project/_apis/git/repositories/repo-id/pullRequests/${pullRequestId}`,
      )
      assert.deepEqual(options.params, { 'api-version': '7.1' })
      return { creationDate: '2026-09-30T12:00:00Z', isDraft: false } as T
    },
  }
  const args = {
    adoQueryEngine,
    team: { orgName: 'example-org', projectName: 'example-project', repoName: 'repo' },
    tagRules: [],
    workItems,
  }

  function Render() {
    beginRender()
    useAdoHistoryHighlights(args)
    return effects.shift()?.()
  }

  const cleanup = Render()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(detailRequests, 1)
  cleanup?.()

  const refreshCleanup = Render()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(detailRequests, 2, 'a separate refresh should perform a fresh detail lookup')
  refreshCleanup?.()
})
