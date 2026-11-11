import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { AdoHttpClient, AdoAuthError } = await server.ssrLoadModule('/src/ado/httpClient.ts')
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')

const dummyPat = 'nonfunctional-test-pat'
const guid = '0f8fad5b-d9cb-469f-a165-70867728950e'
const blobOptions = { orgName: 'org', path: `/Proj/_apis/wit/attachments/${guid}`, params: { fileName: 'crash.png', 'api-version': '7.1' }, maxBytes: 10 }

test('attachments are requested with the token and returned as a blob', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }))
  const blob: Blob = await new AdoHttpClient(dummyPat).requestBlob(blobOptions)

  assert.equal(blob.size, 3)
  const [url, init] = fetchMock.mock.calls[0].arguments as [URL, RequestInit]
  assert.equal(url.href, `https://dev.azure.com/org/Proj/_apis/wit/attachments/${guid}?fileName=crash.png&api-version=7.1`)
  assert.deepEqual(init.headers, { Authorization: `Basic ${btoa(`:${dummyPat}`)}`, Accept: '*/*' })
})

for (const status of [203, 401, 403]) {
  test(`an attachment answered with HTTP ${status} is an authentication error`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('denied', { status }))
    await assert.rejects(new AdoHttpClient(dummyPat).requestBlob(blobOptions), (error: unknown) => error instanceof AdoAuthError)
  })
}

test('a sign-in page in place of the attachment is an authentication error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }))
  await assert.rejects(new AdoHttpClient(dummyPat).requestBlob(blobOptions), (error: unknown) => error instanceof AdoAuthError)
})

test('failed attachment responses are never read', async (t) => {
  const response = new Response(`Private diagnostic: ${dummyPat}`, { status: 500 })
  t.mock.method(globalThis, 'fetch', async () => response)
  await assert.rejects(new AdoHttpClient(dummyPat).requestBlob(blobOptions), { message: 'Azure DevOps attachment request failed (HTTP 500).' })
  assert.equal(response.bodyUsed, false)
})

test('attachments over the size limit are refused, whether or not they declare their size', async (t) => {
  const tooLarge = { message: 'The attachment is too large to show here.' }
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(4), { headers: { 'content-length': '11' } }))
  await assert.rejects(new AdoHttpClient(dummyPat).requestBlob(blobOptions), tooLarge)

  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(11)))
  await assert.rejects(new AdoHttpClient(dummyPat).requestBlob(blobOptions), tooLarge)
})

test('the engine only requests attachments in the team organization, once each', async (t) => {
  let fail = true
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => fail ? new Response(null, { status: 500 }) : new Response(new Uint8Array([1])))
  const engine = new AdoQueryEngine(dummyPat)

  assert.equal(engine.getWorkItemAttachment(`https://dev.azure.com/other/Proj/_apis/wit/attachments/${guid}`, 'org'), null)
  assert.equal(engine.getWorkItemAttachment('https://example.test/screenshot.png', 'org'), null)
  assert.equal(fetchMock.mock.callCount(), 0)

  // A failed load is retried the next time it is asked for.
  await assert.rejects(engine.getWorkItemAttachment(`https://dev.azure.com/org/Proj/_apis/wit/attachments/${guid}`, 'org')!)
  fail = false
  await engine.getWorkItemAttachment(`https://dev.azure.com/org/Proj/_apis/wit/attachments/${guid}`, 'org')
  await engine.getWorkItemAttachment(`https://dev.azure.com/ORG/Proj/_apis/wit/attachments/${guid.toUpperCase()}?fileName=a.png`, 'org')
  assert.equal(fetchMock.mock.callCount(), 2)
})

function mockPreviewFetch(t: TestContext) {
  return t.mock.method(globalThis, 'fetch', async (input: URL) => {
    if (input.pathname.endsWith('/comments')) return Response.json({ comments: [], totalCount: 0 })
    const id = Number(input.pathname.split('/').at(-1))
    return Response.json({ id, fields: { 'System.Description': `<p>Item ${id}</p>` } })
  })
}
const itemRequests = (fetchMock: ReturnType<typeof mockPreviewFetch>) =>
  fetchMock.mock.calls.filter((call) => !(call.arguments[0] as URL).pathname.endsWith('/comments')).length
const teamA = { id: 'a', orgName: 'org', projectName: 'Proj' }
const teamB = { id: 'b', orgName: 'org', projectName: 'Proj' }

test('previews are kept per team until that team refreshes its Triage or Backlog page', async (t) => {
  const fetchMock = mockPreviewFetch(t)
  const engine = new AdoQueryEngine(dummyPat)

  assert.equal((await engine.getWorkItemPreview(teamA, 42)).text.description, '<p>Item 42</p>')
  await engine.getWorkItemPreview(teamA, 42)
  await engine.getWorkItemPreview(teamB, 42)
  assert.equal(itemRequests(fetchMock), 2)

  engine.clearTriageDataCache('a')
  await engine.getWorkItemPreview(teamA, 42)
  await engine.getWorkItemPreview(teamB, 42)
  assert.equal(itemRequests(fetchMock), 3, 'only team A reloads')

  engine.clearBacklogDataCache()
  await engine.getWorkItemPreview(teamA, 42)
  await engine.getWorkItemPreview(teamB, 42)
  assert.equal(itemRequests(fetchMock), 5)
})
