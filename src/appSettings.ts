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
const DEFAULT_PAT_ORGANIZATION = 'bentleycs'

export function getTeamProfileLabel(team: TeamProfile): string {
  return `${team.displayName} (${team.orgName}/${team.projectName})`
}

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
  return loadTeamProfilesWithRecovery().profiles
}

export function loadTeamProfilesWithRecovery(): { profiles: TeamProfile[]; unreadable: boolean } {
  const stored = localStorage.getItem(TEAM_PROFILES_STORAGE_KEY)
  if (stored === null) {
    return { profiles: [], unreadable: false }
  }

  try {
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      return { profiles: [], unreadable: true }
    }

    const profiles = parsed.flatMap((entry) => {
      const teamProfile = parseStoredTeamProfile(entry)
      return teamProfile ? [teamProfile] : []
    })
    return { profiles, unreadable: profiles.length !== parsed.length }
  } catch {
    return { profiles: [], unreadable: true }
  }
}

export function saveTeamProfiles(teamProfiles: TeamProfile[]): void {
  localStorage.setItem(TEAM_PROFILES_STORAGE_KEY, JSON.stringify(teamProfiles))
}

export function resolvePatOrganization(teamProfiles: TeamProfile[]): string {
  const firstOrgName = teamProfiles[0]?.orgName?.trim()
  return firstOrgName || DEFAULT_PAT_ORGANIZATION
}

export function buildPatCreationUrl(orgName: string): string {
  return `https://dev.azure.com/${encodeURIComponent(orgName)}/_usersSettings/tokens`
}
