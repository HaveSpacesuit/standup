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

// Shared cache-key builders so a getter and its corresponding `clear*Cache` method can never
// drift apart and silently stop invalidating (each key shape is defined in exactly one place).
function orgProjectCacheKey(team: Pick<TeamProfile, 'orgName' | 'projectName'>): string {
  return `${team.orgName.toLowerCase()}:${team.projectName.toLowerCase()}`
}

function teamSubjectDescriptorCacheKey(team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName'>): string {
  return `${orgProjectCacheKey(team)}:${team.teamName.toLowerCase()}`
}

function iterationWindowCacheKey(team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>): string {
  return `${teamSubjectDescriptorCacheKey(team)}:${team.iterationPath.toLowerCase()}`
}

function workItemUpdatesCacheKey(team: Pick<TeamProfile, 'orgName' | 'projectName'>, itemId: number): string {
  return `${orgProjectCacheKey(team)}:${itemId}`
}


export class AdoQueryEngine {
  private readonly client: AdoHttpClient
  private readonly assigneeResolver: WorkItemAssigneeResolver
  private readonly teamWorkItemsCache = new Map<string, Promise<WorkItemSummary[]>>()
  private readonly qaRawDataCache = new Map<string, Promise<QualityAssuranceRawData>>()
  private readonly unlinkedPullRequestItemsCache = new Map<string, Promise<WorkItemSummary[]>>()
  private readonly teamMembersCache = new Map<string, Promise<TeamMember[]>>()
  private readonly currentIterationCache = new Map<string, Promise<IterationWindowInfo>>()
  private readonly teamSubjectDescriptorCache = new Map<string, Promise<string | null>>()
  private readonly projectWorkItemStatesCache = new Map<string, Promise<{ states: ProjectWorkItemState[]; workItemTypes: string[] }>>()
  private readonly teamIterationsCache = new Map<string, Promise<TeamIterationOption[]>>()
  private readonly workItemUpdatesCache = new Map<string, Promise<WorkItemUpdate[]>>()

  constructor(pat: string, defaultApiVersion = '7.1') {
    this.client = new AdoHttpClient(pat, defaultApiVersion)
    // Route through getWorkItemUpdates so the assignee resolver shares its cache instead of
    // issuing its own duplicate /updates requests for items already fetched elsewhere.
    this.assigneeResolver = new WorkItemAssigneeResolver((team, itemId, signal) => this.getWorkItemUpdates(team, itemId, signal))
  }

  private getOrLoadCached<T>(
    cache: Map<string, Promise<T>>,
    cacheKey: string,
    load: () => Promise<T>,
    forceRefresh?: boolean,
  ): Promise<T> {
    if (!forceRefresh) {
      const cached = cache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    const promise = load().catch((error: unknown) => {
      if (cache.get(cacheKey) === promise) {
        cache.delete(cacheKey)
      }
      throw error
    })
    cache.set(cacheKey, promise)
    return promise
  }

  private async getProjectWorkItemTypeInfo(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName'>,
    _signal?: AbortSignal,
  ): Promise<{ states: ProjectWorkItemState[]; workItemTypes: string[] }> {
    const cacheKey = orgProjectCacheKey(team)
    return this.getOrLoadCached(this.projectWorkItemStatesCache, cacheKey, () => fetchProjectWorkItemTypeInfo(this.client, team))
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
    _signal?: AbortSignal,
  ): Promise<TeamIterationOption[]> {
    const cacheKey = team.id
    return this.getOrLoadCached(this.teamIterationsCache, cacheKey, () => fetchTeamIterations(this.client, team))
  }

  async getTeamMembers(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName'>,
    _signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<TeamMember[]> {
    const cacheKey = team.id
    return this.getOrLoadCached(this.teamMembersCache, cacheKey, () => fetchTeamMembers(this.client, team), options?.forceRefresh)
  }

  async getWorkItemsForCurrentAndNextIteration(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath' | 'iterationPath'>,
    _signal?: AbortSignal,
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

    return this.getOrLoadCached(this.teamWorkItemsCache, cacheKey, () => fetchWorkItemsForCurrentAndNextIteration(this.client, team, undefined, {
      includeWorkItemTypes: sortedTypes,
      includeIterationPaths: sortedIterations,
      useDefaultIterationWindow: options?.useDefaultIterationWindow,
    }), options?.forceRefresh)
  }

  async getQualityAssuranceRawData(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>,
    _signal?: AbortSignal,
    options?: { forceRefresh?: boolean; includeWorkItemTypes?: string[]; includeIterationPaths?: string[]; lookbackDays?: number },
  ): Promise<QualityAssuranceRawData> {
    const sortedTypes = [...(options?.includeWorkItemTypes ?? [])].sort()
    const sortedIterations = [...(options?.includeIterationPaths ?? [])].sort()
    const typesKey = sortedTypes.length > 0 ? `types:${sortedTypes.join(',').toLowerCase()}` : ''
    const iterationsKey = sortedIterations.length > 0 ? `iters:${sortedIterations.join(',').toLowerCase()}` : ''
    const lookbackKey = typeof options?.lookbackDays === 'number' ? `lookback:${options.lookbackDays}` : ''
    const filterKey = [typesKey, iterationsKey, lookbackKey].filter(Boolean).join('|')
    const cacheKey = filterKey ? `${team.id}:${filterKey}` : team.id

    return this.getOrLoadCached(this.qaRawDataCache, cacheKey, () => fetchQualityAssuranceRawData(this.client, team, undefined, {
      includeWorkItemTypes: sortedTypes,
      includeIterationPaths: sortedIterations,
      lookbackDays: options?.lookbackDays,
      fetchWorkItemUpdates: (itemId) => this.getWorkItemUpdates(team, itemId),
    }), options?.forceRefresh)
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
    this.currentIterationCache.delete(iterationWindowCacheKey(team))
    this.teamSubjectDescriptorCache.delete(teamSubjectDescriptorCacheKey(team))
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
    _signal?: AbortSignal,
  ): Promise<WorkItemUpdate[]> {
    const cacheKey = workItemUpdatesCacheKey(team, itemId)
    return this.getOrLoadCached(this.workItemUpdatesCache, cacheKey, async () => {
      const response = await this.client.request<WorkItemUpdatesResponse>({
        method: 'GET',
        orgName: team.orgName,
        path: `/${encodeURIComponent(team.projectName)}/_apis/wit/workItems/${itemId}/updates`,
        params: {
          'api-version': '7.1',
        },
      })

      return response.value ?? []
    })
  }

  async getTeamSubjectDescriptor(
    team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName'>,
    _signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<string | null> {
    const cacheKey = teamSubjectDescriptorCacheKey(team)
    return this.getOrLoadCached(this.teamSubjectDescriptorCache, cacheKey, () => fetchTeamSubjectDescriptor(this.client, team), options?.forceRefresh)
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
    _signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<IterationWindowInfo> {
    const cacheKey = iterationWindowCacheKey(team)
    return this.getOrLoadCached(this.currentIterationCache, cacheKey, () => fetchIterationWindowInfo(this.client, team), options?.forceRefresh)
  }

  async getUnlinkedActivePullRequestItems(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'repoName'>,
    members: TeamMember[],
    visibleWorkItems: WorkItemSummary[],
    currentIteration: CurrentIterationInfo | null,
    _signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<WorkItemSummary[]> {
    const cacheKey = team.id
    return this.getOrLoadCached(this.unlinkedPullRequestItemsCache, cacheKey, () => fetchUnlinkedActivePullRequestItems(
      this.client,
      team,
      members,
      visibleWorkItems,
      currentIteration,
    ), options?.forceRefresh)
  }
}
