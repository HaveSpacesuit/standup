import type { TeamProfile } from '../appSettings'
import { AdoAuthError, type AdoRequestClient } from './httpClient'
import type { PullRequestCheckDetail, PullRequestCheckState, WorkItemPullRequestSummary } from './types'

type PolicyEvaluationListResponse = {
  value?: PolicyEvaluationApiResponse[]
}

type PolicyEvaluationApiResponse = {
  status?: string
  configuration?: {
    isBlocking?: boolean
    isEnabled?: boolean
    isDeleted?: boolean
    type?: {
      id?: string
      displayName?: string
    }
    settings?: {
      displayName?: string
      minimumApproverCount?: number
      requiredReviewerIds?: string[]
    }
  }
  context?: {
    isExpired?: boolean
    buildId?: number
    build?: {
      definition?: {
        name?: string
      }
    }
  }
}

type ProjectApiResponse = {
  id?: string
}

const INCLUDED_POLICY_TYPES = new Set([
  'build',
  'comment requirements',
  'work item linking',
  'status',
])

const MINIMUM_REVIEWERS_POLICY_ID = 'fa4e907d-c16b-4a4c-9dfa-4906e5d171dd'
const REQUIRED_REVIEWERS_POLICY_ID = 'fd2167ab-b0be-447a-8ec8-39368250530e'

function resolveReviewPolicy(
  evaluations: PolicyEvaluationApiResponse[],
): WorkItemPullRequestSummary['reviewPolicy'] {
  let requiredApprovals = 0
  let state: 'passing' | 'pending' | 'failing' = 'passing'
  for (const evaluation of evaluations) {
    const configuration = evaluation.configuration
    const typeId = configuration?.type?.id?.toLowerCase()
    const typeName = configuration?.type?.displayName?.trim().toLowerCase()
    const isMinimumReviewers = typeId === MINIMUM_REVIEWERS_POLICY_ID || typeName === 'minimum number of reviewers'
    const isRequiredReviewers = typeId === REQUIRED_REVIEWERS_POLICY_ID || typeName === 'required reviewers'
    if (!isMinimumReviewers && !isRequiredReviewers) {
      continue
    }
    const evaluationState = normalizePolicyEvaluationState(evaluation.status)
    if (configuration?.isBlocking === false || configuration?.isEnabled === false
      || configuration?.isDeleted === true || evaluationState === 'skipped') {
      continue
    }
    const settings = configuration?.settings
    const requiredReviewerCount = isRequiredReviewers
      ? new Set(settings?.requiredReviewerIds?.map((id) => id.trim().toLowerCase()).filter(Boolean)).size
      : 0
    // Required-reviewer policies also carry a minimum when one group must supply multiple approvals.
    const minimum = settings?.minimumApproverCount
      ?? (requiredReviewerCount > 0 ? requiredReviewerCount : undefined)
    if (typeof minimum !== 'number' || !Number.isSafeInteger(minimum) || minimum < 0) {
      return undefined
    }
    requiredApprovals = Math.max(requiredApprovals, minimum, requiredReviewerCount)
    if (CHECK_STATE_RANK[evaluationState] > CHECK_STATE_RANK[state]) {
      state = evaluationState
    }
  }
  return { requiredApprovals, state }
}

const CHECK_STATE_RANK: Record<PullRequestCheckState, number> = {
  skipped: -1,
  passing: 0,
  pending: 1,
  failing: 2,
}

function normalizePolicyEvaluationState(statusValue: string | undefined): PullRequestCheckState {
  const normalizedStatus = statusValue?.trim().toLowerCase()
  if (normalizedStatus === 'approved') {
    return 'passing'
  }

  if (normalizedStatus === 'rejected' || normalizedStatus === 'broken') {
    return 'failing'
  }

  if (normalizedStatus === 'notapplicable') {
    return 'skipped'
  }

  return 'pending'
}

function resolvePolicyEvaluationCheckState(
  evaluation: PolicyEvaluationApiResponse,
): PullRequestCheckState {
  const normalizedStatus = evaluation.status?.trim().toLowerCase()

  // Policy checks can report "queued" when a previously passing run has expired.
  // Surface this as passing while still tagging it as expired in the UI.
  if (
    normalizedStatus === 'queued'
    && evaluation.context?.isExpired === true
    && typeof evaluation.context?.buildId === 'number'
  ) {
    return 'passing'
  }

  return normalizePolicyEvaluationState(evaluation.status)
}

function shouldIncludePolicyEvaluationType(policyType: string): boolean {
  return INCLUDED_POLICY_TYPES.has(policyType.trim().toLowerCase())
}

function upsertCheck(
  checksByName: Map<string, PullRequestCheckDetail>,
  nextCheck: PullRequestCheckDetail,
): void {
  const normalizedName = nextCheck.name.trim().toLowerCase()
  if (!normalizedName) {
    return
  }

  const existing = checksByName.get(normalizedName)
  if (!existing || CHECK_STATE_RANK[nextCheck.state] > CHECK_STATE_RANK[existing.state]) {
    checksByName.set(normalizedName, nextCheck)
  }
}

function resolvePullRequestChecksSummary(
  checks: PullRequestCheckDetail[],
): NonNullable<WorkItemPullRequestSummary['checks']> {
  if (checks.length === 0) {
    return {
      state: 'none',
      total: 0,
      passing: 0,
      pending: 0,
      failing: 0,
      failingNames: [],
      checks: [],
    }
  }

  const passing = checks.filter((check) => check.state === 'passing').length
  const pending = checks.filter((check) => check.state === 'pending').length
  const failingChecks = checks.filter((check) => check.state === 'failing')
  const failing = failingChecks.length
  const failingNames = failingChecks.map((check) => check.name)
  const state = failing > 0 ? 'failing' : pending > 0 ? 'pending' : passing > 0 ? 'passing' : 'skipped'

  return {
    state,
    total: checks.length,
    passing,
    pending,
    failing,
    failingNames,
    checks,
  }
}

function unavailableChecksSummary(
  unavailableReason: NonNullable<WorkItemPullRequestSummary['checks']>['unavailableReason'],
): NonNullable<WorkItemPullRequestSummary['checks']> {
  return {
    state: 'unavailable',
    unavailableReason,
    total: 0,
    passing: 0,
    pending: 0,
    failing: 0,
    failingNames: [],
    checks: [],
  }
}

// Project IDs never change for the life of an org/project pair, so a single in-memory
// cache is safe to share across every call site (linked PRs, unlinked PRs, etc.).
const projectIdCache = new Map<string, Promise<string | null>>()

export async function fetchProjectId(
  client: AdoRequestClient,
  orgName: string,
  projectName: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const cacheKey = `${orgName.toLowerCase()}:${projectName.toLowerCase()}`

  const cached = projectIdCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const fetchPromise = client
    .request<ProjectApiResponse>({
      method: 'GET',
      orgName,
      path: `/_apis/projects/${encodeURIComponent(projectName)}`,
      params: {
        'api-version': '7.1',
      },
      signal,
    })
    .then((response) => response.id?.trim() || null)
    .catch(() => {
      projectIdCache.delete(cacheKey)
      return null
    })

  projectIdCache.set(cacheKey, fetchPromise)
  return fetchPromise
}

export async function fetchPullRequestPolicies(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  pullRequestId: number,
  projectId: string | null,
  signal?: AbortSignal,
): Promise<Pick<WorkItemPullRequestSummary, 'checks' | 'reviewPolicy'>> {
  if (!projectId) {
    return { checks: unavailableChecksSummary('request-failed') }
  }

  const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectId}/${pullRequestId}`

  try {
    const response = await client.request<PolicyEvaluationListResponse>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/_apis/policy/evaluations`,
      params: {
        'api-version': '7.1-preview.1',
        artifactId,
      },
      signal,
    })

    if (!Array.isArray(response.value)) {
      return { checks: unavailableChecksSummary('request-failed') }
    }

    const checksByName = new Map<string, PullRequestCheckDetail>()
    for (const evaluation of response.value) {
      if (evaluation.configuration?.isEnabled === false || evaluation.configuration?.isDeleted === true) {
        continue
      }
      const policyType = evaluation.configuration?.type?.displayName?.trim() || 'Policy'
      if (!shouldIncludePolicyEvaluationType(policyType)) {
        continue
      }

      const checkName = evaluation.context?.build?.definition?.name?.trim()
        || evaluation.configuration?.settings?.displayName?.trim()
        || policyType

      upsertCheck(checksByName, {
        name: checkName,
        state: resolvePolicyEvaluationCheckState(evaluation),
        optional: evaluation.configuration?.isBlocking === false,
        expired: evaluation.context?.isExpired === true,
        source: 'policy-derived',
      })
    }

    return {
      checks: resolvePullRequestChecksSummary([...checksByName.values()]),
      reviewPolicy: resolveReviewPolicy(response.value),
    }
  } catch (error) {
    if (signal?.aborted) {
      throw error
    }

    return { checks: unavailableChecksSummary(error instanceof AdoAuthError && error.status === 403
      ? 'access-denied'
      : 'request-failed') }
  }
}
