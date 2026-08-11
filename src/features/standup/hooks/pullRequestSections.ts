import type { WorkItemSummary } from '../../../ado/queryEngine'

type MergeReadiness = 'blocked' | 'waiting-on-checks' | 'waiting-on-reviewers' | 'ready-to-merge'

export type PullRequestSection = {
  key: string
  title: string
  items: WorkItemSummary[]
}

function getRequiredChecksState(item: WorkItemSummary): 'passing' | 'pending' | 'failing' {
  const checks = item.pullRequest?.checks?.checks ?? []
  const requiredChecks = checks.filter((check) => !check.optional)

  if (requiredChecks.some((check) => check.state === 'failing')) {
    return 'failing'
  }

  if (requiredChecks.some((check) => check.state === 'pending')) {
    return 'pending'
  }

  return 'passing'
}

function getMergeReadiness(item: WorkItemSummary, fullApprovalThreshold: number): MergeReadiness {
  const reviewState = item.pullRequest?.reviewState
  const approvalCount = item.pullRequest?.approvalCount ?? 0
  const requiredChecksState = getRequiredChecksState(item)

  if (
    requiredChecksState === 'failing'
    || reviewState === 'rejected'
    || reviewState === 'waiting-for-author'
  ) {
    return 'blocked'
  }

  if (requiredChecksState === 'pending') {
    return 'waiting-on-checks'
  }

  if (approvalCount < fullApprovalThreshold) {
    return 'waiting-on-reviewers'
  }

  return 'ready-to-merge'
}

export function getPullRequestSections(
  pullRequests: WorkItemSummary[],
  fullApprovalThreshold: number,
): PullRequestSection[] {
  const readyToMerge = pullRequests.filter((item) => getMergeReadiness(item, fullApprovalThreshold) === 'ready-to-merge')
  const waitingOnChecks = pullRequests.filter((item) => getMergeReadiness(item, fullApprovalThreshold) === 'waiting-on-checks')
  const waitingOnReviewers = pullRequests.filter((item) => getMergeReadiness(item, fullApprovalThreshold) === 'waiting-on-reviewers')
  const blocked = pullRequests.filter((item) => getMergeReadiness(item, fullApprovalThreshold) === 'blocked')

  return [
    { key: 'ready-to-merge', title: 'Ready to merge', items: readyToMerge },
    { key: 'waiting-on-checks', title: 'Waiting on checks', items: waitingOnChecks },
    { key: 'waiting-on-reviewers', title: 'Waiting on reviewers', items: waitingOnReviewers },
    { key: 'blocked', title: 'Blocked', items: blocked },
  ].filter((section) => section.items.length > 0)
}
