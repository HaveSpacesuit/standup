import type { TeamProfile } from '../appSettings'
import type { AdoRequestOptions } from './httpClient'
import { AdoHttpClient } from './httpClient'
import { WorkItemAssigneeResolver } from './assigneeResolver'
import { fetchIterationWindowInfo, fetchTeamIterations } from './teamIterationsApi'
import { fetchTeamMembers } from './teamMembersApi'
import { fetchUnlinkedActivePullRequestItems } from './teamPullRequestsApi'
import { fetchTeamSubjectDescriptor } from './teamSettingsApi'
import { fetchQualityAssuranceRawData, fetchWorkItemsForCurrentAndNextIteration } from './workItemsApi'
import { fetchProjectWorkItemTypeInfo, type ProjectWorkItemState } from './workItemTypesApi'
import type { CurrentIterationInfo, IterationWindowInfo, ResolvedWorkItemAssignee, TeamIterationOption, TeamMember, TeamMemberLookup, WorkItemSummary, WorkItemUpdate, WorkItemUpdatesResponse } from './types'
import type { QualityAssuranceRawData } from './workItemsApi'

export type { CurrentIterationInfo, IterationWindowInfo, TeamIterationOption, TeamMember, WorkItemSummary, WorkItemPullRequestSummary, ResolvedWorkItemAssignee, WorkItemUpdate } from './types'
export type { ProjectWorkItemState } from './workItemTypesApi'


export class AdoQueryEngine {
  private readonly client: AdoHttpClient
  private readonly assigneeResolver: WorkItemAssigneeResolver
  private readonly teamWorkItemsCache = new Map<string, WorkItemSummary[]>()
  private readonly qaRawDataCache = new Map<string, QualityAssuranceRawData>()
  private readonly unlinkedPullRequestItemsCache = new Map<string, WorkItemSummary[]>()
  private readonly teamMembersCache = new Map<string, TeamMember[]>()
  private readonly currentIterationCache = new Map<string, IterationWindowInfo>()
  private readonly teamSubjectDescriptorCache = new Map<string, string | null>()
  private readonly projectWorkItemStatesCache = new Map<string, { states: ProjectWorkItemState[]; workItemTypes: string[] }>()
  private readonly teamIterationsCache = new Map<string, TeamIterationOption[]>()
  private readonly workItemUpdatesCache = new Map<string, WorkItemUpdate[]>()

  constructor(pat: string, defaultApiVersion = '7.1') {
    this.client = new AdoHttpClient(pat, defaultApiVersion)
    // Route through getWorkItemUpdates so the assignee resolver shares its cache instead of
    // issuing its own duplicate /updates requests for items already fetched elsewhere.
    this.assigneeResolver = new WorkItemAssigneeResolver((team, itemId, signal) => this.getWorkItemUpdates(team, itemId, signal))
  }

  private async getProjectWorkItemTypeInfo(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName'>,
    signal?: AbortSignal,
  ): Promise<{ states: ProjectWorkItemState[]; workItemTypes: string[] }> {
    const cacheKey = `${team.orgName.toLowerCase()}:${team.projectName.toLowerCase()}`
    const cached = this.projectWorkItemStatesCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const info = await fetchProjectWorkItemTypeInfo(this.client, team, signal)
    this.projectWorkItemStatesCache.set(cacheKey, info)
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

  async getTeamIterations(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>,
    signal?: AbortSignal,
  ): Promise<TeamIterationOption[]> {
    const cacheKey = team.id
    const cached = this.teamIterationsCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const iterations = await fetchTeamIterations(this.client, team, signal)
    this.teamIterationsCache.set(cacheKey, iterations)
    return iterations
  }

  async getTeamMembers(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName'>,
    signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<TeamMember[]> {
    const cacheKey = team.id

    if (!options?.forceRefresh) {
      const cached = this.teamMembersCache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    const members = await fetchTeamMembers(this.client, team, signal)
    this.teamMembersCache.set(cacheKey, members)

    return members
  }

  async getWorkItemsForCurrentAndNextIteration(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath' | 'iterationPath'>,
    signal?: AbortSignal,
    options?: {
      forceRefresh?: boolean
      includeWorkItemTypes?: string[]
      includeIterationPaths?: string[]
      useDefaultIterationWindow?: boolean
    },
  ): Promise<WorkItemSummary[]> {
    const sortedTypes = [...(options?.includeWorkItemTypes ?? [])].sort()
    const sortedIterations = [...(options?.includeIterationPaths ?? [])].sort()
    const typesKey = sortedTypes.length > 0 ? `types:${sortedTypes.join(',').toLowerCase()}` : ''
    const iterationsKey = sortedIterations.length > 0 ? `iters:${sortedIterations.join(',').toLowerCase()}` : ''
    const iterationWindowKey = options?.useDefaultIterationWindow ? 'iters:default-window' : 'iters:all'
    const filterKey = [typesKey, iterationsKey, iterationWindowKey].filter(Boolean).join('|')
    const cacheKey = filterKey ? `${team.id}:${filterKey}` : team.id

    if (!options?.forceRefresh) {
      const cachedItems = this.teamWorkItemsCache.get(cacheKey)
      if (cachedItems) {
        return cachedItems
      }
    }

    const items = await fetchWorkItemsForCurrentAndNextIteration(this.client, team, signal, {
      includeWorkItemTypes: sortedTypes,
      includeIterationPaths: sortedIterations,
      useDefaultIterationWindow: options?.useDefaultIterationWindow,
    })

    this.teamWorkItemsCache.set(cacheKey, items)

    return items
  }

  async getQualityAssuranceRawData(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>,
    signal?: AbortSignal,
    options?: { forceRefresh?: boolean; includeWorkItemTypes?: string[]; includeIterationPaths?: string[]; lookbackDays?: number },
  ): Promise<QualityAssuranceRawData> {
    const sortedTypes = [...(options?.includeWorkItemTypes ?? [])].sort()
    const sortedIterations = [...(options?.includeIterationPaths ?? [])].sort()
    const typesKey = sortedTypes.length > 0 ? `types:${sortedTypes.join(',').toLowerCase()}` : ''
    const iterationsKey = sortedIterations.length > 0 ? `iters:${sortedIterations.join(',').toLowerCase()}` : ''
    const lookbackKey = typeof options?.lookbackDays === 'number' ? `lookback:${options.lookbackDays}` : ''
    const filterKey = [typesKey, iterationsKey, lookbackKey].filter(Boolean).join('|')
    const cacheKey = filterKey ? `${team.id}:${filterKey}` : team.id

    if (!options?.forceRefresh) {
      const cached = this.qaRawDataCache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    const raw = await fetchQualityAssuranceRawData(this.client, team, signal, {
      includeWorkItemTypes: sortedTypes,
      includeIterationPaths: sortedIterations,
      lookbackDays: options?.lookbackDays,
      fetchWorkItemUpdates: (itemId, itemSignal) => this.getWorkItemUpdates(team, itemId, itemSignal),
    })
    this.qaRawDataCache.set(cacheKey, raw)
    return raw
  }

  clearTeamWorkItemsCache(teamId?: string): void {
    if (teamId) {
      // Team work-item cache keys can be compound (`${teamId}:types:<...>`) when type filters
      // are active, so clear every entry belonging to this team.
      for (const key of this.teamWorkItemsCache.keys()) {
        if (key === teamId || key.startsWith(`${teamId}:`)) {
          this.teamWorkItemsCache.delete(key)
        }
      }
      // QA raw-data cache keys are compound (`${teamId}:<filters>`) when work-item-type or sprint
      // filters are active, so clear every entry belonging to this team — not just the bare key.
      for (const key of this.qaRawDataCache.keys()) {
        if (key === teamId || key.startsWith(`${teamId}:`)) {
          this.qaRawDataCache.delete(key)
        }
      }
      this.unlinkedPullRequestItemsCache.delete(teamId)
      return
    }

    this.teamWorkItemsCache.clear()
    this.qaRawDataCache.clear()
    this.unlinkedPullRequestItemsCache.clear()
  }

  clearTeamMetadataCaches(
    team?: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>,
  ): void {
    if (!team) {
      this.teamMembersCache.clear()
      this.currentIterationCache.clear()
      this.teamSubjectDescriptorCache.clear()
      this.teamIterationsCache.clear()
      this.workItemUpdatesCache.clear()
      return
    }

    this.teamMembersCache.delete(team.id)
    this.currentIterationCache.delete(
      `${team.orgName.toLowerCase()}:${team.projectName.toLowerCase()}:${team.teamName.toLowerCase()}:${team.iterationPath.toLowerCase()}`,
    )
    this.teamSubjectDescriptorCache.delete(
      `${team.orgName.toLowerCase()}:${team.projectName.toLowerCase()}:${team.teamName.toLowerCase()}`,
    )
    this.teamIterationsCache.delete(team.id)
    // Item-history cache isn't keyed by team (work item IDs are org-wide), so a per-team
    // refresh simply clears it all — cheap to refetch and keeps "Refresh" meaning "reload everything".
    this.workItemUpdatesCache.clear()
  }

  async resolveWorkItemAssignee(
    team: Pick<TeamProfile, 'orgName' | 'projectName'>,
    teamMemberLookup: TeamMemberLookup,
    workItem: WorkItemSummary,
    signal?: AbortSignal,
  ): Promise<ResolvedWorkItemAssignee> {
    return this.assigneeResolver.resolveWorkItemAssignee(team, teamMemberLookup, workItem, signal)
  }

  async request<T>(options: AdoRequestOptions): Promise<T> {
    return this.client.request<T>(options)
  }

  /** Cached wrapper around the work item `/updates` (revision history) endpoint, shared by any
   * feature that needs to replay a work item's field history (e.g. change highlights, effort-flow chart). */
  async getWorkItemUpdates(
    team: Pick<TeamProfile, 'orgName' | 'projectName'>,
    itemId: number,
    signal?: AbortSignal,
  ): Promise<WorkItemUpdate[]> {
    const cacheKey = `${team.orgName.toLowerCase()}:${team.projectName.toLowerCase()}:${itemId}`
    const cached = this.workItemUpdatesCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const response = await this.client.request<WorkItemUpdatesResponse>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/_apis/wit/workItems/${itemId}/updates`,
      params: {
        'api-version': '7.1',
      },
      signal,
    })

    const value = response.value ?? []
    this.workItemUpdatesCache.set(cacheKey, value)

    return value
  }

  async getTeamSubjectDescriptor(
    team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName'>,
    signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<string | null> {
    const cacheKey = `${team.orgName.toLowerCase()}:${team.projectName.toLowerCase()}:${team.teamName.toLowerCase()}`

    if (!options?.forceRefresh) {
      const cached = this.teamSubjectDescriptorCache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    const descriptor = await fetchTeamSubjectDescriptor(this.client, team, signal)
    this.teamSubjectDescriptorCache.set(cacheKey, descriptor)

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
      if (cached) {
        return cached
      }
    }

    const currentIterationInfo = await fetchIterationWindowInfo(this.client, team, signal)
    this.currentIterationCache.set(cacheKey, currentIterationInfo)

    return currentIterationInfo
  }

  async getUnlinkedActivePullRequestItems(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'repoName'>,
    members: TeamMember[],
    visibleWorkItems: WorkItemSummary[],
    currentIteration: CurrentIterationInfo | null,
    signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<WorkItemSummary[]> {
    const cacheKey = team.id

    if (!options?.forceRefresh) {
      const cached = this.unlinkedPullRequestItemsCache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    const items = await fetchUnlinkedActivePullRequestItems(
      this.client,
      team,
      members,
      visibleWorkItems,
      currentIteration,
      signal,
    )
    this.unlinkedPullRequestItemsCache.set(cacheKey, items)

    return items
  }
}
