import { parseAssignedTo, toIdentityKeys, type IdentityRef } from './identity'
import type { AdoRequestClient } from './httpClient'
import type { ResolvedWorkItemAssignee, TeamMemberLookup, WorkItemSummary } from './types'

type WorkItemUpdatesResponse = {
  count: number
  value: WorkItemUpdateApiItem[]
}

type WorkItemUpdateApiItem = {
  fields?: {
    'System.AssignedTo'?: {
      newValue?: unknown
    }
  }
}

export class WorkItemAssigneeResolver {
  private readonly client: AdoRequestClient
  private readonly workItemAssignmentTrailCache = new Map<string, IdentityRef[]>()

  constructor(client: AdoRequestClient) {
    this.client = client
  }

  async resolveWorkItemAssignee(
    orgName: string,
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

    const assignmentTrail = await this.getWorkItemAssignmentTrail(orgName, workItem.id, signal)

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
    orgName: string,
    workItemId: number,
    signal?: AbortSignal,
  ): Promise<IdentityRef[]> {
    const cacheKey = `${orgName}:${workItemId}`
    const cachedTrail = this.workItemAssignmentTrailCache.get(cacheKey)
    if (cachedTrail) {
      return cachedTrail
    }

    const updatesResponse = await this.client.request<WorkItemUpdatesResponse>({
      path: `/_apis/wit/workItems/${workItemId}/updates`,
      params: {
        'api-version': '7.1',
      },
      orgName,
      signal,
    })

    const trail = (updatesResponse.value ?? [])
      .map((update) => parseAssignedTo(update.fields?.['System.AssignedTo']?.newValue))
      .filter((value): value is IdentityRef => Boolean(value))
      .reverse()

    this.workItemAssignmentTrailCache.set(cacheKey, trail)
    return trail
  }
}
