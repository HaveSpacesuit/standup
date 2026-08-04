import type { TeamProfile } from '../teamProfiles'

type QueryValue = string | number | boolean | undefined

type QueryParams = Record<string, QueryValue>

type QueryMethod = 'GET' | 'POST'

type TeamMembersResponse = {
  count: number
  value: TeamMemberApiItem[]
}

type WiqlResponse = {
  workItems?: Array<{ id: number }>
}

type WorkItemsBatchResponse = {
  count: number
  value: WorkItemApiItem[]
}

export type TeamMember = {
  id?: string
  isTeamAdmin?: boolean
  displayName: string
  uniqueName?: string
  imageUrl?: string
  descriptor?: string
}

export type WorkItemSummary = {
  id: number
  title: string
}

type TeamMemberApiItem = {
  id?: string
  isTeamAdmin?: boolean
  displayName?: string
  uniqueName?: string
  imageUrl?: string
  descriptor?: string
  identity?: {
    displayName?: string
    uniqueName?: string
    imageUrl?: string
    descriptor?: string
  }
}

type WorkItemApiItem = {
  id?: number
  fields?: {
    'System.Title'?: string
  }
}

function normalizeTeamMember(item: TeamMemberApiItem): TeamMember | null {
  const displayName = item.displayName ?? item.identity?.displayName

  if (!displayName) {
    return null
  }

  return {
    id: item.id,
    isTeamAdmin: item.isTeamAdmin,
    displayName,
    uniqueName: item.uniqueName ?? item.identity?.uniqueName,
    imageUrl: item.imageUrl ?? item.identity?.imageUrl,
    descriptor: item.descriptor ?? item.identity?.descriptor,
  }
}

export class AdoQueryEngine {
  private readonly pat: string
  private readonly defaultApiVersion: string
  private readonly teamMembersCache = new Map<string, TeamMember[]>()
  private readonly teamWorkItemsCache = new Map<string, WorkItemSummary[]>()

  constructor(pat: string, defaultApiVersion = '7.1') {
    this.pat = pat
    this.defaultApiVersion = defaultApiVersion
  }

  async getTeamMembers(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName'>,
    signal?: AbortSignal,
    options?: { forceRefresh?: boolean },
  ): Promise<TeamMember[]> {
    const cacheKey = team.id

    if (!options?.forceRefresh) {
      const cachedMembers = this.teamMembersCache.get(cacheKey)
      if (cachedMembers) {
        return cachedMembers
      }
    }

    const response = await this.request<TeamMembersResponse>({
      orgName: team.orgName,
      path: `/_apis/projects/${encodeURIComponent(team.projectName)}/teams/${encodeURIComponent(team.teamName)}/members`,
      params: {
        'api-version': '7.1-preview.1',
      },
      signal,
    })

    const members = (response.value ?? [])
      .map(normalizeTeamMember)
      .filter((member): member is TeamMember => member !== null)

    this.teamMembersCache.set(cacheKey, members)

    return members
  }

  clearTeamMembersCache(teamId?: string): void {
    if (teamId) {
      this.teamMembersCache.delete(teamId)
      return
    }

    this.teamMembersCache.clear()
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

    const wiqlQuery = this.buildIterationScopedWiql(
      team.projectName,
      team.areaPath,
      team.iterationPath,
    )

    const wiqlResponse = await this.request<WiqlResponse>({
      method: 'POST',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/_apis/wit/wiql`,
      params: {
        'api-version': '7.1',
      },
      body: {
        query: wiqlQuery,
      },
      signal,
    })

    const ids = (wiqlResponse.workItems ?? []).map((item) => item.id)

    if (ids.length === 0) {
      this.teamWorkItemsCache.set(cacheKey, [])
      return []
    }

    const batchResponse = await this.request<WorkItemsBatchResponse>({
      method: 'POST',
      orgName: team.orgName,
      path: '/_apis/wit/workitemsbatch',
      params: {
        'api-version': '7.1',
      },
      body: {
        ids,
        fields: ['System.Title'],
      },
      signal,
    })

    const items = (batchResponse.value ?? [])
      .map((item): WorkItemSummary | null => {
        if (typeof item.id !== 'number') {
          return null
        }

        return {
          id: item.id,
          title: item.fields?.['System.Title'] ?? `Work Item ${item.id}`,
        }
      })
      .filter((item): item is WorkItemSummary => item !== null)

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

  private buildIterationScopedWiql(
    projectName: string,
    areaPath: string,
    teamIterationPath: string,
  ): string {
    const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
    const iterationMacro = `@CurrentIteration(${quote(teamIterationPath)})`

    return [
      'SELECT [System.Id]',
      'FROM WorkItems',
      `WHERE [System.TeamProject] = ${quote(projectName)}`,
      `  AND [System.AreaPath] UNDER ${quote(areaPath)}`,
      `  AND ([System.IterationPath] = ${iterationMacro} OR [System.IterationPath] = ${iterationMacro} + 1)`,
      'ORDER BY [System.ChangedDate] DESC',
    ].join('\n')
  }

  async request<T>(options: {
    method?: QueryMethod
    orgName: string
    path: string
    params?: QueryParams
    body?: unknown
    signal?: AbortSignal
  }): Promise<T> {
    const url = new URL(`https://dev.azure.com/${encodeURIComponent(options.orgName)}${options.path}`)
    const params = options.params ?? {}

    if (!params['api-version']) {
      params['api-version'] = this.defaultApiVersion
    }

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }

    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Basic ${btoa(`:${this.pat}`)}`,
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `Azure DevOps query failed (${response.status} ${response.statusText}): ${errorBody || 'no error details returned'}`,
      )
    }

    return (await response.json()) as T
  }
}
