import type { TeamProfile } from '../appSettings'
import type { AdoRequestClient } from './httpClient'
import type { PullRequestCheckDetail, WorkItemPullRequestSummary } from './types'

type PolicyEvaluationListResponse = {
  value?: PolicyEvaluationApiResponse[]
}

type PolicyEvaluationApiResponse = {
  status?: string
  configuration?: {
    isBlocking?: boolean
    type?: {
      displayName?: string
    }
    settings?: {
      displayName?: string
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

const CHECK_STATE_RANK: Record<'passing' | 'pending' | 'failing', number> = {
  passing: 0,
  pending: 1,
  failing: 2,
}

function normalizePolicyEvaluationState(statusValue: string | undefined): 'passing' | 'pending' | 'failing' {
  const normalizedStatus = statusValue?.trim().toLowerCase()
  if (normalizedStatus === 'approved') {
    return 'passing'
  }

  if (normalizedStatus === 'rejected' || normalizedStatus === 'broken') {
    return 'failing'
  }

  if (normalizedStatus === 'queued' || normalizedStatus === 'running' || normalizedStatus === 'notapplicable') {
    return 'pending'
  }

  return 'pending'
}

function resolvePolicyEvaluationCheckState(
  evaluation: PolicyEvaluationApiResponse,
): 'passing' | 'pending' | 'failing' {
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
): WorkItemPullRequestSummary['checks'] {
  if (checks.length === 0) {
    return {
      state: 'pending',
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
  const state = failing > 0 ? 'failing' : pending > 0 ? 'pending' : 'passing'

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

export async function fetchProjectId(
  client: AdoRequestClient,
  orgName: string,
  projectName: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const response = await client.request<ProjectApiResponse>({
      method: 'GET',
      orgName,
      path: `/_apis/projects/${encodeURIComponent(projectName)}`,
      params: {
        'api-version': '7.1',
      },
      signal,
    })

    const projectId = response.id?.trim()
    return projectId || null
  } catch {
    return null
  }
}

export async function fetchPolicyEvaluationChecksSummary(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  pullRequestId: number,
  projectId: string,
  signal?: AbortSignal,
): Promise<WorkItemPullRequestSummary['checks'] | null> {
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

    const checksByName = new Map<string, PullRequestCheckDetail>()
    for (const evaluation of response.value ?? []) {
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

    if (checksByName.size === 0) {
      return null
    }

    return resolvePullRequestChecksSummary([...checksByName.values()])
  } catch {
    return null
  }
}
