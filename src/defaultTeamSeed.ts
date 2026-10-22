import explorerTemplate from '../templates/projectwise-explorer-standup.json'
import webTemplate from '../templates/projectwise-web-standup.json'
import type { TeamProfile } from './appSettings'
import { TEAM_PROFILES_STORAGE_KEY, parseStoredTeamProfiles } from './appSettings'
import { parseImportedTeamData } from './teamDataTransfer'
import { assignmentOptionsStorageKey, serializeAssignmentOptions } from './features/standup/utils/assignmentOptions'
import { qaOptionsStorageKey, serializeQaOptions } from './features/standup/utils/qaOptions'
import { tagRulesStorageKey } from './features/standup/hooks/useBoardPreferences'

const DEFAULT_TEAM_TEMPLATES: unknown[] = [webTemplate, explorerTemplate]

function seedDefaultTeamProfiles(): { teamProfiles: TeamProfile[]; snapshot: string } {
  const seededProfiles: TeamProfile[] = []

  for (const template of DEFAULT_TEAM_TEMPLATES) {
    let teamData
    try {
      teamData = parseImportedTeamData(JSON.stringify(template))
    } catch {
      continue
    }

    const teamId = teamData.teamProfile.id
    localStorage.setItem(assignmentOptionsStorageKey(teamId), serializeAssignmentOptions(teamData.assignmentOptions))
    localStorage.setItem(qaOptionsStorageKey(teamId), serializeQaOptions(teamData.qaOptions))
    localStorage.setItem(tagRulesStorageKey(teamId), JSON.stringify(teamData.assignmentTagRules))
    seededProfiles.push(teamData.teamProfile)
  }

  const snapshot = JSON.stringify(seededProfiles)
  localStorage.setItem(TEAM_PROFILES_STORAGE_KEY, snapshot)
  return { teamProfiles: seededProfiles, snapshot }
}

/** Seeds bundled team templates only on first run; any stored value (including an empty list) is left alone. */
export function loadTeamProfilesWithDefaults(): { teamProfiles: TeamProfile[]; snapshot: string } {
  const snapshot = localStorage.getItem(TEAM_PROFILES_STORAGE_KEY)
  if (snapshot !== null) {
    return { teamProfiles: parseStoredTeamProfiles(snapshot), snapshot }
  }

  return seedDefaultTeamProfiles()
}
