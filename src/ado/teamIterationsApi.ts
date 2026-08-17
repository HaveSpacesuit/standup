import type { TeamProfile } from '../teamProfiles'
import type { AdoRequestClient } from './httpClient'
import type { CurrentIterationInfo, IterationInfo, IterationWindowInfo } from './types'
import { parseIsoDate } from './adoShared'

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

  const fullName = iteration?.path?.trim() || name

  const startDate = iteration?.attributes?.startDate?.trim() || undefined
  const finishDate = iteration?.attributes?.finishDate?.trim() || undefined

  return {
    name,
    fullName,
    startDate,
    finishDate,
  }
}

function resolveNextIterationInfo(
  iterations: Array<{
    name?: string
    path?: string
    attributes?: {
      startDate?: string
      finishDate?: string
    }
  }>,
  currentIteration: CurrentIterationInfo | null,
): IterationInfo | null {
  if (iterations.length === 0) {
    return null
  }

  const currentFullName = currentIteration?.fullName.toLowerCase()
  const currentFinishAt = parseIsoDate(currentIteration?.finishDate)
  const now = Date.now()

  const candidates = iterations
    .map((iteration) => resolveCurrentIterationInfo(iteration))
    .filter((iteration): iteration is IterationInfo => Boolean(iteration))
    .filter((iteration) => iteration.fullName.toLowerCase() !== currentFullName)
    .map((iteration) => ({
      iteration,
      startAt: parseIsoDate(iteration.startDate),
    }))
    .filter((entry) => entry.startAt !== null)

  if (candidates.length === 0) {
    return null
  }

  const lowerBound = currentFinishAt ?? now
  const futureCandidates = candidates
    .filter((entry) => entry.startAt !== null && entry.startAt > lowerBound)
    .sort((left, right) => (left.startAt ?? 0) - (right.startAt ?? 0))

  if (futureCandidates.length > 0) {
    return futureCandidates[0].iteration
  }

  const upcomingFromNow = candidates
    .filter((entry) => entry.startAt !== null && entry.startAt > now)
    .sort((left, right) => (left.startAt ?? 0) - (right.startAt ?? 0))

  return upcomingFromNow[0]?.iteration ?? null
}

function resolveIterations(response: TeamIterationsResponse): Array<{
  name?: string
  path?: string
  attributes?: {
    startDate?: string
    finishDate?: string
  }
}> {
  return response.values ?? response.value ?? []
}

async function fetchTeamId(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>,
  signal?: AbortSignal,
): Promise<string | null> {
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

  return teamReference.id?.trim() || null
}

export async function fetchIterationWindowInfo(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>,
  signal?: AbortSignal,
): Promise<IterationWindowInfo> {
  const teamId = await fetchTeamId(client, team, signal)
  if (!teamId) {
    return { current: null, next: null }
  }

  const [currentResponse, allResponse] = await Promise.all([
    client.request<TeamIterationsResponse>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/iterations`,
      params: {
        '$timeframe': 'current',
        'api-version': '7.1',
      },
      signal,
    }),
    client.request<TeamIterationsResponse>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/iterations`,
      params: {
        'api-version': '7.1',
      },
      signal,
    }),
  ])

  const current = resolveCurrentIterationInfo(resolveIterations(currentResponse)[0])
  const next = resolveNextIterationInfo(resolveIterations(allResponse), current)

  return {
    current,
    next,
  }
}

export async function fetchCurrentIterationInfo(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>,
  signal?: AbortSignal,
): Promise<CurrentIterationInfo | null> {
  const iterationWindow = await fetchIterationWindowInfo(client, team, signal)
  return iterationWindow.current
}
