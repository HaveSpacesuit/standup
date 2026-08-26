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

export type IterationTimeFrame = 'past' | 'current' | 'future'

export type TeamIterationOption = {
  name: string
  /** Full iteration path, e.g. "beconnect\\PW Web\\2026 11" — matches System.IterationPath. */
  path: string
  timeFrame: IterationTimeFrame
  startDate?: string
  finishDate?: string
}

export type WorkItemPullRequestSummary = {
  id: number
  repositoryId?: string
  title: string
  url: string
  iconUrl?: string
  approvalCount?: number
  reviewState?: 'rejected' | 'waiting-for-author' | 'partially-approved' | 'fully-approved'
  status?: string
  checks?: PullRequestChecksSummary
  recentActivityAt?: string
}

/** Shape of a Git pull request as returned by ADO's PR list/get endpoints — shared by every
 * call site that fetches PR details, so a new field only needs to be added in one place. */
export type PullRequestApiResponse = {
  pullRequestId?: number
  title?: string
  status?: string
  isDraft?: boolean
  creationDate?: string
  closedDate?: string
  createdBy?: unknown
  reviewers?: Array<{
    id?: string
    uniqueName?: string
    displayName?: string
    isContainer?: boolean
    vote?: number
  }>
  repository?: {
    id?: string
    name?: string
  }
  _links?: {
    web?: {
      href?: string
    }
  }
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
  createdBy?: IdentityRef
  status: WorkItemStatus
}

export type TeamMemberLookup = Record<string, string>

export type ResolvedWorkItemAssignee = {
  label: string
  kind: 'team-member' | 'unassigned'
}

export type WorkItemFieldUpdate = {
  oldValue?: unknown
  newValue?: unknown
}

export type WorkItemUpdateRelation = {
  rel?: string
  url?: string
}

export type WorkItemUpdate = {
  revisedDate?: string
  fields?: Record<string, WorkItemFieldUpdate>
  relations?: {
    added?: WorkItemUpdateRelation[]
    removed?: WorkItemUpdateRelation[]
    updated?: WorkItemUpdateRelation[]
  }
}

export type WorkItemUpdatesResponse = {
  value?: WorkItemUpdate[]
}
