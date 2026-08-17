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

/**
 * Returns all distinct work item state names for a project, sorted alphabetically.
 * Fetches the list of work item types (which include their states inline) in a single call.
 */
export async function fetchProjectWorkItemStates(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  signal?: AbortSignal,
): Promise<ProjectWorkItemState[]> {
  const response = await client.request<WorkItemTypesListResponse>({
    method: 'GET',
    orgName: team.orgName,
    path: `/${encodeURIComponent(team.projectName)}/_apis/wit/workitemtypes`,
    params: { '$expand': 'states' },
    signal,
  })

  const seen = new Map<string, ProjectWorkItemState>() // lowercase name -> state

  for (const type of response.value ?? []) {
    for (const state of type.states ?? []) {
      const name = state.name?.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!seen.has(key)) {
        seen.set(key, { name, category: state.category ?? '' })
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
}
