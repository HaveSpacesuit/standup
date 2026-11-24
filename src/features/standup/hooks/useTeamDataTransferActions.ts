import { useCallback } from 'react'
import type { TagRule } from '../../../ado/workItemStatus'
import type { TeamProfile } from '../../../appSettings'
import { buildTeamDataExport, parseImportedTeamData, serializeTeamDataExport, type TeamDataExport } from '../../../teamDataTransfer'
import type { AssignmentOptions } from '../utils/assignmentOptions'
import { createDefaultBacklogOptions, type BacklogOptions } from '../utils/backlogOptions'
import type { QaOptions } from '../utils/qaOptions'
import { createDefaultAssignmentOptions, createDefaultQaOptions } from '../utils/standupOptionDefaults'
import { loadStoredTagRulesForTeam } from './useBoardPreferences'
import { createDefaultTriageOptions, type TriageOptions, type TriageSettings } from '../utils/triageOptions'
import { validateTeamProfile } from '../utils/teamProfileValidation'

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
  handleExportTeamData: (teamId: string, draftProfile?: TeamProfile, stagedImport?: TeamDataExport) => void
  handleImportTeamData: (jsonText: string, finalDraftProfiles?: TeamProfile[]) => void
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
  const handleExportTeamData = useCallback((teamId: string, draftProfile?: TeamProfile, stagedImport?: TeamDataExport) => {
    const teamProfile = draftProfile ?? teamProfiles.find((team) => team.id === teamId)
    if (!teamProfile) {
      throw new Error('Select a team before exporting team data.')
    }
    const validationError = validateTeamProfile(teamProfile)
    if (validationError) throw new Error(validationError.message)
    if (teamProfile.id !== teamId) throw new Error('The export profile must match the selected team.')
    const importedData = stagedImport ? parseImportedTeamData(serializeTeamDataExport(stagedImport)) : undefined
    if (importedData && importedData.teamProfile.id !== teamId) throw new Error('Imported data must match the selected team.')
    if (!importedData && triageSettingsByTeam[teamId]?.error) {
      throw new Error('Resolve the saved Triage options error before exporting this team.')
    }

    const exportPayload = buildTeamDataExport({
      teamProfile,
      assignmentOptions: importedData?.assignmentOptions ?? assignmentOptionsByTeam[teamId] ?? createDefaultAssignmentOptions(),
      assignmentTagRules: importedData?.assignmentTagRules ?? tagRulesByTeam[teamId] ?? loadStoredTagRulesForTeam(teamId),
      qaOptions: importedData?.qaOptions ?? qaOptionsByTeam[teamId] ?? createDefaultQaOptions(),
      backlogOptions: importedData?.backlogOptions ?? backlogOptionsByTeam[teamId] ?? createDefaultBacklogOptions(),
      triageOptions: importedData?.triageOptions ?? triageSettingsByTeam[teamId]?.options ?? createDefaultTriageOptions(),
    })
    const exportText = serializeTeamDataExport(exportPayload)
    const blob = new Blob([exportText], { type: 'application/json' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = toDownloadFileName(teamProfile.displayName)
    try {
      link.click()
    } finally {
      URL.revokeObjectURL(downloadUrl)
    }
  }, [assignmentOptionsByTeam, backlogOptionsByTeam, qaOptionsByTeam, tagRulesByTeam, teamProfiles, triageSettingsByTeam])

  const handleImportTeamData = useCallback((jsonText: string, finalDraftProfiles?: TeamProfile[]) => {
    const importedData = parseImportedTeamData(jsonText)
    const importedTeamId = importedData.teamProfile.id
    const nextTeamProfiles = finalDraftProfiles ?? (teamProfiles.some((team) => team.id === importedTeamId)
      ? teamProfiles.map((team) => (team.id === importedTeamId ? importedData.teamProfile : team))
      : [...teamProfiles, importedData.teamProfile])
    const ids = new Set<string>()
    for (const team of nextTeamProfiles) {
      const validationError = validateTeamProfile(team)
      if (validationError) throw new Error(validationError.message)
      if (!team.id.trim() || ids.has(team.id)) throw new Error('Team IDs must be non-empty and unique.')
      ids.add(team.id)
    }
    if (!ids.has(importedTeamId)) throw new Error('The imported team must be included in the saved team profiles.')

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
