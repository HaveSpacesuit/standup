import type { TeamProfile } from '../teamProfiles'
import type { AdoRequestClient } from './httpClient'

type WorkItemTypeStateColor = {
  name?: string
  color?: string
  category?: string
}

type WorkItemTypeResponse = {
  name?: string
  states?: WorkItemTypeStateColor[]
}

type WorkItemTypesListResponse = {
  value?: WorkItemTypeResponse[]
}

export type ProjectWorkItemState = {
  name: string
  category: string
}

export type ProjectWorkItemTypeInfo = {
  /** Distinct state names for the project, sorted alphabetically. */
  states: ProjectWorkItemState[]
  /** Distinct work item type names for the project, sorted alphabetically. */
  workItemTypes: string[]
}

/**
 * Returns all distinct work item states and work item type names for a project
 * in a single API call (`GET /_apis/wit/workitemtypes?$expand=states`).
 */
export async function fetchProjectWorkItemTypeInfo(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  signal?: AbortSignal,
): Promise<ProjectWorkItemTypeInfo> {
  const response = await client.request<WorkItemTypesListResponse>({
    method: 'GET',
    orgName: team.orgName,
    path: `/${encodeURIComponent(team.projectName)}/_apis/wit/workitemtypes`,
    params: { '$expand': 'states' },
    signal,
  })

  const seenStates = new Map<string, ProjectWorkItemState>()
  const workItemTypes: string[] = []

  for (const type of response.value ?? []) {
    if (type.name?.trim()) {
      workItemTypes.push(type.name.trim())
    }

    for (const state of type.states ?? []) {
      const name = state.name?.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!seenStates.has(key)) {
        seenStates.set(key, { name, category: state.category ?? '' })
      }
    }
  }

  return {
    states: Array.from(seenStates.values()).sort((a, b) => a.name.localeCompare(b.name)),
    workItemTypes: workItemTypes.sort((a, b) => a.localeCompare(b)),
  }
}

/** @deprecated Use fetchProjectWorkItemTypeInfo instead */
export async function fetchProjectWorkItemStates(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  signal?: AbortSignal,
): Promise<ProjectWorkItemState[]> {
  const info = await fetchProjectWorkItemTypeInfo(client, team, signal)
  return info.states
}
