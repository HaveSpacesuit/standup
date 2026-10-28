import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(() => server.close())
const { AdoHttpClient, AdoAuthError, ADO_AUTH_ERROR_MESSAGE } = await server.ssrLoadModule('/src/ado/httpClient.ts')

const dummyPat = 'nonfunctional-test-pat'
const authorization = `Basic ${btoa(`:${dummyPat}`)}`
const diagnostic = `Private diagnostic: ${dummyPat}; Authorization: ${authorization}; ${dummyPat}`
const requestOptions = { orgName: 'example-org', path: '/_apis/wit/wiql' }

const errorBodies = [
  { name: 'JSON message', contentType: 'application/json', body: JSON.stringify({ message: diagnostic }) },
  { name: 'plain text', contentType: 'text/plain', body: diagnostic },
  { name: 'malformed JSON', contentType: 'application/json', body: `{"message": "${diagnostic}` },
  { name: 'missing JSON message', contentType: 'application/json', body: JSON.stringify({ token: dummyPat, authorization }) },
  { name: 'non-string JSON message', contentType: 'application/json', body: JSON.stringify({ message: { token: dummyPat } }) },
  { name: 'HTML', contentType: 'text/html', body: `<html>${diagnostic}</html>` },
  { name: 'empty body', contentType: 'text/plain', body: '' },
  { name: 'harmless message with private fields', contentType: 'application/json', body: JSON.stringify({ message: 'Unavailable', token: dummyPat, authorization, privatePayload: 'private data' }) },
]

for (const { name, contentType, body } of errorBodies) {
  test(`HTTP errors omit upstream ${name} and status text`, async (t) => {
    const response = new Response(body, {
      status: 500,
      statusText: diagnostic,
      headers: { 'content-type': contentType },
    })
    t.mock.method(globalThis, 'fetch', async () => response)

    await assert.rejects(new AdoHttpClient(dummyPat).request(requestOptions), {
      name: 'Error',
      message: 'Azure DevOps query failed (HTTP 500). Try refreshing.',
    })
    assert.equal(response.bodyUsed, false, 'error bodies should not be read')
  })
}

for (const status of [203, 401, 403]) {
  test(`HTTP ${status} preserves the safe authentication explanation`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response(
      JSON.stringify({ message: diagnostic }),
      { status, statusText: diagnostic, headers: { 'content-type': 'application/json' } },
    ))

    await assert.rejects(new AdoHttpClient(dummyPat).request(requestOptions), (error: unknown) => {
      assert.ok(error instanceof AdoAuthError)
      assert.equal(error.message, ADO_AUTH_ERROR_MESSAGE)
      assert.equal(error.status, status)
      return true
    })
  })
}

test('other failure statuses retain their numeric status', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(diagnostic, { status: 429 }))
  await assert.rejects(new AdoHttpClient(dummyPat).request(requestOptions), {
    message: 'Azure DevOps query failed (HTTP 429). Try refreshing.',
  })
})

test('successful JSON responses and pagination remain unchanged', async (t) => {
  const data = { value: [{ id: 101 }] }
  t.mock.method(globalThis, 'fetch', async () => Response.json(data, {
    headers: { 'x-ms-continuationtoken': 'next-page' },
  }))

  assert.deepEqual(await new AdoHttpClient(dummyPat).requestPage(requestOptions), {
    data,
    continuationToken: 'next-page',
  })
})
