import type { IdentityRef } from './identity'
import type { WorkItemStatus } from './workItemStatus'

export type TeamMember = {
  id?: string
  isTeamAdmin?: boolean
  displayName: string
  uniqueName?: string
  imageUrl?: string
  descriptor?: string
}

export type IterationInfo = {
  name: string
  fullName: string
  startDate?: string
  finishDate?: string
}

export type CurrentIterationInfo = IterationInfo

export type IterationWindowInfo = {
  current: IterationInfo | null
  next: IterationInfo | null
}

export type WorkItemPullRequestSummary = {
  id: number
  repositoryId?: string
  title: string
  url: string
  iconUrl?: string
  approvalCount?: number
  reviewState?: 'rejected' | 'waiting-for-author' | 'partially-approved' | 'fully-approved'
  checks?: PullRequestChecksSummary
}

export type PullRequestChecksAggregateState = 'passing' | 'pending' | 'failing'

export type PullRequestCheckState = PullRequestChecksAggregateState

export type PullRequestCheckDetail = {
  name: string
  state: PullRequestCheckState
  optional: boolean
  expired: boolean
  source: 'status' | 'build' | 'policy-derived'
}

export type PullRequestChecksSummary = {
  state: PullRequestChecksAggregateState
  total: number
  passing: number
  pending: number
  failing: number
  failingNames: string[]
  checks: PullRequestCheckDetail[]
}

export type WorkItemSummary = {
  id: number
  kind?: 'work-item' | 'pull-request'
  title: string
  createdAt?: string
  state?: string
  recentActivityAt?: string
  tags?: string[]
  sprintName?: string
  activePullRequests?: WorkItemPullRequestSummary[]
  linkedPullRequestIds?: number[]
  pullRequest?: WorkItemPullRequestSummary
  workItemUrl?: string
  effort?: number
  workItemType?: string
  workItemIconUrl?: string
  assignedTo?: IdentityRef
  status: WorkItemStatus
}

export type TeamMemberLookup = Record<string, string>

export type ResolvedWorkItemAssignee = {
  label: string
  kind: 'team-member' | 'unassigned'
}
