import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestClient, AdoRequestOptions } from '../src/ado/httpClient'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(() => server.close())
const { FAILING_TESTS_LIMIT, loadFailingTests, loadTestPoints } = await server.ssrLoadModule('/src/ado/testPipelinesApi.ts')

type RecordedClient = AdoRequestClient & { requests: AdoRequestOptions[] }

function fakeClient(respond: (options: AdoRequestOptions) => unknown): RecordedClient {
  const requests: AdoRequestOptions[] = []
  return {
    requests,
    async request<T>(options: AdoRequestOptions): Promise<T> {
      requests.push(options)
      return respond(options) as T
    },
    async requestPage<T>(options: AdoRequestOptions): Promise<{ data: T; continuationToken: null }> {
      requests.push(options)
      return { data: respond(options) as T, continuationToken: null }
    },
  }
}

const pipeline = (kind: 'build' | 'release', stageName = 'E2E') => ({
  id: kind, orgName: 'org', projectName: 'Example Project', kind, definitionId: 7, name: 'ProjectWise Web (PWW)', stageName,
  ...(kind === 'release' ? { stageDefinitionId: 31 } : {}),
})

test('failing tests for a build run are read by pipeline and stage, failed outcomes only, one per test', async () => {
  const client = fakeClient(() => [
    { automatedTestName: 'Suite.opens a folder', testCaseTitle: 'opens a folder', outcome: 'Failed' },
    { automatedTestName: 'Suite.opens a folder', testCaseTitle: 'opens a folder', outcome: 'Failed' },
    { automatedTestName: 'Suite.uploads a file', outcome: 'Timeout' },
    { automatedTestName: 'Suite.renames a file', testCaseTitle: '  ', outcome: 'Aborted' },
    { automatedTestName: 'Suite.skipped', outcome: 'NotExecuted' },
    { testCaseTitle: '', outcome: 'Failed' },
  ])
  const failing = await loadFailingTests(client, pipeline('build'), { runId: 2914 })

  assert.deepEqual(failing, {
    tests: [
      { key: 'Suite.opens a folder', name: 'opens a folder', outcome: 'Failed' },
      { key: 'Suite.uploads a file', name: 'Suite.uploads a file', outcome: 'Timeout' },
      { key: 'Suite.renames a file', name: 'Suite.renames a file', outcome: 'Aborted' },
    ],
    truncated: false,
  })
  assert.equal(client.requests.length, 1)
  const [request] = client.requests
  assert.equal(request.host, 'vstmr.dev.azure.com')
  assert.equal(request.path, '/Example%20Project/_apis/testresults/resultsbypipeline')
  assert.deepEqual(request.params, {
    pipelineId: 2914,
    stageName: 'E2E',
    outcomes: 'Failed,Aborted,Error,Timeout,Blocked,Inconclusive,Warning',
    '$top': FAILING_TESTS_LIMIT,
    'api-version': '7.1-preview.1',
  })
})

test('a build pipeline tracking every stage reads failing tests without a stage name', async () => {
  const client = fakeClient(() => ({ value: [] }))
  assert.deepEqual(await loadFailingTests(client, pipeline('build', '__all__'), { runId: 5 }), { tests: [], truncated: false })
  assert.equal(client.requests[0].params!.stageName, undefined)
})

test('failing tests for a release run are read by release and stage instance; a full page is marked truncated', async () => {
  const results = Array.from({ length: FAILING_TESTS_LIMIT }, (_, index) => ({ automatedTestName: `Suite.test ${index}`, outcome: 'Failed' }))
  const client = fakeClient(() => ({ value: results }))
  const failing = await loadFailingTests(client, pipeline('release'), { runId: 88, environmentId: 412 })

  assert.equal(failing.tests.length, FAILING_TESTS_LIMIT)
  assert.equal(failing.truncated, true)
  const [request] = client.requests
  assert.equal(request.path, '/Example%20Project/_apis/testresults/resultsbyrelease')
  assert.equal(request.params!.releaseId, 88)
  assert.equal(request.params!.releaseEnvid, 412)
  assert.equal(request.params!.pipelineId, undefined)

  await assert.rejects(loadFailingTests(client, pipeline('release'), { runId: 88 }), /no stage to read failing tests from/)
  assert.equal(client.requests.length, 1, 'nothing is requested without a stage instance')
})

test('release points keep their stage instance, so failing tests can be read later', async () => {
  const deployed = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const client = fakeClient((options) => {
    if (options.path.endsWith('/_apis/release/releases')) return { value: [{ id: 88, createdOn: deployed }] }
    if (options.path.endsWith('/_apis/release/releases/88')) {
      return { environments: [
        { id: 411, name: 'QA', definitionEnvironmentId: 30, status: 'succeeded' },
        { id: 412, name: 'E2E', definitionEnvironmentId: 31, status: 'succeeded', deploySteps: [{ lastModifiedOn: deployed }] },
      ] }
    }
    if (options.path.endsWith('/_apis/testresults/resultdetailsbyrelease')) {
      return { resultsForGroup: [{ resultsCountByOutcome: { Passed: { count: 95 }, Failed: { count: 5 } } }] }
    }
    throw new Error(`Unexpected request: ${options.path}`)
  })
  const points = await loadTestPoints(client, pipeline('release'), 30)
  assert.deepEqual(points, [{ date: deployed, runId: 88, environmentId: 412, passed: 95, total: 100 }])
})
