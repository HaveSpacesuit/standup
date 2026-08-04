import type { TeamProfile } from '../teamProfiles'

type QueryValue = string | number | boolean | undefined

type QueryParams = Record<string, QueryValue>

type TeamMembersResponse = {
  count: number
  value: TeamMemberApiItem[]
}

export type TeamMember = {
  id?: string
  isTeamAdmin?: boolean
  displayName: string
  uniqueName?: string
  imageUrl?: string
  descriptor?: string
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

  async request<T>(options: {
    orgName: string
    path: string
    params?: QueryParams
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
      method: 'GET',
      headers: {
        Authorization: `Basic ${btoa(`:${this.pat}`)}`,
        Accept: 'application/json',
      },
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
