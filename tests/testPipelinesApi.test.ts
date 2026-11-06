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

test('failing tests for a build run are read by pipeline and stage, failed and aborted only, one per test', async () => {
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
  // Azure DevOps refuses any other outcome here with HTTP 409.
  assert.deepEqual(request.params, {
    pipelineId: 2914,
    stageName: 'E2E',
    outcomes: 'Failed,Aborted',
    '$top': FAILING_TESTS_LIMIT,
    'api-version': '7.1-preview.1',
  })
})

test('a build pipeline tracking every stage reads failing tests without a stage name', async () => {
  const client = fakeClient(() => ({ value: [] }))
  assert.deepEqual(await loadFailingTests(client, pipeline('build', '__all__'), { runId: 5 }), { tests: [], truncated: false })
  assert.equal(client.requests[0].params!.stageName, undefined)
})

const releaseTestRuns = (groups: Array<{ id: number | string; counts: Record<string, number> }>) => ({
  groupByField: 'TestRun',
  resultsForGroup: groups.map(({ id, counts }) => ({
    groupByValue: { id, name: 'E2E tests (QA)' },
    resultsCountByOutcome: Object.fromEntries(Object.entries(counts).map(([outcome, count]) => [outcome, { outcome: outcome[0].toLowerCase() + outcome.slice(1), count }])),
    results: [],
  })),
})

test('failing tests for a release run are read from the stage instance\'s test runs that have failures', async () => {
  const client = fakeClient((options) => {
    if (options.path.endsWith('/_apis/testresults/resultdetailsbyrelease')) {
      return releaseTestRuns([
        { id: 501, counts: { Passed: 619, Failed: 2, NotExecuted: 243 } },
        { id: '502', counts: { Passed: 40, NotExecuted: 3 } },
        { id: 503, counts: { Passed: 12, Timeout: 1 } },
      ])
    }
    if (options.path.endsWith('/_apis/testresults/runs/501/results')) {
      return { count: 2, value: [
        { automatedTestName: 'Suite.opens a folder', testCaseTitle: 'opens a folder', outcome: 'Failed' },
        { automatedTestName: 'Suite.uploads a file', outcome: 'Failed' },
      ] }
    }
    if (options.path.endsWith('/_apis/testresults/runs/503/results')) {
      return { count: 1, value: [{ automatedTestName: 'Suite.opens a folder', testCaseTitle: 'opens a folder', outcome: 'Timeout' }] }
    }
    throw new Error(`Unexpected request: ${options.path}`)
  })
  const failing = await loadFailingTests(client, pipeline('release'), { runId: 88, environmentId: 412 })

  assert.deepEqual(failing, {
    tests: [
      { key: 'Suite.opens a folder', name: 'opens a folder', outcome: 'Failed' },
      { key: 'Suite.uploads a file', name: 'Suite.uploads a file', outcome: 'Failed' },
    ],
    truncated: false,
  })
  const [summary, first, second] = client.requests
  assert.ok(client.requests.every((request) => request.host === 'vstmr.dev.azure.com'))
  assert.equal(summary.path, '/Example%20Project/_apis/testresults/resultdetailsbyrelease')
  assert.deepEqual(summary.params, {
    releaseId: 88, releaseEnvId: 412, groupBy: 'TestRun', shouldIncludeResults: false, 'api-version': '7.1-preview.1',
  })
  assert.deepEqual(first.params, {
    outcomes: 'Failed,Aborted,Error,Timeout,Blocked,Inconclusive,Warning', '$top': FAILING_TESTS_LIMIT, 'api-version': '7.1-preview.1',
  })
  assert.equal(second.path, '/Example%20Project/_apis/testresults/runs/503/results', 'a run without failures is skipped')
  assert.equal(second.params!['$top'], FAILING_TESTS_LIMIT - 2, 'later runs read only what is left of the limit')
  assert.equal(client.requests.length, 3)
})

test('release test runs stop being read once the limit is reached, and the list is marked truncated', async () => {
  const client = fakeClient((options) => {
    if (options.path.endsWith('/_apis/testresults/resultdetailsbyrelease')) {
      return releaseTestRuns([{ id: 501, counts: { Failed: 250 } }, { id: 502, counts: { Failed: 3 } }])
    }
    return { value: Array.from({ length: FAILING_TESTS_LIMIT }, (_, index) => ({ automatedTestName: `Suite.test ${index}`, outcome: 'Failed' })) }
  })
  const failing = await loadFailingTests(client, pipeline('release'), { runId: 88, environmentId: 412 })

  assert.equal(failing.tests.length, FAILING_TESTS_LIMIT)
  assert.equal(failing.truncated, true)
  assert.equal(client.requests.filter((request) => request.path.includes('/_apis/testresults/runs/')).length, 1)
})

test('a release run without a stage instance or failing test runs reads no results', async () => {
  const client = fakeClient(() => releaseTestRuns([{ id: 501, counts: { Passed: 10, NotExecuted: 4 } }]))
  await assert.rejects(loadFailingTests(client, pipeline('release'), { runId: 88 }), /no stage to read failing tests from/)
  assert.equal(client.requests.length, 0, 'nothing is requested without a stage instance')

  assert.deepEqual(await loadFailingTests(client, pipeline('release'), { runId: 88, environmentId: 412 }), { tests: [], truncated: false })
  assert.equal(client.requests.length, 1)
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

test('test counts include only tests that ran: skipped, not-impacted, and unfinished results are left out', async () => {
  const finished = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const client = fakeClient((options) => {
    if (options.path.endsWith('/_apis/build/builds')) return { value: [{ id: 2914, finishTime: finished }] }
    if (options.path.endsWith('/_apis/testresults/metrics')) {
      return { resultSummary: { resultSummaryByRunState: {
        Completed: { aggregatedResultDetailsByOutcome: {
          Passed: { count: 540, outcome: 'Passed' },
          Failed: { count: 10, outcome: 'Failed' },
          Blocked: { count: 2 },
          // A product that runs a shared suite skips everything that doesn't apply to it.
          NotExecuted: { count: 630, outcome: 'NotExecuted' },
          NotImpacted: { count: 40 },
          NotApplicable: { count: 5 },
          None: { count: 3 },
          Unspecified: { count: 1 },
          InProgress: { count: 4 },
          Paused: { count: 2 },
        } },
        InProgress: { aggregatedResultDetailsByOutcome: { Passed: { count: 99 } } },
      } } }
    }
    throw new Error(`Unexpected request: ${options.path}`)
  })
  const points = await loadTestPoints(client, pipeline('build'), 30)
  assert.deepEqual(points, [{ date: finished, runId: 2914, passed: 540, total: 552 }])
})
