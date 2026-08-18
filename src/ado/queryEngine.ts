import type { TeamProfile } from '../teamProfiles'
import type { AdoRequestOptions } from './httpClient'
import { AdoHttpClient } from './httpClient'
import { WorkItemAssigneeResolver } from './assigneeResolver'
import { fetchIterationWindowInfo } from './teamIterationsApi'
import { fetchTeamMembers } from './teamMembersApi'
import { fetchUnlinkedActivePullRequestItems } from './teamPullRequestsApi'
import { fetchTeamSubjectDescriptor } from './teamSettingsApi'
import { fetchQualityAssuranceRawData, fetchWorkItemsForCurrentAndNextIteration } from './workItemsApi'
import { fetchProjectWorkItemTypeInfo, type ProjectWorkItemState } from './workItemTypesApi'
import type { CurrentIterationInfo, IterationWindowInfo, ResolvedWorkItemAssignee, TeamMember, TeamMemberLookup, WorkItemSummary } from './types'
import type { QualityAssuranceBucket } from '../features/standup/utils/qualityAssuranceBuckets'
import { bucketQualityAssuranceItems, resolveQualityAssuranceProjectConfig } from '../features/standup/utils/qualityAssuranceBuckets'
import type { QualityAssuranceRawData } from './workItemsApi'

export type { CurrentIterationInfo, IterationWindowInfo, TeamMember, WorkItemSummary, WorkItemPullRequestSummary, ResolvedWorkItemAssignee } from './types'
export type { ProjectWorkItemState } from './workItemTypesApi'


export class AdoQueryEngine {
  private static readonly DEFAULT_CACHE_TTL_MS = 60_000

  private readonly client: AdoHttpClient
  private readonly assigneeResolver: WorkItemAssigneeResolver
  private readonly teamWorkItemsCache = new Map<string, WorkItemSummary[]>()
  private readonly qaRawDataCache = new Map<string, QualityAssuranceRawData>()
  private readonly teamMembersCache = new Map<string, { expiresAt: number; value: TeamMember[] }>()
  private readonly currentIterationCache = new Map<string, { expiresAt: number; value: IterationWindowInfo }>()
  private readonly teamSubjectDescriptorCache = new Map<string, { expiresAt: number; value: string | null }>()
  private readonly projectWorkItemStatesCache = new Map<string, { expiresAt: number; value: { states: ProjectWorkItemState[]; workItemTypes: string[] } }>()

  constructor(pat: string, defaultApiVersion = '7.1') {
    this.client = new AdoHttpClient(pat, defaultApiVersion)
    this.assigneeResolver = new WorkItemAssigneeResolver(this.client)
  }

  private async getProjectWorkItemTypeInfo(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName'>,
    signal?: AbortSignal,
  ): Promise<{ states: ProjectWorkItemState[]; workItemTypes: string[] }> {
    const cacheKey = `${team.orgName.toLowerCase()}:${team.projectName.toLowerCase()}`
    const cached = this.projectWorkItemStatesCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value
    }

    const info = await fetchProjectWorkItemTypeInfo(this.client, team, signal)
    this.projectWorkItemStatesCache.set(cacheKey, {
      value: info,
      expiresAt: Date.now() + AdoQueryEngine.DEFAULT_CACHE_TTL_MS * 60, // 1 hour — rarely changes
    })
    return info
  }

  async getProjectWorkItemStates(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName'>,
    signal?: AbortSignal,
  ): Promise<ProjectWorkItemState[]> {
    return (await this.getProjectWorkItemTypeInfo(team, signal)).states
  }

  async getProjectWorkItemTypes(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName'>,
    signal?: AbortSignal,
  ): Promise<string[]> {
    return (await this.getProjectWorkItemTypeInfo(team, signal)).workItemTypes
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

  async getQualityAssuranceRawData(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>,
    signal?: AbortSignal,
    options?: { forceRefresh?: boolean; includeWorkItemTypes?: string[] },
  ): Promise<QualityAssuranceRawData> {
    const sortedIncludes = [...(options?.includeWorkItemTypes ?? [])].sort()
    const cacheKey = sortedIncludes.length > 0
      ? `${team.id}:include:${sortedIncludes.join(',').toLowerCase()}`
      : team.id

    if (!options?.forceRefresh) {
      const cached = this.qaRawDataCache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    const raw = await fetchQualityAssuranceRawData(this.client, team, signal, { includeWorkItemTypes: sortedIncludes })
    this.qaRawDataCache.set(cacheKey, raw)
    return raw
  }

  async getQualityAssuranceBuckets(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>,
    signal?: AbortSignal,
    options?: { forceRefresh?: boolean; includeWorkItemTypes?: string[]; stateGroupOverrides?: import('../features/standup/utils/qaOptions').QaStateGroupOverrides | null },
  ): Promise<QualityAssuranceBucket[]> {
    const raw = await this.getQualityAssuranceRawData(team, signal, { forceRefresh: options?.forceRefresh, includeWorkItemTypes: options?.includeWorkItemTypes })
    const config = resolveQualityAssuranceProjectConfig(team, options?.stateGroupOverrides)
    return bucketQualityAssuranceItems(raw.candidates, raw.updatesByItemId, config)
  }

  clearTeamWorkItemsCache(teamId?: string): void {
    if (teamId) {
      this.teamWorkItemsCache.delete(teamId)
      this.qaRawDataCache.delete(teamId)
      return
    }

    this.teamWorkItemsCache.clear()
    this.qaRawDataCache.clear()
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
