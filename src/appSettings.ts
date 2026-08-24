export type TeamProfile = {
  id: string
  orgName: string
  projectName: string
  displayName: string
  areaPath: string
  iterationPath: string
  teamName: string
  repoName: string
  extra?: Record<string, string>
}

export const TEAM_PROFILES_STORAGE_KEY = 'standup:team-profiles'

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.values(value).every((entry) => typeof entry === 'string')
}

function parseStoredTeamProfile(value: unknown): TeamProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  const requiredFields = ['id', 'orgName', 'projectName', 'displayName', 'areaPath', 'iterationPath', 'teamName', 'repoName'] as const
  if (requiredFields.some((field) => {
    const fieldValue = candidate[field]
    return typeof fieldValue !== 'string' || !fieldValue.trim()
  })) {
    return null
  }

  const id = candidate.id as string
  const orgName = candidate.orgName as string
  const projectName = candidate.projectName as string
  const displayName = candidate.displayName as string
  const areaPath = candidate.areaPath as string
  const iterationPath = candidate.iterationPath as string
  const teamName = candidate.teamName as string
  const repoName = candidate.repoName as string

  return {
    id: id.trim(),
    orgName: orgName.trim(),
    projectName: projectName.trim(),
    displayName: displayName.trim(),
    areaPath: areaPath.trim(),
    iterationPath: iterationPath.trim(),
    teamName: teamName.trim(),
    repoName: repoName.trim(),
    extra: isStringRecord(candidate.extra) ? candidate.extra : undefined,
  }
}

export function loadTeamProfiles(): TeamProfile[] {
  const stored = localStorage.getItem(TEAM_PROFILES_STORAGE_KEY)
  if (!stored) {
    return []
  }

  try {
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.flatMap((entry) => {
      const teamProfile = parseStoredTeamProfile(entry)
      return teamProfile ? [teamProfile] : []
    })
  } catch {
    return []
  }
}

export function saveTeamProfiles(teamProfiles: TeamProfile[]): void {
  localStorage.setItem(TEAM_PROFILES_STORAGE_KEY, JSON.stringify(teamProfiles))
}
