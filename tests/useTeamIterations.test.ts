import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { act, createElement } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { AdoQueryEngine } from '../src/ado/queryEngine'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
})
const { createRoot } = await import('react-dom/client')
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(async () => {
  await server.close()
  dom.window.close()
})
const { useTeamIterations } = await server.ssrLoadModule('/src/features/standup/hooks/useTeamIterations.ts')
const team = {
  id: 'team',
  orgName: 'example-org',
  projectName: 'example-project',
  teamName: 'Example team',
  iterationPath: 'Project',
}

test('adding a PAT synchronously loads iterations even when the request key is unchanged', async (t) => {
  let adoQueryEngine: AdoQueryEngine | null = null
  let result: { iterationsLoading: boolean }
  const loadingStates: boolean[] = []
  function Iterations() {
    result = useTeamIterations({
      adoQueryEngine,
      selectedTeam: team,
      reloadNonce: 0,
    })
    loadingStates.push(result.iterationsLoading)
    return null
  }
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  await act(async () => root.render(createElement(Iterations)))

  assert.equal(result!.iterationsLoading, false)

  loadingStates.length = 0
  adoQueryEngine = { getTeamIterations: () => new Promise(() => {}) } as unknown as AdoQueryEngine
  act(() => root.render(createElement(Iterations)))

  assert.equal(loadingStates[0], true)
  assert.equal(result!.iterationsLoading, true)
})
