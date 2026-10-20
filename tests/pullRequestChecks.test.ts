import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { AdoAuthError } = await server.ssrLoadModule('/src/ado/httpClient.ts')
const { fetchPolicyEvaluationChecksSummary } = await server.ssrLoadModule('/src/ado/policyEvaluationChecksApi.ts')
const { getChecksPresentation } = await server.ssrLoadModule('/src/features/standup/components/pullRequestChecksPresentation.ts')
const { PullRequestChecksRow } = await server.ssrLoadModule('/src/features/standup/components/PullRequestChecksRow.tsx')

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

test('unavailable check guidance wraps instead of being ellipsized', () => {
  const basePullRequest = {
    id: 123,
    title: 'Example pull request',
    url: '',
  }
  const unavailableHtml = renderToStaticMarkup(createElement(
    Root,
    null,
    createElement(PullRequestChecksRow, {
      pullRequest: {
        ...basePullRequest,
        checks: {
          state: 'unavailable',
          unavailableReason: 'access-denied',
          total: 0,
          passing: 0,
          pending: 0,
          failing: 0,
          failingNames: [],
          checks: [],
        },
      },
    }),
  ))
  const pendingHtml = renderToStaticMarkup(createElement(
    Root,
    null,
    createElement(PullRequestChecksRow, {
      pullRequest: {
        ...basePullRequest,
        checks: {
          state: 'pending',
          total: 1,
          passing: 0,
          pending: 1,
          failing: 0,
          failingNames: [],
          checks: [{ name: 'Build', state: 'pending', optional: false, expired: false, source: 'status' }],
        },
      },
    }),
  ))

  assert.match(unavailableHtml, /white-space:normal/)
  assert.match(pendingHtml, /white-space:nowrap/)
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
