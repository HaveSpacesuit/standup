import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
})
after(() => server.close())
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')

const team = { orgName: 'example-org', projectName: 'example-project' }

test('synthetic PR-only IDs and zero never request work-item updates across teams', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ value: [] }))
  const engine = new AdoQueryEngine('')

  for (const profile of [team, { orgName: 'other-org', projectName: 'other-project' }]) {
    for (const id of [-123, -456, 0]) {
      assert.deepEqual(await engine.getWorkItemUpdates(profile, id), [])
    }
  }

  assert.equal(fetchMock.mock.callCount(), 0)
})

test('mixed card history loads and caches real work-item updates only', async (t) => {
  const updates = [{ id: 1, rev: 1, fields: { 'System.State': { newValue: 'Active' } } }]
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ value: updates }))
  const engine = new AdoQueryEngine('')

  assert.deepEqual(
    await Promise.all([-123, 123, -456, 456].map((id) => engine.getWorkItemUpdates(team, id))),
    [[], updates, [], updates],
  )
  assert.deepEqual(await engine.getWorkItemUpdates(team, 123), updates)
  assert.equal(fetchMock.mock.callCount(), 2)
  assert.deepEqual(
    fetchMock.mock.calls.map((call) => String(call.arguments[0])),
    [
      'https://dev.azure.com/example-org/example-project/_apis/wit/workItems/123/updates?api-version=7.1',
      'https://dev.azure.com/example-org/example-project/_apis/wit/workItems/456/updates?api-version=7.1',
    ],
  )
})
