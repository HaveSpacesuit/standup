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
  repositoryName?: string
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

export type PullRequestCheckState = 'passing' | 'pending' | 'failing' | 'skipped'

export type PullRequestChecksAggregateState = PullRequestCheckState | 'none' | 'unavailable'

export type PullRequestCheckDetail = {
  name: string
  state: PullRequestCheckState
  optional: boolean
  expired: boolean
  source: 'status' | 'build' | 'policy-derived'
}

export type PullRequestChecksSummary = {
  state: PullRequestChecksAggregateState
  unavailableReason?: 'access-denied' | 'request-failed'
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
  /** Raw Severity picklist text, e.g. "2 - High", used by QA attention ranking. */
  severity?: string
  priority?: number
  tags?: string[]
  sprintName?: string
  iterationPath?: string
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

/** A Bug listed on the Backlog page, carrying the raw fields its value score is computed from. */
export type BacklogBug = {
  id: number
  title: string
  /** Tags in the order the Title column lists them (alphabetical, ignoring case, like the board). */
  tags?: string[]
  state?: string
  createdAt?: string
  assignedTo?: IdentityRef
  iterationPath?: string
  /** Raw Severity picklist text, e.g. "2 - High". */
  severity?: string
  /** Priority field (1-4); the Backlog page presents it as the bug's impact. */
  priority?: number
  effort?: number
  workItemUrl: string
}

export type ResolvedWorkItemAssignee = {
  label: string
  kind: 'team-member' | 'unassigned' | 'history-unavailable'
}

export type TriageTextField = 'reproSteps' | 'acceptanceCriteria' | 'description'

/** Something that happened to a work item: when, and who did it. */
export type TriageEvent = { at: string; by?: IdentityRef }

/** What the item's revision history says about how it arrived in triage. */
export type TriageHistory = {
  /** When each tag the item has now, lower-cased, was last added. */
  tagsAdded: Record<string, TriageEvent>
  /** When the item last moved into its current state; its creation if it never moved. */
  stateSince?: TriageEvent
}

export type TriageItem = {
  id: number
  title: string
  workItemType: string
  workItemIconUrl?: string
  state: string
  /** Whether the state is the first one its type is filed in, such as New. */
  inInitialState?: boolean
  createdAt?: string
  assignedTo?: IdentityRef
  createdBy?: IdentityRef
  severity?: string
  priority?: number
  effort?: number
  iterationPath?: string
  tags: string[]
  /** Whether each rich-text field has content; a field left out is treated as empty. */
  filledText?: Partial<Record<TriageTextField, boolean>>
  reasons: string[]
  workItemUrl: string
  parent?: { id: number; title?: string; workItemUrl: string; unavailable: boolean }
  /** Missing when the history could not be loaded; ages then count from the item's creation. */
  history?: TriageHistory
  /** The newest comment, as plain text, for spotting replies on items waiting on others. */
  latestComment?: TriageEvent & { text: string }
}

export type TriageResult = {
  items: TriageItem[]
  warnings: string[]
  /** Opens the same rules as an Azure DevOps query, for edits the page cannot make. */
  queryUrl?: string
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
  revisedBy?: IdentityRef
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
