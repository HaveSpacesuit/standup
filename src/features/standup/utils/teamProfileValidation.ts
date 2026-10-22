import type { TeamProfile } from '../../../appSettings'

export type TeamProfileFormField = keyof Pick<
  TeamProfile,
  'displayName' | 'orgName' | 'projectName' | 'teamName' | 'repoName' | 'areaPath' | 'iterationPath'
>

const REQUIRED_FIELDS: Array<[TeamProfileFormField, string]> = [
  ['displayName', 'Display name'],
  ['orgName', 'Organization'],
  ['projectName', 'Project'],
  ['teamName', 'Azure DevOps team name'],
  ['repoName', 'Repository name'],
  ['areaPath', 'Area path'],
  ['iterationPath', 'Iteration path'],
]

export function validateTeamProfile(teamProfile: TeamProfile): {
  field: TeamProfileFormField
  message: string
} | null {
  const missingField = REQUIRED_FIELDS.find(([field]) => !teamProfile[field].trim())
  return missingField ? { field: missingField[0], message: `${missingField[1]} is required.` } : null
}
