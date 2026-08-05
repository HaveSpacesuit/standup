import type { TeamProfile } from '../teamProfiles'
import type { AdoRequestClient } from './httpClient'
import type { CurrentIterationInfo } from './types'

type TeamIterationsResponse = {
  values?: Array<{
    name?: string
    path?: string
    attributes?: {
      startDate?: string
      finishDate?: string
    }
  }>
  value?: Array<{
    name?: string
    path?: string
    attributes?: {
      startDate?: string
      finishDate?: string
    }
  }>
}

type TeamReferenceResponse = {
  id?: string
}

function resolveIterationOwnerTeamName(team: Pick<TeamProfile, 'teamName' | 'iterationPath'>): string {
  const trimmedIterationPath = team.iterationPath.trim()
  if (!trimmedIterationPath) {
    return team.teamName
  }

  const segments = trimmedIterationPath.split('\\').filter(Boolean)
  const iterationOwnerTeamName = segments[segments.length - 1]?.trim()
  return iterationOwnerTeamName || team.teamName
}

function resolveIterationName(iteration: { name?: string; path?: string } | undefined): string | null {
  if (!iteration) {
    return null
  }

  const name = iteration.name?.trim()
  if (name) {
    return name
  }

  const path = iteration.path?.trim()
  if (!path) {
    return null
  }

  const segments = path.split('\\').filter(Boolean)
  return segments[segments.length - 1] ?? null
}

function resolveCurrentIterationInfo(
  iteration:
    | {
        name?: string
        path?: string
        attributes?: {
          startDate?: string
          finishDate?: string
        }
      }
    | undefined,
): CurrentIterationInfo | null {
  const name = resolveIterationName(iteration)
  if (!name) {
    return null
  }

  const startDate = iteration?.attributes?.startDate?.trim() || undefined
  const finishDate = iteration?.attributes?.finishDate?.trim() || undefined

  return {
    name,
    startDate,
    finishDate,
  }
}

export async function fetchCurrentIterationInfo(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>,
  signal?: AbortSignal,
): Promise<CurrentIterationInfo | null> {
  const iterationOwnerTeamName = resolveIterationOwnerTeamName(team)

  const teamReference = await client.request<TeamReferenceResponse>({
    method: 'GET',
    orgName: team.orgName,
    path: `/_apis/projects/${encodeURIComponent(team.projectName)}/teams/${encodeURIComponent(iterationOwnerTeamName)}`,
    params: {
      'api-version': '7.1-preview.3',
    },
    signal,
  })

  const teamId = teamReference.id?.trim()
  if (!teamId) {
    return null
  }

  const response = await client.request<TeamIterationsResponse>({
    method: 'GET',
    orgName: team.orgName,
    path: `/${encodeURIComponent(team.projectName)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/iterations`,
    params: {
      '$timeframe': 'current',
      'api-version': '7.1',
    },
    signal,
  })

  return resolveCurrentIterationInfo(response.values?.[0] ?? response.value?.[0])
}
