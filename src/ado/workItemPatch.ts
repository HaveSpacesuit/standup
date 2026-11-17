import type { TeamProfile } from '../appSettings'
import type { IdentityRef } from './identity'
import { normalizeTags, type WorkItemFields } from './workItemUpdateApi'
import { resolveStatusFromStateAndTags, type WorkItemStatus } from './workItemStatus'

/** A work item's editable fields as Azure DevOps now has them, for every list that shows the item. */
export type WorkItemPatch = {
  id: number
  /** Work item IDs repeat across organizations, so the item's URL identifies it. */
  workItemUrl: string
  fields: WorkItemFields
  /** System.ChangedDate, when the patch comes from Azure DevOps. */
  changedAt?: string
  /** Shown while an edit saves, or to undo it after a failed save; Azure DevOps has not confirmed these fields. */
  preview?: boolean
}

/** Any list item that shows a work item's editable fields: board cards, backlog bugs and triage items. */
export type PatchableWorkItem = {
  id: number
  workItemUrl?: string
  title: string
  assignedTo?: IdentityRef
  iterationPath?: string
  state?: string
  tags?: string[]
  priority?: number
  severity?: string
  effort?: number
  sprintName?: string
  status?: WorkItemStatus
  recentActivityAt?: string
}

export function workItemUrlFor(team: Pick<TeamProfile, 'orgName' | 'projectName'>, id: number): string {
  return `https://dev.azure.com/${encodeURIComponent(team.orgName)}/${encodeURIComponent(team.projectName)}/_workitems/edit/${id}`
}

export function matchesWorkItemPatch(item: Pick<PatchableWorkItem, 'id' | 'workItemUrl'>, patch: Pick<WorkItemPatch, 'id' | 'workItemUrl'>): boolean {
  return item.id === patch.id && item.workItemUrl?.toLowerCase() === patch.workItemUrl.toLowerCase()
}

const lastPathSegment = (path: string | undefined) => path?.split('\\').filter(Boolean).at(-1)

/** The item with the patch's fields, re-deriving the sprint name and board status from them. */
export function patchWorkItem<T extends PatchableWorkItem>(item: T, patch: WorkItemPatch): T {
  const { fields } = patch
  const next: T = {
    ...item,
    title: fields.title,
    assignedTo: fields.assignedTo,
    iterationPath: fields.iterationPath,
    // A state cannot be cleared; an item read without one keeps what the list had.
    state: fields.state ?? item.state,
    tags: normalizeTags(fields.tags),
    priority: fields.priority,
    severity: fields.severity,
    effort: fields.effort,
  }
  if ('sprintName' in item || 'status' in item) next.sprintName = lastPathSegment(fields.iterationPath)
  // Board lists derive status with the default tag rules, like a fresh load; the board applies the team's rules on top.
  if ('status' in item) next.status = resolveStatusFromStateAndTags(next.state, next.tags?.join(';'))
  if (patch.changedAt && 'recentActivityAt' in item) next.recentActivityAt = patch.changedAt
  return next
}

/** The list with the patched item, or the same list when it does not hold the item. */
export function applyWorkItemPatch<T extends PatchableWorkItem>(items: T[], patch: WorkItemPatch): T[] {
  let changed = false
  const next = items.map((item) => {
    if (!matchesWorkItemPatch(item, patch)) return item
    changed = true
    return patchWorkItem(item, patch)
  })
  return changed ? next : items
}

/** The editable fields of a listed item, as the view shows them. */
export function getWorkItemFields(item: PatchableWorkItem): WorkItemFields {
  return {
    title: item.title,
    assignedTo: item.assignedTo,
    iterationPath: item.iterationPath,
    state: item.state,
    tags: item.tags ?? [],
    priority: item.priority,
    severity: item.severity,
    effort: item.effort,
  }
}
