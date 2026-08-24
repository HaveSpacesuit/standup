import { useRef, useState } from 'react'
import { Box } from '@mui/material'
import { clearStoredPat, loadStoredPat, saveStoredPat, type StoredPatState } from './adoAuth'
import type { TeamProfile } from './teamConfig'
import { loadTeamProfiles, saveTeamProfiles } from './teamConfig'
import { buildTeamDataExport, parseImportedTeamData, serializeTeamDataExport } from './teamDataTransfer'
import { AppNavigationRail } from './features/standup/components/AppNavigationRail'
import { PatEntryDialog } from './features/standup/components/PatEntryDialog'
import { useAppNavigation } from './features/standup/hooks/useAppNavigation'
import { loadStoredTagRulesForTeam, tagRulesStorageKey } from './features/standup/hooks/useBoardPreferences'
import { useBoardViewModel } from './features/standup/hooks/useBoardViewModel'
import { useQualityAssurancePageModel } from './features/standup/hooks/useQualityAssurancePageModel'
import { QualityAssurancePage } from './features/standup/pages/QualityAssurancePage'
import { TeamAssignmentsPage } from './features/standup/pages/TeamAssignmentsPage'
import {
  type CardHighlightOptions,
  ASSIGNMENTS_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY,
  DEFAULT_CARD_HIGHLIGHT_OPTIONS,
  QA_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY,
  parseStoredCardHighlightOptions,
  serializeCardHighlightOptions,
} from './features/standup/utils/cardHighlightOptions'
import {
  type QaOptions,
  DEFAULT_QA_LOOKBACK_DAYS,
  EMPTY_SPRINT_FILTER,
  parseStoredQaOptions,
  serializeQaOptions,
  qaOptionsStorageKey,
} from './features/standup/utils/qaOptions'
import {
  type AssignmentOptions,
  DEFAULT_ASSIGNMENT_SPRINT_FILTER,
  assignmentOptionsStorageKey,
  parseStoredAssignmentOptions,
  serializeAssignmentOptions,
} from './features/standup/utils/assignmentOptions'

type AppProps = {
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
}

function App({ colorScheme, onToggleColorScheme }: AppProps) {
  const quickFilterInputRef = useRef<HTMLInputElement | null>(null)
  const qualityAssuranceQuickFilterInputRef = useRef<HTMLInputElement | null>(null)
  const [teamProfiles, setTeamProfiles] = useState<TeamProfile[]>(loadTeamProfiles)
  const [storedPatState, setStoredPatState] = useState<StoredPatState | null>(() => loadStoredPat())
  const patConfigured = storedPatState !== null

  // Per-team qaOptions — keyed by teamId so each team's state groups persist independently.
  // Eagerly initialized from localStorage so it's available before useBoardViewModel runs.
  const [qaOptionsByTeam, setQaOptionsByTeam] = useState<Record<string, QaOptions>>(() =>
    Object.fromEntries(
      teamProfiles.map((team) => [
        team.id,
        parseStoredQaOptions(localStorage.getItem(qaOptionsStorageKey(team.id))),
      ]),
    ),
  )
  const [qaCardHighlightOptions, setQaCardHighlightOptions] = useState<CardHighlightOptions>(() => {
    const existing = localStorage.getItem(QA_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY)
    return existing ? parseStoredCardHighlightOptions(existing) : DEFAULT_CARD_HIGHLIGHT_OPTIONS
  })
  const [assignmentCardHighlightOptions, setAssignmentCardHighlightOptions] = useState<CardHighlightOptions>(() => {
    const existing = localStorage.getItem(ASSIGNMENTS_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY)
    return existing ? parseStoredCardHighlightOptions(existing) : DEFAULT_CARD_HIGHLIGHT_OPTIONS
  })
  const [assignmentOptionsByTeam, setAssignmentOptionsByTeam] = useState<Record<string, AssignmentOptions>>(() =>
    Object.fromEntries(
      teamProfiles.map((team) => [
        team.id,
        parseStoredAssignmentOptions(localStorage.getItem(assignmentOptionsStorageKey(team.id))),
      ]),
    ),
  )

  const handleTeamProfilesChange = (nextTeamProfiles: TeamProfile[]) => {
    const nextTeamIds = new Set(nextTeamProfiles.map((team) => team.id))

    for (const team of teamProfiles) {
      if (!nextTeamIds.has(team.id)) {
        localStorage.removeItem(qaOptionsStorageKey(team.id))
        localStorage.removeItem(assignmentOptionsStorageKey(team.id))
        localStorage.removeItem(tagRulesStorageKey(team.id))
      }
    }

    saveTeamProfiles(nextTeamProfiles)
    setTeamProfiles(nextTeamProfiles)
    setQaOptionsByTeam((previous) => Object.fromEntries(
      Object.entries(previous).filter(([teamId]) => nextTeamIds.has(teamId)),
    ))
    setAssignmentOptionsByTeam((previous) => Object.fromEntries(
      Object.entries(previous).filter(([teamId]) => nextTeamIds.has(teamId)),
    ))
  }

  const handlePatSave = (pat: string) => {
    setStoredPatState(saveStoredPat(pat))
  }

  const handlePatClear = () => {
    clearStoredPat()
    setStoredPatState(null)
  }

  const {
    selectedTeamId,
    onTeamChange,
    onRefresh,
    tagRules,
    tagRulesByTeam,
    setTagRules,
    setTagRulesForTeam,
    quickFilterInput,
    setQuickFilterInput,
    selectedMemberFilter,
    onMemberFilterChange,
    memberFilterOptions,
    teamManagementUrl,
    isTeamDataLoading,
    membersError,
    workItemsError,
    assigneesError,
    members,
    visibleBoardItems,
    currentIterationName,
    iterationWindow,
    iterationLoading,
    changeHighlightsByItemId,
    workItemAssignees,
    qaBuckets,
    qaBucketsLoading,
    qaBucketsError,
    projectWorkItemStates,
    projectWorkItemTypes,
    selectedAssignmentWorkItemTypes,
    projectWorkItemStatesLoading,
    teamIterations,
    teamIterationsLoading,
  } = useBoardViewModel({
    pat: storedPatState?.pat ?? null,
    teamProfiles,
    qaOptionsByTeam,
    assignmentOptionsByTeam,
    assignmentCardHighlightOptions,
  })

  const qaOptions = qaOptionsByTeam[selectedTeamId] ?? {
    generalFilters: [],
    includeWorkItemTypes: [],
    lookbackDays: DEFAULT_QA_LOOKBACK_DAYS,
    sprintFilter: { ...EMPTY_SPRINT_FILTER },
    stateGroups: null,
    tagGroups: null,
  }
  const assignmentOptions = assignmentOptionsByTeam[selectedTeamId] ?? {
    includeWorkItemTypes: [],
    sprintFilter: { ...DEFAULT_ASSIGNMENT_SPRINT_FILTER },
  }

  const handleQaOptionsChange = (next: QaOptions) => {
    setQaOptionsByTeam((prev) => ({ ...prev, [selectedTeamId]: next }))
    localStorage.setItem(qaOptionsStorageKey(selectedTeamId), serializeQaOptions(next))
  }

  const handleQaCardHighlightOptionsChange = (next: CardHighlightOptions) => {
    setQaCardHighlightOptions(next)
    localStorage.setItem(QA_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY, serializeCardHighlightOptions(next))
  }

  const handleAssignmentCardHighlightOptionsChange = (next: CardHighlightOptions) => {
    setAssignmentCardHighlightOptions(next)
    localStorage.setItem(ASSIGNMENTS_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY, serializeCardHighlightOptions(next))
  }

  const handleAssignmentOptionsChange = (next: AssignmentOptions) => {
    setAssignmentOptionsByTeam((prev) => ({ ...prev, [selectedTeamId]: next }))
    localStorage.setItem(assignmentOptionsStorageKey(selectedTeamId), serializeAssignmentOptions(next))
  }

  const handleExportTeamData = (teamId: string) => {
    const teamProfile = teamProfiles.find((team) => team.id === teamId)
    if (!teamProfile) {
      throw new Error('Select a team before exporting team data.')
    }

    const exportPayload = buildTeamDataExport({
      teamProfile,
      assignmentOptions: assignmentOptionsByTeam[teamId] ?? {
        includeWorkItemTypes: [],
        sprintFilter: { ...DEFAULT_ASSIGNMENT_SPRINT_FILTER },
      },
      assignmentTagRules: tagRulesByTeam[teamId] ?? loadStoredTagRulesForTeam(teamId),
      qaOptions: qaOptionsByTeam[teamId] ?? {
        generalFilters: [],
        includeWorkItemTypes: [],
        lookbackDays: DEFAULT_QA_LOOKBACK_DAYS,
        sprintFilter: { ...EMPTY_SPRINT_FILTER },
        stateGroups: null,
        tagGroups: null,
      },
    })
    const exportText = serializeTeamDataExport(exportPayload)
    const blob = new Blob([exportText], { type: 'application/json' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${teamProfile.displayName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'team'}-standup.json`
    link.click()
    URL.revokeObjectURL(downloadUrl)
  }

  const handleImportTeamData = (jsonText: string) => {
    const importedData = parseImportedTeamData(jsonText)
    const importedTeamId = importedData.teamProfile.id
    const nextTeamProfiles = teamProfiles.some((team) => team.id === importedTeamId)
      ? teamProfiles.map((team) => (team.id === importedTeamId ? importedData.teamProfile : team))
      : [...teamProfiles, importedData.teamProfile]

    saveTeamProfiles(nextTeamProfiles)
    setTeamProfiles(nextTeamProfiles)

    setAssignmentOptionsByTeam((previous) => ({
      ...previous,
      [importedTeamId]: importedData.assignmentOptions,
    }))
    localStorage.setItem(
      assignmentOptionsStorageKey(importedTeamId),
      serializeAssignmentOptions(importedData.assignmentOptions),
    )

    setQaOptionsByTeam((previous) => ({
      ...previous,
      [importedTeamId]: importedData.qaOptions,
    }))
    localStorage.setItem(
      qaOptionsStorageKey(importedTeamId),
      serializeQaOptions(importedData.qaOptions),
    )

    setTagRulesForTeam(importedTeamId, importedData.assignmentTagRules)
    onTeamChange(importedTeamId)
  }

  const {
    quickFilterInput: qualityAssuranceQuickFilterInput,
    onQuickFilterInputChange: onQualityAssuranceQuickFilterInputChange,
    onQuickFilterClear: onQualityAssuranceQuickFilterClear,
    filteredBuckets: filteredQaBuckets,
  } = useQualityAssurancePageModel({ buckets: qaBuckets, qaOptions })

  const { activeView, onMemberFilterCycle } = useAppNavigation({
    patConfigured,
    memberFilterOptions,
    selectedMemberFilter,
    onMemberFilterChange,
    quickFilterInputRefs: {
      'team-assignments': quickFilterInputRef,
      'qa-activity': qualityAssuranceQuickFilterInputRef,
    },
  })

  return (
    <Box sx={{ height: '100vh', display: 'flex', bgcolor: 'background.paper' }}>
      <PatEntryDialog open={!patConfigured} onPatSave={handlePatSave} />

      <AppNavigationRail
        activeView={activeView}
        colorScheme={colorScheme}
        onToggleColorScheme={onToggleColorScheme}
        patConfigured={patConfigured}
        patValue={storedPatState?.pat ?? ''}
        onPatSave={handlePatSave}
        onPatClear={handlePatClear}
        onExportTeamData={handleExportTeamData}
        onImportTeamData={handleImportTeamData}
        selectedTeamId={selectedTeamId}
        teamProfiles={teamProfiles}
        onTeamProfilesChange={handleTeamProfilesChange}
      />

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {activeView === 'team-assignments' ? (
          <TeamAssignmentsPage
            patConfigured={patConfigured}
            colorScheme={colorScheme}
            quickFilterInput={quickFilterInput}
            onQuickFilterInputChange={setQuickFilterInput}
            onQuickFilterClear={() => setQuickFilterInput('')}
            quickFilterInputRef={quickFilterInputRef}
            selectedMemberFilter={selectedMemberFilter}
            memberFilterOptions={memberFilterOptions}
            onMemberFilterChange={onMemberFilterChange}
            onMemberFilterCycle={onMemberFilterCycle}
            teamOptions={teamProfiles}
            selectedTeamId={selectedTeamId}
            onTeamChange={onTeamChange}
            teamManagementUrl={teamManagementUrl}
            onRefresh={onRefresh}
            isTeamDataLoading={isTeamDataLoading}
            membersError={membersError}
            workItemsError={workItemsError}
            assigneesError={assigneesError}
            members={members}
            workItems={visibleBoardItems}
            currentIterationName={currentIterationName}
            changeHighlightsByItemId={changeHighlightsByItemId}
            workItemAssignees={workItemAssignees}
            iterationWindow={iterationWindow}
            iterationLoading={iterationLoading}
            tagRules={tagRules}
            onTagRulesChange={(nextRules) => setTagRules(nextRules)}
            cardHighlightOptions={assignmentCardHighlightOptions}
            onCardHighlightOptionsChange={handleAssignmentCardHighlightOptionsChange}
            projectWorkItemTypes={projectWorkItemTypes}
            projectWorkItemTypesLoading={projectWorkItemStatesLoading}
            includeWorkItemTypes={selectedAssignmentWorkItemTypes}
            onIncludeWorkItemTypesChange={(next) => handleAssignmentOptionsChange({ ...assignmentOptions, includeWorkItemTypes: next })}
            sprintFilter={assignmentOptions.sprintFilter}
            onSprintFilterChange={(next) => handleAssignmentOptionsChange({ ...assignmentOptions, sprintFilter: next })}
            teamIterations={teamIterations}
            teamIterationsLoading={teamIterationsLoading}
          />
        ) : (
          <QualityAssurancePage
            patConfigured={patConfigured}
            colorScheme={colorScheme}
            teamOptions={teamProfiles}
            selectedTeamId={selectedTeamId}
            onTeamChange={onTeamChange}
            teamManagementUrl={teamManagementUrl}
            quickFilterInput={qualityAssuranceQuickFilterInput}
            onQuickFilterInputChange={onQualityAssuranceQuickFilterInputChange}
            onQuickFilterClear={onQualityAssuranceQuickFilterClear}
            quickFilterInputRef={qualityAssuranceQuickFilterInputRef}
            buckets={filteredQaBuckets}
            onRefresh={onRefresh}
            isLoading={qaBucketsLoading}
            newItemsError={qaBucketsError}
            qaOptions={qaOptions}
            onQaOptionsChange={handleQaOptionsChange}
            cardHighlightOptions={qaCardHighlightOptions}
            onCardHighlightOptionsChange={handleQaCardHighlightOptionsChange}
            projectWorkItemStates={projectWorkItemStates}
            projectWorkItemTypes={projectWorkItemTypes}
            projectWorkItemStatesLoading={projectWorkItemStatesLoading}
            teamIterations={teamIterations}
            teamIterationsLoading={teamIterationsLoading}
          />
        )}
      </Box>
    </Box>
  )
}

export default App
