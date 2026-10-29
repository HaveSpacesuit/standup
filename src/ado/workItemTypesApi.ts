import type { TeamProfile } from '../appSettings'
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
  /** States defined by each work item type, keyed by lower-cased type name. */
  statesByType: Record<string, ProjectWorkItemState[]>
}

/**
 * Returns all distinct work item states, work item type names and each type's own states for a
 * project in a single API call (`GET /_apis/wit/workitemtypes?$expand=states`).
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
  const statesByType: Record<string, ProjectWorkItemState[]> = {}
  const workItemTypes: string[] = []

  for (const type of response.value ?? []) {
    const typeName = type.name?.trim()
    if (typeName) {
      workItemTypes.push(typeName)
    }

    const typeStates: ProjectWorkItemState[] = []
    for (const state of type.states ?? []) {
      const name = state.name?.trim()
      if (!name) continue
      const key = name.toLowerCase()
      const projectState = { name, category: state.category ?? '' }
      typeStates.push(projectState)
      if (!seenStates.has(key)) {
        seenStates.set(key, projectState)
      }
    }

    if (typeName) {
      statesByType[typeName.toLowerCase()] = typeStates
    }
  }

  return {
    states: Array.from(seenStates.values()).sort((a, b) => a.name.localeCompare(b.name)),
    workItemTypes: workItemTypes.sort((a, b) => a.localeCompare(b)),
    statesByType,
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
