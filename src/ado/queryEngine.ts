import type { TeamProfile } from '../teamProfiles'
import type { AdoRequestOptions } from './httpClient'
import { AdoHttpClient } from './httpClient'
import { WorkItemAssigneeResolver } from './assigneeResolver'
import { fetchIterationWindowInfo } from './teamIterationsApi'
import { fetchTeamMembers } from './teamMembersApi'
import { fetchUnlinkedActivePullRequestItems } from './teamPullRequestsApi'
import { fetchTeamSubjectDescriptor } from './teamSettingsApi'
import { fetchWorkItemsForCurrentAndNextIteration } from './workItemsApi'
import type { CurrentIterationInfo, IterationWindowInfo, ResolvedWorkItemAssignee, TeamMember, TeamMemberLookup, WorkItemSummary } from './types'

export type { CurrentIterationInfo, IterationWindowInfo, TeamMember, WorkItemSummary, ResolvedWorkItemAssignee } from './types'

export class AdoQueryEngine {
  private static readonly DEFAULT_CACHE_TTL_MS = 60_000

  private readonly client: AdoHttpClient
  private readonly assigneeResolver: WorkItemAssigneeResolver
  private readonly teamWorkItemsCache = new Map<string, WorkItemSummary[]>()
  private readonly teamMembersCache = new Map<string, { expiresAt: number; value: TeamMember[] }>()
  private readonly currentIterationCache = new Map<string, { expiresAt: number; value: IterationWindowInfo }>()
  private readonly teamSubjectDescriptorCache = new Map<string, { expiresAt: number; value: string | null }>()

  constructor(pat: string, defaultApiVersion = '7.1') {
    this.client = new AdoHttpClient(pat, defaultApiVersion)
    this.assigneeResolver = new WorkItemAssigneeResolver(this.client)
  }

  async getTeamMembers(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName'>,
    signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<TeamMember[]> {
    const cacheKey = team.id

    if (!options?.forceRefresh) {
      const cached = this.teamMembersCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value
      }
    }

    const members = await fetchTeamMembers(this.client, team, signal)
    this.teamMembersCache.set(cacheKey, {
      value: members,
      expiresAt: Date.now() + AdoQueryEngine.DEFAULT_CACHE_TTL_MS,
    })

    return members
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

  clearTeamMetadataCaches(
    team?: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>,
  ): void {
    if (!team) {
      this.teamMembersCache.clear()
      this.currentIterationCache.clear()
      this.teamSubjectDescriptorCache.clear()
      return
    }

    this.teamMembersCache.delete(team.id)
    this.currentIterationCache.delete(
      `${team.orgName.toLowerCase()}:${team.projectName.toLowerCase()}:${team.teamName.toLowerCase()}:${team.iterationPath.toLowerCase()}`,
    )
    this.teamSubjectDescriptorCache.delete(
      `${team.orgName.toLowerCase()}:${team.projectName.toLowerCase()}:${team.teamName.toLowerCase()}`,
    )
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
    options?: { forceRefresh?: boolean },
  ): Promise<string | null> {
    const cacheKey = `${team.orgName.toLowerCase()}:${team.projectName.toLowerCase()}:${team.teamName.toLowerCase()}`

    if (!options?.forceRefresh) {
      const cached = this.teamSubjectDescriptorCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value
      }
    }

    const descriptor = await fetchTeamSubjectDescriptor(this.client, team, signal)
    this.teamSubjectDescriptorCache.set(cacheKey, {
      value: descriptor,
      expiresAt: Date.now() + AdoQueryEngine.DEFAULT_CACHE_TTL_MS,
    })

    return descriptor
  }

  async getCurrentIterationInfo(
    team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>,
    signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<CurrentIterationInfo | null> {
    const iterationWindow = await this.getIterationWindowInfo(team, signal, options)
    return iterationWindow.current
  }

  async getIterationWindowInfo(
    team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>,
    signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<IterationWindowInfo> {
    const cacheKey = `${team.orgName.toLowerCase()}:${team.projectName.toLowerCase()}:${team.teamName.toLowerCase()}:${team.iterationPath.toLowerCase()}`

    if (!options?.forceRefresh) {
      const cached = this.currentIterationCache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value
      }
    }

    const currentIterationInfo = await fetchIterationWindowInfo(this.client, team, signal)
    this.currentIterationCache.set(cacheKey, {
      value: currentIterationInfo,
      expiresAt: Date.now() + AdoQueryEngine.DEFAULT_CACHE_TTL_MS,
    })

    return currentIterationInfo
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
