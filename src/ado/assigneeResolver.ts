import { parseAssignedTo, toIdentityKeys, type IdentityRef } from './identity'
import type { TeamProfile } from '../appSettings'
import type { ResolvedWorkItemAssignee, TeamMemberLookup, WorkItemSummary, WorkItemUpdate } from './types'

/** Fetches (and, at the call site, caches) a work item's revision history — shared with every
 * other feature that needs `/updates` so a given item's history is only requested once. */
export type WorkItemUpdatesFetcher = (
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  workItemId: number,
  signal?: AbortSignal,
) => Promise<WorkItemUpdate[]>

export class WorkItemAssigneeResolver {
  private readonly fetchWorkItemUpdates: WorkItemUpdatesFetcher

  constructor(fetchWorkItemUpdates: WorkItemUpdatesFetcher) {
    this.fetchWorkItemUpdates = fetchWorkItemUpdates
  }

  async resolveWorkItemAssignee(
    team: Pick<TeamProfile, 'orgName' | 'projectName'>,
    teamMemberLookup: TeamMemberLookup,
    workItem: WorkItemSummary,
    signal?: AbortSignal,
  ): Promise<ResolvedWorkItemAssignee> {
    const currentIdentity = workItem.assignedTo

    if (!currentIdentity) {
      return {
        label: 'Unassigned',
        kind: 'unassigned',
      }
    }

    const currentMatch = this.matchTeamMember(teamMemberLookup, currentIdentity)
    if (currentMatch) {
      return {
        label: currentMatch,
        kind: 'team-member',
      }
    }

    const assignmentTrail = await this.getWorkItemAssignmentTrail(team, workItem.id, signal)

    for (const identity of assignmentTrail) {
      const match = this.matchTeamMember(teamMemberLookup, identity)
      if (match) {
        return {
          label: match,
          kind: 'team-member',
        }
      }
    }

    return {
      label: 'Unassigned',
      kind: 'unassigned',
    }
  }

  private matchTeamMember(teamMemberLookup: TeamMemberLookup, identity: IdentityRef): string | undefined {
    const keys = toIdentityKeys(identity)
    for (const key of keys) {
      const matched = teamMemberLookup[key]
      if (matched) {
        return matched
      }
    }

    return undefined
  }

  private async getWorkItemAssignmentTrail(
    team: Pick<TeamProfile, 'orgName' | 'projectName'>,
    workItemId: number,
    signal?: AbortSignal,
  ): Promise<IdentityRef[]> {
    const updates = await this.fetchWorkItemUpdates(team, workItemId, signal)

    return updates
      .map((update) => parseAssignedTo(update.fields?.['System.AssignedTo']?.newValue))
      .filter((value): value is IdentityRef => Boolean(value))
      .reverse()
  }
}
