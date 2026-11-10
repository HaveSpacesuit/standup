import { useCallback } from 'react'
import type { TagRule } from '../../../ado/workItemStatus'
import type { TeamProfile } from '../../../appSettings'
import { buildTeamDataExport, parseImportedTeamData, serializeTeamDataExport } from '../../../teamDataTransfer'
import type { AssignmentOptions } from '../utils/assignmentOptions'
import { createDefaultBacklogOptions, type BacklogOptions } from '../utils/backlogOptions'
import type { QaOptions } from '../utils/qaOptions'
import { createDefaultAssignmentOptions, createDefaultQaOptions } from '../utils/standupOptionDefaults'
import { loadStoredTagRulesForTeam } from './useBoardPreferences'
import { createDefaultTriageOptions, type TriageOptions, type TriageSettings } from '../utils/triageOptions'

type UseTeamDataTransferActionsArgs = {
  teamProfiles: TeamProfile[]
  qaOptionsByTeam: Record<string, QaOptions>
  assignmentOptionsByTeam: Record<string, AssignmentOptions>
  backlogOptionsByTeam: Record<string, BacklogOptions>
  triageSettingsByTeam: Record<string, TriageSettings>
  setTriageOptionsForTeam: (teamId: string, options: TriageOptions) => void
  tagRulesByTeam: Record<string, TagRule[]>
  replaceTeamProfiles: (nextTeamProfiles: TeamProfile[]) => void
  setAssignmentOptionsForTeam: (teamId: string, options: AssignmentOptions) => void
  setQaOptionsForTeam: (teamId: string, options: QaOptions) => void
  setBacklogOptionsForTeam: (teamId: string, options: BacklogOptions) => void
  setTagRulesForTeam: (teamId: string, rules: TagRule[]) => void
  onTeamChange: (teamId: string) => void
}

type UseTeamDataTransferActionsResult = {
  handleExportTeamData: (teamId: string) => void
  handleImportTeamData: (jsonText: string) => void
}

function toDownloadFileName(displayName: string): string {
  return `${displayName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'team'}-standup.json`
}

export function useTeamDataTransferActions({
  teamProfiles,
  qaOptionsByTeam,
  assignmentOptionsByTeam,
  backlogOptionsByTeam,
  triageSettingsByTeam,
  setTriageOptionsForTeam,
  tagRulesByTeam,
  replaceTeamProfiles,
  setAssignmentOptionsForTeam,
  setQaOptionsForTeam,
  setBacklogOptionsForTeam,
  setTagRulesForTeam,
  onTeamChange,
}: UseTeamDataTransferActionsArgs): UseTeamDataTransferActionsResult {
  const handleExportTeamData = useCallback((teamId: string) => {
    const teamProfile = teamProfiles.find((team) => team.id === teamId)
    if (!teamProfile) {
      throw new Error('Select a team before exporting team data.')
    }
    if (triageSettingsByTeam[teamId]?.error) {
      throw new Error('Resolve the saved Triage options error before exporting this team.')
    }

    const exportPayload = buildTeamDataExport({
      teamProfile,
      assignmentOptions: assignmentOptionsByTeam[teamId] ?? createDefaultAssignmentOptions(),
      assignmentTagRules: tagRulesByTeam[teamId] ?? loadStoredTagRulesForTeam(teamId),
      qaOptions: qaOptionsByTeam[teamId] ?? createDefaultQaOptions(),
      backlogOptions: backlogOptionsByTeam[teamId] ?? createDefaultBacklogOptions(),
      triageOptions: triageSettingsByTeam[teamId]?.options ?? createDefaultTriageOptions(),
    })
    const exportText = serializeTeamDataExport(exportPayload)
    const blob = new Blob([exportText], { type: 'application/json' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = toDownloadFileName(teamProfile.displayName)
    link.click()
    URL.revokeObjectURL(downloadUrl)
  }, [assignmentOptionsByTeam, backlogOptionsByTeam, qaOptionsByTeam, tagRulesByTeam, teamProfiles, triageSettingsByTeam])

  const handleImportTeamData = useCallback((jsonText: string) => {
    const importedData = parseImportedTeamData(jsonText)
    const importedTeamId = importedData.teamProfile.id
    const nextTeamProfiles = teamProfiles.some((team) => team.id === importedTeamId)
      ? teamProfiles.map((team) => (team.id === importedTeamId ? importedData.teamProfile : team))
      : [...teamProfiles, importedData.teamProfile]

    replaceTeamProfiles(nextTeamProfiles)
    setAssignmentOptionsForTeam(importedTeamId, importedData.assignmentOptions)
    setQaOptionsForTeam(importedTeamId, importedData.qaOptions)
    setBacklogOptionsForTeam(importedTeamId, importedData.backlogOptions)
    setTriageOptionsForTeam(importedTeamId, importedData.triageOptions)
    setTagRulesForTeam(importedTeamId, importedData.assignmentTagRules)
    onTeamChange(importedTeamId)
  }, [
    onTeamChange,
    replaceTeamProfiles,
    setAssignmentOptionsForTeam,
    setBacklogOptionsForTeam,
    setTriageOptionsForTeam,
    setQaOptionsForTeam,
    setTagRulesForTeam,
    teamProfiles,
  ])

  return { handleExportTeamData, handleImportTeamData }
}
