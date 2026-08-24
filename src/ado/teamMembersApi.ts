import type { TeamProfile } from '../appSettings'
import type { AdoRequestClient } from './httpClient'
import type { TeamMember } from './types'

type TeamMembersResponse = {
  count: number
  value: TeamMemberApiItem[]
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

export async function fetchTeamMembers(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName'>,
  signal?: AbortSignal,
): Promise<TeamMember[]> {
  const response = await client.request<TeamMembersResponse>({
    orgName: team.orgName,
    path: `/_apis/projects/${encodeURIComponent(team.projectName)}/teams/${encodeURIComponent(team.teamName)}/members`,
    params: {
      'api-version': '7.1-preview.1',
    },
    signal,
  })

  return (response.value ?? [])
    .map(normalizeTeamMember)
    .filter((member): member is TeamMember => member !== null)
}
