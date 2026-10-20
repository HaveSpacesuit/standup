import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(() => server.close())
const { AdoAuthError } = await server.ssrLoadModule('/src/ado/httpClient.ts')
const { fetchPolicyEvaluationChecksSummary } = await server.ssrLoadModule('/src/ado/policyEvaluationChecksApi.ts')
const { getChecksPresentation } = await server.ssrLoadModule('/src/features/standup/components/pullRequestChecksPresentation.ts')

const team = { orgName: 'checks-test-org', projectName: 'project' }
function createClient(response: unknown) {
  return {
    async request<T>(): Promise<T> {
      if (response instanceof Error) {
        throw response
      }
      return response as T
    },
    async requestPage<T>(): Promise<{ data: T; continuationToken: null }> {
      throw new Error('requestPage should not be called')
    },
  }
}

test('a successful empty policy result reports no applicable checks', async () => {
  const checks = await fetchPolicyEvaluationChecksSummary(
    createClient({ value: [] }),
    team,
    123,
    'project-id',
  )

  assert.equal(checks?.state, 'none')
  assert.equal(getChecksPresentation(checks).text, 'No applicable checks')
})

test('a policy permission failure reports checks unavailable with access guidance', async () => {
  const checks = await fetchPolicyEvaluationChecksSummary(
    createClient(new AdoAuthError(403)),
    team,
    123,
    'project-id',
  )

  assert.equal(checks?.state, 'unavailable')
  assert.equal(checks?.unavailableReason, 'access-denied')
  assert.match(getChecksPresentation(checks).text ?? '', /access denied; verify policy permissions/)
})

test('queued policy evaluations remain pending', async () => {
  const checks = await fetchPolicyEvaluationChecksSummary(
    createClient({
      value: [{
        status: 'queued',
        configuration: { type: { displayName: 'Build' } },
      }],
    }),
    team,
    123,
    'project-id',
  )

  assert.equal(checks?.state, 'pending')
  assert.equal(getChecksPresentation(checks).text, 'Build')
})
