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

export type WorkItemSummary = {
  id: number
  title: string
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
