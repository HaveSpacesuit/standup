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
  title: string
  url: string
  iconUrl?: string
  reviewState?: 'rejected' | 'waiting-for-author' | 'partially-approved' | 'fully-approved'
}

export type WorkItemSummary = {
  id: number
  kind?: 'work-item' | 'pull-request'
  title: string
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
