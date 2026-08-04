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

type WorkItemUpdatesResponse = {
  count: number
  value: WorkItemUpdateApiItem[]
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
  assignedTo?: IdentityRef
  status: WorkItemStatus
}

export type WorkItemStatus = 'Blocked' | 'New' | 'Active' | 'Review' | 'Done'

export type IdentityRef = {
  displayName?: string
  uniqueName?: string
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
    'System.AssignedTo'?: unknown
    'System.State'?: unknown
    'System.Tags'?: unknown
  }
}

type WorkItemUpdateApiItem = {
  fields?: {
    'System.AssignedTo'?: {
      newValue?: unknown
    }
  }
}

type TeamMemberLookup = Record<string, string>

export type ResolvedWorkItemAssignee = {
  label: string
  kind: 'team-member' | 'unassigned'
}

const blockedStates = new Set(['design', 'in planning', 'inactive', 'on hold'])
const todoStates = new Set([
  'accepted',
  'approved',
  'not started',
  'new',
  'open',
  'ready',
  'refined',
  'requested',
  'to do',
])
const inProgressStates = new Set(['active', 'committed', 'failed testing', 'in progress'])
const validationStates = new Set(['available for testing', 'in code review', 'ready to build'])
const doneStates = new Set(['closed', 'completed', 'done', 'removed'])

function parseAssignedTo(value: unknown): IdentityRef | undefined {
  if (!value) {
    return undefined
  }

  if (typeof value === 'object') {
    const candidate = value as { displayName?: unknown; uniqueName?: unknown; name?: unknown }
    const displayName =
      typeof candidate.displayName === 'string'
        ? candidate.displayName
        : typeof candidate.name === 'string'
          ? candidate.name
          : undefined
    const uniqueName = typeof candidate.uniqueName === 'string' ? candidate.uniqueName : undefined

    if (displayName || uniqueName) {
      return { displayName, uniqueName }
    }

    return undefined
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }

    const match = /^(.*)\s<([^>]+)>$/.exec(trimmed)
    if (match) {
      return {
        displayName: match[1]?.trim(),
        uniqueName: match[2]?.trim(),
      }
    }

    return { displayName: trimmed }
  }

  return undefined
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function parseTags(value: unknown): string[] {
  if (typeof value !== 'string') {
    return []
  }

  return value
    .split(';')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}

function resolveStatusFromStateAndTags(stateValue: unknown, tagsValue: unknown): WorkItemStatus {
  const tags = parseTags(tagsValue)
  const normalizedTags = tags.map((tag) => normalizeText(tag))

  const hasBlockedTag = normalizedTags.some((tag) => tag.includes('blocked'))
  if (hasBlockedTag) {
    return 'Blocked'
  }

  const normalizedState = typeof stateValue === 'string' ? normalizeText(stateValue) : ''

  let status: WorkItemStatus = 'New'

  if (blockedStates.has(normalizedState)) {
    status = 'Blocked'
  } else if (todoStates.has(normalizedState)) {
    status = 'New'
  } else if (inProgressStates.has(normalizedState)) {
    status = 'Active'
  } else if (validationStates.has(normalizedState)) {
    status = 'Review'
  } else if (doneStates.has(normalizedState)) {
    status = 'Done'
  }

  const hasPrTag = normalizedTags.some((tag) => tag === 'pr')
  if (hasPrTag && status === 'Active') {
    return 'Review'
  }

  return status
}

function toIdentityKeys(identity?: IdentityRef): string[] {
  if (!identity) {
    return []
  }

  const keys = [identity.uniqueName, identity.displayName]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.toLowerCase())

  return Array.from(new Set(keys))
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
  private readonly teamWorkItemsCache = new Map<string, WorkItemSummary[]>()
  private readonly workItemAssignmentTrailCache = new Map<string, IdentityRef[]>()

  constructor(pat: string, defaultApiVersion = '7.1') {
    this.pat = pat
    this.defaultApiVersion = defaultApiVersion
  }

  async getTeamMembers(
    team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName'>,
    signal?: AbortSignal,
  ): Promise<TeamMember[]> {
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
        fields: ['System.Title', 'System.AssignedTo', 'System.State', 'System.Tags'],
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
          assignedTo: parseAssignedTo(item.fields?.['System.AssignedTo']),
          status: resolveStatusFromStateAndTags(
            item.fields?.['System.State'],
            item.fields?.['System.Tags'],
          ),
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

    const updatesResponse = await this.request<WorkItemUpdatesResponse>({
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
      `  AND (`,
      `    [System.IterationPath] = ${iterationMacro}`,
      `    OR (`,
      `      [System.IterationPath] = ${iterationMacro} + 1`,
      `      AND [System.AssignedTo] <> ''`,
      `    )`,
      `  )`,
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
