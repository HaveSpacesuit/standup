import type { TeamProfile } from '../teamConfig'
import type { AdoRequestClient } from './httpClient'

type TeamReferenceResponse = {
  id?: string
}

type GraphDescriptorResponse = {
  value?: string
}

export async function fetchTeamSubjectDescriptor(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'teamName'>,
  signal?: AbortSignal,
): Promise<string | null> {
  const teamReference = await client.request<TeamReferenceResponse>({
    method: 'GET',
    orgName: team.orgName,
    path: `/_apis/projects/${encodeURIComponent(team.projectName)}/teams/${encodeURIComponent(team.teamName)}`,
    params: {
      'api-version': '7.1-preview.3',
    },
    signal,
  })

  const teamId = teamReference.id?.trim()
  if (!teamId) {
    return null
  }

  const descriptorResponse = await client.request<GraphDescriptorResponse>({
    method: 'GET',
    orgName: team.orgName,
    host: 'vssps.dev.azure.com',
    path: `/_apis/graph/descriptors/${encodeURIComponent(teamId)}`,
    params: {
      'api-version': '7.1-preview.1',
    },
    signal,
  })

  const descriptor = descriptorResponse.value?.trim()
  return descriptor || null
}
