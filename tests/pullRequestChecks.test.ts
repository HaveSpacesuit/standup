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

test('required check states are announced and unavailable guidance wraps instead of being ellipsized', () => {
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
  const failingHtml = renderToStaticMarkup(createElement(
    Root,
    null,
    createElement(PullRequestChecksRow, {
      pullRequest: {
        ...basePullRequest,
        checks: {
          state: 'failing',
          total: 1,
          passing: 0,
          pending: 0,
          failing: 1,
          failingNames: ['Build'],
          checks: [{ name: 'Build', state: 'failing', optional: false, expired: false, source: 'status' }],
        },
      },
    }),
  ))

  assert.match(unavailableHtml, /white-space:normal/)
  assert.match(pendingHtml, /white-space:nowrap/)
  assert.match(pendingHtml, /Required checks pending: Build/)
  assert.match(failingHtml, /Required checks failing: Build/)
})

for (const status of ['queued', 'running']) {
  test(`${status} policy evaluations remain pending`, async () => {
    const checks = await fetchPolicyEvaluationChecksSummary(
      createClient({
        value: [{
          status,
          configuration: { type: { displayName: 'Build' } },
        }],
      }),
      team,
      123,
      'project-id',
    )

    assert.equal(checks?.state, 'pending')
    assert.equal(getChecksPresentation(checks).text, 'Required checks pending: Build')
    assert.equal(getChecksPresentation(checks).color, 'warning.main')
  })
}

function policyEvaluation(status: string, name = 'QA Build validation', isBlocking = true) {
  return {
    status,
    configuration: {
      isBlocking,
      type: { displayName: 'Build' },
      settings: { displayName: name },
    },
  }
}

for (const status of ['notApplicable', ' NOTAPPLICABLE ']) {
  for (const isBlocking of [true, false]) {
    test(`${status} policy (blocking: ${isBlocking}) is neutral and terminal`, async () => {
      const checks = await fetchPolicyEvaluationChecksSummary(
        createClient({ count: 1, value: [policyEvaluation(status, undefined, isBlocking)] }),
        team,
        123,
        'project-id',
      )

      assert.equal(checks.state, 'skipped')
      assert.equal(checks.total, 1)
      assert.equal(checks.pending, 0)
      assert.equal(checks.passing, 0)
      assert.equal(checks.failing, 0)
      assert.equal(checks.checks[0].state, 'skipped')
      const presentation = getChecksPresentation(checks)
      assert.equal(presentation.color, 'text.secondary')
      assert.equal(presentation.text, 'Not applicable: QA Build validation')
      assert.notEqual(presentation.iconHref, getChecksPresentation({
        ...checks,
        checks: [{ ...checks.checks[0], state: 'pending', optional: false }],
      }).iconHref)

      const html = renderToStaticMarkup(createElement(
        Root,
        null,
        createElement(PullRequestChecksRow, {
          pullRequest: { id: 123, title: 'Example', url: '', checks },
        }),
      ))
      assert.match(html, /Not applicable: QA Build validation/)
      assert.doesNotMatch(html, /Required checks passing/)
    })
  }
}

for (const [status, expectedState] of [
  ['approved', 'passing'],
  ['running', 'pending'],
  ['rejected', 'failing'],
  ['broken', 'failing'],
] as const) {
  test(`skipped policies do not mask ${status} checks`, async () => {
    for (const duplicateName of [true, false]) {
      const checks = await fetchPolicyEvaluationChecksSummary(
        createClient({
          value: [
            policyEvaluation('notApplicable'),
            policyEvaluation(status, duplicateName ? undefined : 'Other build'),
            policyEvaluation('notApplicable'),
          ],
        }),
        team,
        123,
        'project-id',
      )

      assert.equal(checks.state, expectedState)
      assert.equal(checks.total, duplicateName ? 1 : 2)
      assert.equal(checks.checks.find((check: { state: string }) => check.state !== 'skipped')?.state, expectedState)
      const presentation = getChecksPresentation(checks)
      assert.equal(presentation.color, expectedState === 'passing'
        ? 'success.main'
        : expectedState === 'pending' ? 'warning.main' : 'error.main')
      if (expectedState === 'pending' || expectedState === 'failing') {
        assert.equal(presentation.text, `Required checks ${expectedState}: ${duplicateName ? 'QA Build validation' : 'Other build'}`)
      }
      if (!duplicateName) {
        assert.ok(presentation.optionalItems.some((item: { text: string, color: string }) =>
          item.text === 'Not applicable: QA Build validation' && item.color === 'text.secondary'))
      }
    }
  })
}
