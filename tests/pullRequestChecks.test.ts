import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())
const { AdoAuthError } = await server.ssrLoadModule('/src/ado/httpClient.ts')
const { fetchPullRequestPolicies } = await server.ssrLoadModule('/src/ado/policyEvaluationChecksApi.ts')
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
  const { checks, reviewPolicy } = await fetchPullRequestPolicies(
    createClient({ value: [] }),
    team,
    123,
    'project-id',
  )

  assert.equal(checks?.state, 'none')
  assert.deepEqual(reviewPolicy, { requiredApprovals: 0, state: 'passing' })
  assert.equal(getChecksPresentation(checks).text, 'No applicable checks')
})

test('a policy permission failure reports checks unavailable with access guidance', async () => {
  const { checks, reviewPolicy } = await fetchPullRequestPolicies(
    createClient(new AdoAuthError(403)),
    team,
    123,
    'project-id',
  )

  assert.equal(checks?.state, 'unavailable')
  assert.equal(reviewPolicy, undefined)
  assert.equal(checks?.unavailableReason, 'access-denied')
  assert.match(getChecksPresentation(checks).text ?? '', /access denied; verify policy permissions/)
})

for (const status of ['queued', 'running']) {
  test(`${status} policy evaluations remain pending`, async () => {
    const { checks } = await fetchPullRequestPolicies(
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

function reviewerPolicy(minimumApproverCount: number, status = 'approved', configuration = {}) {
  return {
    status,
    configuration: {
      isEnabled: true,
      isBlocking: true,
      type: { id: 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd' },
      settings: { minimumApproverCount },
      ...configuration,
    },
  }
}

test('review requirements use the strictest applicable minimum, not a sum or a fixed count', async () => {
  const { checks, reviewPolicy } = await fetchPullRequestPolicies(createClient({
    value: [
      reviewerPolicy(1),
      reviewerPolicy(3, 'rejected'),
      reviewerPolicy(10, 'notApplicable'),
      reviewerPolicy(9, 'rejected', { isBlocking: false }),
      reviewerPolicy(8, 'rejected', { isEnabled: false }),
      reviewerPolicy(7, 'rejected', { isDeleted: true }),
      policyEvaluation('approved'),
    ],
  }), team, 123, 'project-id')
  assert.deepEqual(reviewPolicy, { requiredApprovals: 3, state: 'failing' })
  assert.equal(checks.checks.length, 1, 'minimum approvals are not duplicated as build checks')
  assert.equal(checks.state, 'passing')
})

test('optional, disabled, deleted and path-excluded policies do not require approvals', async () => {
  const { reviewPolicy } = await fetchPullRequestPolicies(createClient({
    value: [
      reviewerPolicy(2, 'notApplicable'),
      reviewerPolicy(2, 'rejected', { isBlocking: false }),
      reviewerPolicy(2, 'rejected', { isEnabled: false }),
      reviewerPolicy(2, 'rejected', { isDeleted: true }),
    ],
  }), team, 123, 'project-id')
  assert.deepEqual(reviewPolicy, { requiredApprovals: 0, state: 'passing' })
})

test('review requirements retain the server evaluation even when the displayed vote count differs', async () => {
  for (const [status, state] of [['approved', 'passing'], ['queued', 'pending'], ['running', 'pending'], ['rejected', 'failing'], ['broken', 'failing']]) {
    const { reviewPolicy } = await fetchPullRequestPolicies(createClient({
      value: [reviewerPolicy(1, status)],
    }), team, 123, 'project-id')
    assert.deepEqual(reviewPolicy, { requiredApprovals: 1, state })
  }
})

test('unreadable policy results and invalid reviewer settings never mean zero required', async () => {
  for (const response of [
    new Error('request failed'),
    {},
    { value: [reviewerPolicy(-1)] },
    { value: [reviewerPolicy(1.5)] },
    { value: [reviewerPolicy(2, 'approved', { settings: {} })] },
    { value: [reviewerPolicy(2, 'approved', { type: { displayName: 'Required reviewers' }, settings: {} })] },
    { value: [reviewerPolicy(-1, 'approved', { type: { displayName: 'Required reviewers' } })] },
  ]) {
    const { reviewPolicy } = await fetchPullRequestPolicies(createClient(response), team, 123, 'project-id')
    assert.equal(reviewPolicy, undefined)
  }
  const result = await fetchPullRequestPolicies(createClient({ value: [] }), team, 123, null)
  assert.equal(result.reviewPolicy, undefined)
  assert.equal(result.checks.state, 'unavailable')
})

test('required reviewer groups expose their configured approval count and evaluation status', async () => {
  for (const requiredApprovals of [1, 2, 3]) {
    for (const [status, state] of [['approved', 'passing'], ['rejected', 'failing'], ['running', 'pending']]) {
      const { reviewPolicy } = await fetchPullRequestPolicies(createClient({
        value: [reviewerPolicy(requiredApprovals, status, {
          type: { id: 'fd2167ab-b0be-447a-8ec8-39368250530e', displayName: 'Required reviewers' },
          settings: { minimumApproverCount: requiredApprovals, requiredReviewerIds: ['reviewer-group'] },
        })],
      }), team, 123, 'project-id')
      assert.deepEqual(reviewPolicy, { requiredApprovals, state })
    }
  }
})

test('non-applicable and optional group review requirements leave no minimum', async () => {
  const { reviewPolicy } = await fetchPullRequestPolicies(createClient({
    value: [
      reviewerPolicy(2, 'notApplicable', { type: { displayName: 'Required reviewers' } }),
      reviewerPolicy(2, 'rejected', { type: { displayName: 'Required reviewers' }, isBlocking: false }),
    ],
  }), team, 123, 'project-id')
  assert.deepEqual(reviewPolicy, { requiredApprovals: 0, state: 'passing' })
})

test('required individuals without an explicit minimum each require approval', async () => {
  const { checks, reviewPolicy } = await fetchPullRequestPolicies(createClient({
    value: [{
      status: 'rejected',
      configuration: {
        isBlocking: true,
        type: { id: 'fd2167ab-b0be-447a-8ec8-39368250530e' },
        settings: { requiredReviewerIds: ['reviewer-one', 'reviewer-two', 'reviewer-one'] },
      },
    }],
  }), team, 123, 'project-id')
  assert.equal(checks.state, 'none')
  assert.deepEqual(reviewPolicy, { requiredApprovals: 2, state: 'failing' })
})

test('named reviewer requirements combine with the minimum policy and ignore optional or excluded reviewers', async () => {
  for (const [status, configuration, state, requiredApprovals] of [
    ['approved', {}, 'passing', 2],
    ['running', {}, 'pending', 2],
    ['rejected', {}, 'failing', 2],
    ['rejected', { isBlocking: false }, 'passing', 1],
    ['notApplicable', {}, 'passing', 1],
  ] as const) {
    const { reviewPolicy } = await fetchPullRequestPolicies(createClient({
      value: [
        reviewerPolicy(1),
        {
          status,
          configuration: {
            isBlocking: true,
            type: { displayName: 'Required reviewers' },
            settings: { minimumApproverCount: 2, requiredReviewerIds: ['reviewer-group'] },
            ...configuration,
          },
        },
      ],
    }), team, 123, 'project-id')
    assert.deepEqual(reviewPolicy, { requiredApprovals, state })
  }
})

for (const status of ['notApplicable', ' NOTAPPLICABLE ']) {
  for (const isBlocking of [true, false]) {
    test(`${status} policy (blocking: ${isBlocking}) is neutral and terminal`, async () => {
      const { checks } = await fetchPullRequestPolicies(
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
      const { checks } = await fetchPullRequestPolicies(
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
