import type { WorkItemPullRequestSummary } from './types'

export type PullRequestReviewerVote = {
  id?: string
  uniqueName?: string
  displayName?: string
  isContainer?: boolean
  vote?: number
}

function getDedupedReviewerVotes(reviewers: PullRequestReviewerVote[] | undefined): number[] {
  const dedupedReviewerVotes = new Map<string, number>()

  for (const reviewer of reviewers ?? []) {
    if (!reviewer || reviewer.isContainer === true) {
      continue
    }

    const vote = reviewer.vote
    if (typeof vote !== 'number') {
      continue
    }

    const reviewerKey = reviewer.id ?? reviewer.uniqueName ?? reviewer.displayName
    if (!reviewerKey) {
      continue
    }

    const previousVote = dedupedReviewerVotes.get(reviewerKey)
    if (previousVote === undefined || Math.abs(vote) > Math.abs(previousVote)) {
      dedupedReviewerVotes.set(reviewerKey, vote)
    }
  }

  return [...dedupedReviewerVotes.values()]
}

export function resolvePullRequestReviewState(
  reviewers: PullRequestReviewerVote[] | undefined,
): WorkItemPullRequestSummary['reviewState'] {
  const votes = getDedupedReviewerVotes(reviewers)

  if (votes.some((vote) => vote <= -10)) {
    return 'rejected'
  }

  if (votes.some((vote) => vote === -5)) {
    return 'waiting-for-author'
  }

  const approvalCount = votes.filter((vote) => vote >= 5).length
  if (approvalCount === 1) {
    return 'partially-approved'
  }

  if (approvalCount >= 2) {
    return 'fully-approved'
  }

  return undefined
}

export function resolvePullRequestApprovalCount(
  reviewers: PullRequestReviewerVote[] | undefined,
): number {
  return getDedupedReviewerVotes(reviewers).filter((vote) => vote >= 5).length
}
