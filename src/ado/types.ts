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

export type WorkItemPullRequestSummary = {
  id: number
  title: string
  url: string
  iconUrl?: string
  reviewState?: 'rejected' | 'waiting-for-author' | 'partially-approved' | 'fully-approved'
}

export type WorkItemSummary = {
  id: number
  title: string
  tags?: string[]
  sprintName?: string
  activePullRequests?: WorkItemPullRequestSummary[]
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
