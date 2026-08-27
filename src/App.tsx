import { useRef } from 'react'
import { Box } from '@mui/material'
import { AppNavigationRail } from './features/standup/components/AppNavigationRail'
import { PatEntryDialog } from './features/standup/components/PatEntryDialog'
import { StandupContent } from './features/standup/components/StandupContent'
import { useAppNavigation } from './features/standup/hooks/useAppNavigation'
import { useBoardViewModel } from './features/standup/hooks/useBoardViewModel'
import { useQualityAssurancePageModel } from './features/standup/hooks/useQualityAssurancePageModel'
import { useStandupAppState } from './features/standup/hooks/useStandupAppState'
import { useTeamDataTransferActions } from './features/standup/hooks/useTeamDataTransferActions'
import { buildPatCreationUrl, resolvePatOrganization } from './appSettings'
import type { AssignmentOptions } from './features/standup/utils/assignmentOptions'
import type { CardHighlightOptions } from './features/standup/utils/cardHighlightOptions'
import type { QaOptions } from './features/standup/utils/qaOptions'
import { createDefaultAssignmentOptions, createDefaultQaOptions } from './features/standup/utils/standupOptionDefaults'

type AppProps = {
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
}

function App({ colorScheme, onToggleColorScheme }: AppProps) {
  const quickFilterInputRef = useRef<HTMLInputElement | null>(null)
  const qualityAssuranceQuickFilterInputRef = useRef<HTMLInputElement | null>(null)
  const {
    teamProfiles,
    storedPatState,
    patConfigured,
    qaOptionsByTeam,
    qaCardHighlightOptions,
    assignmentCardHighlightOptions,
    assignmentOptionsByTeam,
    handleTeamProfilesChange,
    replaceTeamProfiles,
    handlePatSave,
    handlePatClear,
    setQaOptionsForTeam,
    setQaCardHighlightOptionsPersisted,
    setAssignmentCardHighlightOptionsPersisted,
    setAssignmentOptionsForTeam,
  } = useStandupAppState()

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
    effortFlowPoints,
    effortFlowLoading,
    visitedStatusesByItemId,
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

  const qaOptions = qaOptionsByTeam[selectedTeamId] ?? createDefaultQaOptions()
  const assignmentOptions = assignmentOptionsByTeam[selectedTeamId] ?? createDefaultAssignmentOptions()
  const patCreationUrl = buildPatCreationUrl(resolvePatOrganization(teamProfiles))

  const handleQaOptionsChange = (next: QaOptions) => {
    setQaOptionsForTeam(selectedTeamId, next)
  }

  const handleQaCardHighlightOptionsChange = (next: CardHighlightOptions) => {
    setQaCardHighlightOptionsPersisted(next)
  }

  const handleAssignmentCardHighlightOptionsChange = (next: CardHighlightOptions) => {
    setAssignmentCardHighlightOptionsPersisted(next)
  }

  const handleAssignmentOptionsChange = (next: AssignmentOptions) => {
    setAssignmentOptionsForTeam(selectedTeamId, next)
  }

  const { handleExportTeamData, handleImportTeamData } = useTeamDataTransferActions({
    teamProfiles,
    qaOptionsByTeam,
    assignmentOptionsByTeam,
    tagRulesByTeam,
    replaceTeamProfiles,
    setAssignmentOptionsForTeam,
    setQaOptionsForTeam,
    setTagRulesForTeam,
    onTeamChange,
  })

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
      <PatEntryDialog open={!patConfigured} onPatSave={handlePatSave} patCreationUrl={patCreationUrl} />

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
        patCreationUrl={patCreationUrl}
      />

      <StandupContent
        activeView={activeView}
        teamAssignmentsPageProps={{
          patConfigured,
          colorScheme,
          quickFilterInput,
          onQuickFilterInputChange: setQuickFilterInput,
          onQuickFilterClear: () => setQuickFilterInput(''),
          quickFilterInputRef,
          selectedMemberFilter,
          memberFilterOptions,
          onMemberFilterChange,
          onMemberFilterCycle,
          teamOptions: teamProfiles,
          selectedTeamId,
          onTeamChange,
          teamManagementUrl,
          onRefresh,
          isTeamDataLoading,
          membersError,
          workItemsError,
          assigneesError,
          members,
          workItems: visibleBoardItems,
          currentIterationName,
          changeHighlightsByItemId,
          effortFlowPoints,
          effortFlowLoading,
          workItemAssignees,
          iterationWindow,
          iterationLoading,
          tagRules,
          onTagRulesChange: (nextRules) => setTagRules(nextRules),
          cardHighlightOptions: assignmentCardHighlightOptions,
          onCardHighlightOptionsChange: handleAssignmentCardHighlightOptionsChange,
          projectWorkItemTypes,
          projectWorkItemTypesLoading: projectWorkItemStatesLoading,
          includeWorkItemTypes: selectedAssignmentWorkItemTypes,
          onIncludeWorkItemTypesChange: (next) => handleAssignmentOptionsChange({ ...assignmentOptions, includeWorkItemTypes: next }),
          sprintFilter: assignmentOptions.sprintFilter,
          onSprintFilterChange: (next) => handleAssignmentOptionsChange({ ...assignmentOptions, sprintFilter: next }),
          teamIterations,
          teamIterationsLoading,
        }}
        qualityAssurancePageProps={{
          patConfigured,
          colorScheme,
          teamOptions: teamProfiles,
          selectedTeamId,
          onTeamChange,
          teamManagementUrl,
          quickFilterInput: qualityAssuranceQuickFilterInput,
          onQuickFilterInputChange: onQualityAssuranceQuickFilterInputChange,
          onQuickFilterClear: onQualityAssuranceQuickFilterClear,
          quickFilterInputRef: qualityAssuranceQuickFilterInputRef,
          buckets: filteredQaBuckets,
          onRefresh,
          isLoading: qaBucketsLoading,
          newItemsError: qaBucketsError,
          qaOptions,
          onQaOptionsChange: handleQaOptionsChange,
          cardHighlightOptions: qaCardHighlightOptions,
          onCardHighlightOptionsChange: handleQaCardHighlightOptionsChange,
          projectWorkItemStates,
          projectWorkItemTypes,
          projectWorkItemStatesLoading,
          teamIterations,
          teamIterationsLoading,
        }}
        sprintSummaryPageProps={{
          teamOptions: teamProfiles,
          selectedTeamId,
          onTeamChange,
          teamManagementUrl,
          patConfigured,
          colorScheme,
          isLoading: isTeamDataLoading,
          workItemsError,
          workItems: visibleBoardItems,
          currentIterationName,
          visitedStatusesByItemId,
          members,
          workItemAssignees,
        }}
      />
    </Box>
  )
}

export default App
