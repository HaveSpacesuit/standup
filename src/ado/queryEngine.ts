import type { TeamProfile } from '../teamProfiles'
import type { AdoRequestOptions } from './httpClient'
import { AdoHttpClient } from './httpClient'
import { WorkItemAssigneeResolver } from './assigneeResolver'
import { fetchCurrentIterationInfo } from './teamIterationsApi'
import { fetchTeamMembers } from './teamMembersApi'
import { fetchUnlinkedActivePullRequestItems } from './teamPullRequestsApi'
import { fetchTeamSubjectDescriptor } from './teamSettingsApi'
import { fetchWorkItemsForCurrentAndNextIteration } from './workItemsApi'
import type { CurrentIterationInfo, ResolvedWorkItemAssignee, TeamMember, TeamMemberLookup, WorkItemSummary } from './types'

export type { CurrentIterationInfo, TeamMember, WorkItemSummary, ResolvedWorkItemAssignee } from './types'

export class AdoQueryEngine {
  private readonly client: AdoHttpClient
  private readonly assigneeResolver: WorkItemAssigneeResolver
  private readonly teamWorkItemsCache = new Map<string, WorkItemSummary[]>()

  constructor(pat: string, defaultApiVersion = '7.1') {
    this.client = new AdoHttpClient(pat, defaultApiVersion)
    this.assigneeResolver = new WorkItemAssigneeResolver(this.client)
  }

  async getTeamMembers(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName'>,
    signal?: AbortSignal,
  ): Promise<TeamMember[]> {
    return fetchTeamMembers(this.client, team, signal)
  }

  async getWorkItemsForCurrentAndNextIteration(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath' | 'iterationPath'>,
    signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<WorkItemSummary[]> {
    const cacheKey = team.id

    if (!options?.forceRefresh) {
      const cachedItems = this.teamWorkItemsCache.get(cacheKey)
      if (cachedItems) {
        return cachedItems
      }
    }

    const items = await fetchWorkItemsForCurrentAndNextIteration(this.client, team, signal)

    this.teamWorkItemsCache.set(cacheKey, items)

    return items
  }

  clearTeamWorkItemsCache(teamId?: string): void {
    if (teamId) {
      this.teamWorkItemsCache.delete(teamId)
      return
    }

    this.teamWorkItemsCache.clear()
  }

  async resolveWorkItemAssignee(
    orgName: string,
    teamMemberLookup: TeamMemberLookup,
    workItem: WorkItemSummary,
    signal?: AbortSignal,
  ): Promise<ResolvedWorkItemAssignee> {
    return this.assigneeResolver.resolveWorkItemAssignee(orgName, teamMemberLookup, workItem, signal)
  }

  async request<T>(options: AdoRequestOptions): Promise<T> {
    return this.client.request<T>(options)
  }

  async getTeamSubjectDescriptor(
    team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName'>,
    signal?: AbortSignal,
  ): Promise<string | null> {
    return fetchTeamSubjectDescriptor(this.client, team, signal)
  }

  async getCurrentIterationInfo(
    team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>,
    signal?: AbortSignal,
  ): Promise<CurrentIterationInfo | null> {
    return fetchCurrentIterationInfo(this.client, team, signal)
  }

  async getUnlinkedActivePullRequestItems(
    team: Pick<TeamProfile, 'orgName' | 'projectName' | 'repoName'>,
    members: TeamMember[],
    visibleWorkItems: WorkItemSummary[],
    currentIteration: CurrentIterationInfo | null,
    signal?: AbortSignal,
  ): Promise<WorkItemSummary[]> {
    return fetchUnlinkedActivePullRequestItems(
      this.client,
      team,
      members,
      visibleWorkItems,
      currentIteration,
      signal,
    )
  }
}
