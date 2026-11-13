import type { TeamProfile } from '../appSettings'
import { QUICK_ASSIGN_PAT_FIX } from '../adoAuth'
import type { IdentityRef } from './identity'
import { AdoAuthError, AdoWriteError, type AdoRequestClient } from './httpClient'
import { parseWorkItemSummary, type WorkItemApiItem } from './workItemsApi'
import type { WorkItemSummary } from './types'
import type { TagRule } from './workItemStatus'
import { isQuickAssignable } from '../features/standup/utils/quickAssign'

export class AssignmentChangedError extends Error {
  constructor() {
    super('This work item changed or is no longer eligible. Nothing was assigned. Refresh the list and choose again.')
    this.name = 'AssignmentChangedError'
  }
}

/**
 * Azure DevOps answers a PAT without write scope with a 401 that lacks CORS headers, so the browser reports only a network
 * failure. This is raised when a re-read shows the write left the item untouched.
 */
export class AssignmentNotSavedError extends Error {
  constructor() {
    super(`Azure DevOps did not save the assignment and did not say why. This usually means your PAT is missing the Work Items (Read & write) scope. ${QUICK_ASSIGN_PAT_FIX} Nothing was assigned.`)
    this.name = 'AssignmentNotSavedError'
  }
}

/** True when the assignment failed because of PAT scope or permissions, so refreshing the list cannot help. */
export function isAssignmentAccessError(error: unknown): boolean {
  return error instanceof AdoAuthError || error instanceof AssignmentNotSavedError || (error instanceof AdoWriteError && error.accessDenied)
}

export async function assignWorkItem(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'areaPath'>,
  candidate: WorkItemSummary,
  developer: IdentityRef,
  tagRules: TagRule[],
): Promise<WorkItemSummary> {
  const uniqueName = developer.uniqueName?.trim()
  if (!uniqueName) throw new Error('This developer has no Azure DevOps account identifier. Refresh team members before assigning work.')
  const request = {
    orgName: team.orgName,
    path: `/${encodeURIComponent(team.projectName)}/_apis/wit/workitems/${candidate.id}`,
  }
  const before = await client.request<WorkItemApiItem>(request)
  const summary = parseWorkItemSummary(before, team)
  const area = before.fields?.['System.AreaPath']
  const inArea = typeof area === 'string' && (area.toLowerCase() === team.areaPath.toLowerCase() || area.toLowerCase().startsWith(`${team.areaPath.toLowerCase()}\\`))
  const rawAssignee = before.fields?.['System.AssignedTo']
  const emptyAssignee = rawAssignee == null || (typeof rawAssignee === 'string' && rawAssignee.trim() === '')
  if (!summary || summary.id !== candidate.id || !Number.isInteger(before.rev) || before.rev! < 1
    || !emptyAssignee || !inArea || !isQuickAssignable(summary, tagRules)
    || summary.iterationPath?.toLowerCase() !== candidate.iterationPath?.toLowerCase()) {
    throw new AssignmentChangedError()
  }
  const isAssigned = (item: WorkItemApiItem) =>
    parseWorkItemSummary(item, team)?.assignedTo?.uniqueName?.toLowerCase() === uniqueName.toLowerCase()
  let saved: WorkItemApiItem
  try {
    saved = await client.request<WorkItemApiItem>({
      ...request,
      method: 'PATCH',
      contentType: 'application/json-patch+json',
      body: [
        { op: 'test', path: '/rev', value: before.rev },
        { op: 'add', path: '/fields/System.AssignedTo', value: uniqueName },
      ],
    })
  } catch (error) {
    if (isAssignmentAccessError(error)) throw error
    if (error instanceof AdoWriteError) throw new Error(`${error.message} The item may have changed; the list will be refreshed.`)
    // A failed transport can follow a committed write. Never retry it; re-read the item to learn whether it was saved.
    const after = await client.request<WorkItemApiItem>(request).catch(() => null)
    if (after && isAssigned(after)) {
      saved = after
    } else if (after?.rev === before.rev) {
      throw new AssignmentNotSavedError()
    } else {
      throw new Error('The assignment result could not be confirmed. Refresh and verify the assignee in Azure DevOps before trying again.')
    }
  }
  const updated = parseWorkItemSummary(saved, team)
  if (!updated || updated.id !== candidate.id || !isAssigned(saved)) {
    throw new Error('Azure DevOps returned an unexpected assignment result. Refresh and verify the assignee before trying again.')
  }
  return { ...candidate, ...updated, activePullRequests: candidate.activePullRequests, linkedPullRequestIds: candidate.linkedPullRequestIds, workItemIconUrl: candidate.workItemIconUrl }
}
