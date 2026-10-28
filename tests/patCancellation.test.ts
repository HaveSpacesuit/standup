import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(() => server.close())
const { clearStoredPat, saveStoredPat } = await server.ssrLoadModule('/src/adoAuth.ts')
const { AdoHttpClient } = await server.ssrLoadModule('/src/ado/httpClient.ts')
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')

for (const name of ['localStorage', 'sessionStorage']) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  const entries = new Map<string, string>()
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    },
  })
  after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  })
}

const requestOptions = { orgName: 'example-org', path: '/_apis/example' }
const team = {
  id: 'example-team',
  orgName: 'example-org',
  projectName: 'example-project',
  areaPath: '',
  iterationPath: '',
}
const dummyPat = 'nonfunctional-test-pat'

test('Clear PAT blocks follow-up requests when a held WIQL response arrives late', async (t) => {
  saveStoredPat(dummyPat)
  let release!: (response: Response) => void
  // Deliberately ignore abort in the interceptor to simulate an already-sent response arriving late.
  const fetchMock = t.mock.method(globalThis, 'fetch', () =>
    new Promise<Response>((resolve) => { release = resolve }),
  )
  const engine = new AdoQueryEngine(dummyPat)
  const pending = engine.getWorkItemsForCurrentAndNextIteration(team)
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  assert.equal(fetchMock.mock.callCount(), 1)
  assert.match(String(fetchMock.mock.calls[0].arguments[0]), /\/wiql\?/)
  const signal = fetchMock.mock.calls[0].arguments[1]?.signal

  clearStoredPat()
  assert.equal(sessionStorage.getItem('standup:azdo-pat-session'), null)
  assert.equal(signal?.aborted, true)
  release(Response.json({ workItems: [{ id: 101 }] }))
  await rejected
  assert.equal(fetchMock.mock.callCount(), 1, 'no batch, relations, or enrichment request may start')

  await assert.rejects(engine.request(requestOptions), { name: 'AbortError' })
  assert.equal(fetchMock.mock.callCount(), 1, 'a stale engine must remain unusable')
})

test('Clear PAT cancels all clients, including requests with a caller signal', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (_url, options) => {
    return new Promise<Response>((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    })
  })
  const caller = new AbortController()
  const clients = [new AdoHttpClient(dummyPat), new AdoHttpClient(dummyPat)]
  const pending = Promise.all(clients.map((client, index) =>
    assert.rejects(client.request({ ...requestOptions, signal: index ? caller.signal : undefined }), { name: 'AbortError' }),
  ))

  clearStoredPat()
  await pending
  assert.equal(fetchMock.mock.callCount(), 2)
  assert.equal(caller.signal.aborted, false, 'credential cancellation must not abort the caller controller')
})

test('a caller abort prevents requests without invalidating the credential session', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ value: [] }))
  const client = new AdoHttpClient(dummyPat)
  const caller = new AbortController()
  caller.abort()

  await assert.rejects(client.request({ ...requestOptions, signal: caller.signal }), { name: 'AbortError' })
  assert.equal(fetchMock.mock.callCount(), 0)
  assert.deepEqual(await client.request(requestOptions), { value: [] })
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('clearing while the response body is pending rejects stale results', async (t) => {
  let release!: (data: unknown) => void
  const body = new Promise((resolve) => { release = resolve })
  let bodyStarted!: () => void
  const started = new Promise<void>((resolve) => { bodyStarted = resolve })
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => { bodyStarted(); return body },
  }))
  const client = new AdoHttpClient(dummyPat)
  const rejected = assert.rejects(client.request(requestOptions), { name: 'AbortError' })
  await started
  clearStoredPat()
  release({ value: [] })
  await rejected
})

test('saving a PAT after clearing enables fresh clients but never revives old clients', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ workItems: [] }))
  const staleClient = new AdoHttpClient(dummyPat)
  clearStoredPat()
  saveStoredPat(dummyPat)
  const engine = new AdoQueryEngine(dummyPat)

  assert.deepEqual(await engine.getWorkItemsForCurrentAndNextIteration(team), [])
  assert.deepEqual(await engine.getWorkItemsForCurrentAndNextIteration(team), [])
  assert.equal(fetchMock.mock.callCount(), 1, 'fresh engines retain normal caching')
  await assert.rejects(staleClient.request(requestOptions), { name: 'AbortError' })
  assert.equal(fetchMock.mock.callCount(), 1)
})
