import { useRef } from 'react'
import { Box } from '@mui/material'
import { AppNavigationRail } from './features/standup/components/AppNavigationRail'
import { PatEntryDialog } from './features/standup/components/PatEntryDialog'
import { StandupContent } from './features/standup/components/StandupContent'
import { useAppNavigation } from './features/standup/hooks/useAppNavigation'
import { useBacklogPageModel } from './features/standup/hooks/useBacklogPageModel'
import { useBoardViewModel } from './features/standup/hooks/useBoardViewModel'
import { useQualityAssurancePageModel } from './features/standup/hooks/useQualityAssurancePageModel'
import { useStandupAppState } from './features/standup/hooks/useStandupAppState'
import { useTeamDataTransferActions } from './features/standup/hooks/useTeamDataTransferActions'
import { buildPatCreationUrl, resolvePatOrganization } from './appSettings'
import type { AssignmentOptions } from './features/standup/utils/assignmentOptions'
import { createDefaultBacklogOptions } from './features/standup/utils/backlogOptions'
import { DEFAULT_CARD_HIGHLIGHT_OPTIONS, type CardHighlightOptions } from './features/standup/utils/cardHighlightOptions'
import type { QaOptions } from './features/standup/utils/qaOptions'
import { createDefaultAssignmentOptions, createDefaultQaOptions } from './features/standup/utils/standupOptionDefaults'
import { createDefaultTriageOptions } from './features/standup/utils/triageOptions'

type AppProps = {
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
}

function App({ colorScheme, onToggleColorScheme }: AppProps) {
  const quickFilterInputRef = useRef<HTMLInputElement | null>(null)
  const qualityAssuranceQuickFilterInputRef = useRef<HTMLInputElement | null>(null)
  const backlogQuickFilterInputRef = useRef<HTMLInputElement | null>(null)
  const triageQuickFilterInputRef = useRef<HTMLInputElement | null>(null)
  const {
    teamProfiles,
    teamProfilesUnreadable,
    qaOptionsUnreadableByTeam,
    storedPatState,
    patConfigured,
    qaOptionsByTeam,
    qaCardHighlightOptionsByTeam,
    assignmentCardHighlightOptions,
    assignmentOptionsByTeam,
    backlogOptionsByTeam,
    triageSettingsByTeam,
    setTriageOptionsForTeam,
    rememberLastView,
    autoRefresh,
    autoRefreshError,
    setAutoRefreshPersisted,
    handleTeamProfilesChange,
    replaceTeamProfiles,
    handlePatSave,
    handlePatClear,
    setQaOptionsForTeam,
    setQaCardHighlightOptionsPersisted,
    setAssignmentCardHighlightOptionsPersisted,
    setAssignmentOptionsForTeam,
    setBacklogOptionsForTeam,
    setRememberLastViewPersisted,
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
    teamDataSyncedAt,
    membersError,
    workItemsError,
    pullRequestBoardItemsError,
    assigneesError,
    assigneesHistoryWarning,
    retryAssigneeHistory,
    members,
    visibleBoardItems,
    currentIterationName,
    iterationWindow,
    iterationLoading,
    changeHighlightsByItemId,
    changeDetailsByItemId,
    effortFlowPoints,
    effortFlowLoading,
    sprintForecast,
    journeysByItemId,
    sprintScope,
    departuresByItemId,
    rolledOverItemIds,
    workItemAssignees,
    boardItems,
    qaBuckets,
    qaBucketsLoading,
    qaBucketsError,
    qaHistoryWarning,
    qaUpdatesByItemId,
    qaTesters,
    qaTestersInferred,
    backlogBugs,
    backlogBugsLoading,
    backlogBugsError,
    backlogSyncedAt,
    triageResult,
    triageLoading,
    triageError,
    triageSyncedAt,
    projectWorkItemStates,
    projectWorkItemTypes,
    selectedAssignmentWorkItemTypes,
    projectWorkItemStatesLoading,
    projectWorkItemStatesError,
    retryProjectWorkItemStates,
    teamIterations,
    teamIterationsLoading,
    teamIterationsError,
  } = useBoardViewModel({
    pat: storedPatState?.pat ?? null,
    autoRefresh,
    teamProfiles,
    qaOptionsByTeam,
    assignmentOptionsByTeam,
    assignmentCardHighlightOptions,
    triageSettingsByTeam,
  })

  const qaOptions = qaOptionsByTeam[selectedTeamId] ?? createDefaultQaOptions()
  const qaCardHighlightOptions = qaCardHighlightOptionsByTeam[selectedTeamId] ?? DEFAULT_CARD_HIGHLIGHT_OPTIONS
  const assignmentOptions = assignmentOptionsByTeam[selectedTeamId] ?? createDefaultAssignmentOptions()
  const backlogOptions = backlogOptionsByTeam[selectedTeamId] ?? createDefaultBacklogOptions()
  const patCreationUrl = buildPatCreationUrl(resolvePatOrganization(teamProfiles))

  const handleQaOptionsChange = (next: QaOptions) => {
    setQaOptionsForTeam(selectedTeamId, next)
  }

  const handleQaCardHighlightOptionsChange = (next: CardHighlightOptions) => {
    setQaCardHighlightOptionsPersisted(selectedTeamId, next)
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
  })

  const {
    quickFilterInput: qualityAssuranceQuickFilterInput,
    onQuickFilterInputChange: onQualityAssuranceQuickFilterInputChange,
    onQuickFilterClear: onQualityAssuranceQuickFilterClear,
    filteredBuckets: filteredQaBuckets,
    filteredBoardItems: filteredQaBoardItems,
  } = useQualityAssurancePageModel({ buckets: qaBuckets, boardItems, qaOptions })

  const {
    quickFilterInput: backlogQuickFilterInput,
    onQuickFilterInputChange: onBacklogQuickFilterInputChange,
    onQuickFilterClear: onBacklogQuickFilterClear,
    filteredBugs: filteredBacklogBugs,
  } = useBacklogPageModel({ bugs: backlogBugs })

  const { activeView } = useAppNavigation({
    patConfigured,
    memberFilterOptions,
    selectedMemberFilter,
    onMemberFilterChange,
    quickFilterInputRefs: {
      development: quickFilterInputRef,
      'qa-activity': qualityAssuranceQuickFilterInputRef,
      backlog: backlogQuickFilterInputRef,
      triage: triageQuickFilterInputRef,
    },
  })

  return (
    <Box sx={{ height: '100dvh', display: 'flex', overflow: 'hidden', bgcolor: 'background.paper' }}>
      <PatEntryDialog open={!patConfigured} onPatSave={handlePatSave} patCreationUrl={patCreationUrl} />

      <AppNavigationRail
        activeView={activeView}
        colorScheme={colorScheme}
        onToggleColorScheme={onToggleColorScheme}
        rememberLastView={rememberLastView}
        autoRefresh={autoRefresh}
        autoRefreshError={autoRefreshError}
        onAutoRefreshChange={setAutoRefreshPersisted}
        onRememberLastViewChange={setRememberLastViewPersisted}
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
        teamProfilesUnreadable={teamProfilesUnreadable}
        testsPageProps={{
          pat: storedPatState?.pat ?? null,
          autoRefresh,
          defaultOrg: teamProfiles.find((team) => team.id === selectedTeamId)?.orgName ?? '',
          defaultProject: teamProfiles.find((team) => team.id === selectedTeamId)?.projectName ?? '',
          teamIterations,
          rememberLastView,
        }}
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
          teamOptions: teamProfiles,
          selectedTeamId,
          onTeamChange,
          teamManagementUrl,
          onRefresh,
          isTeamDataLoading,
          teamDataSyncedAt,
          membersError,
          workItemsError,
          pullRequestBoardItemsError,
          assigneesError,
          assigneesHistoryWarning,
          retryAssigneeHistory,
          members,
          workItems: visibleBoardItems,
          currentIterationName,
          changeHighlightsByItemId,
          changeDetailsByItemId,
          effortFlowPoints,
          effortFlowLoading,
          sprintForecast,
          workItemAssignees,
          iterationWindow,
          iterationLoading,
          tagRules,
          onTagRulesChange: (nextRules) => setTagRules(nextRules),
          cardHighlightOptions: assignmentCardHighlightOptions,
          onCardHighlightOptionsChange: handleAssignmentCardHighlightOptionsChange,
          projectWorkItemTypes,
          projectWorkItemTypesLoading: projectWorkItemStatesLoading,
          projectWorkItemStatesError,
          retryProjectWorkItemStates,
          includeWorkItemTypes: selectedAssignmentWorkItemTypes,
          onIncludeWorkItemTypesChange: (next) => handleAssignmentOptionsChange({ ...assignmentOptions, includeWorkItemTypes: next }),
          sprintFilter: assignmentOptions.sprintFilter,
          onSprintFilterChange: (next) => handleAssignmentOptionsChange({ ...assignmentOptions, sprintFilter: next }),
          hideUsersWithNoActivity: assignmentOptions.hideUsersWithNoActivity,
          onHideUsersWithNoActivityChange: (next) => handleAssignmentOptionsChange({ ...assignmentOptions, hideUsersWithNoActivity: next }),
          hideUsersWithOnlyStaleDoneWork: assignmentOptions.hideUsersWithOnlyStaleDoneWork,
          onHideUsersWithOnlyStaleDoneWorkChange: (next) => handleAssignmentOptionsChange({ ...assignmentOptions, hideUsersWithOnlyStaleDoneWork: next }),
          compactCards: assignmentOptions.compactCards,
          onCompactCardsChange: (next) => handleAssignmentOptionsChange({ ...assignmentOptions, compactCards: next }),
          includeQaTestersInStandup: assignmentOptions.includeQaTestersInStandup,
          onIncludeQaTestersInStandupChange: (next) => handleAssignmentOptionsChange({ ...assignmentOptions, includeQaTestersInStandup: next }),
          qaBuckets,
          qaTesters,
          qaBucketsLoading,
          qaBucketsError,
          teamIterations,
          teamIterationsLoading,
          teamIterationsError,
          journeysByItemId,
          sprintScope,
          departuresByItemId,
          rolledOverItemIds,
          rememberLastView,
        }}
        qualityAssurancePageProps={{
          patConfigured,
          teamOptions: teamProfiles,
          selectedTeamId,
          onTeamChange,
          teamManagementUrl,
          quickFilterInput: qualityAssuranceQuickFilterInput,
          onQuickFilterInputChange: onQualityAssuranceQuickFilterInputChange,
          onQuickFilterClear: onQualityAssuranceQuickFilterClear,
          quickFilterInputRef: qualityAssuranceQuickFilterInputRef,
          buckets: filteredQaBuckets,
          updatesByItemId: qaUpdatesByItemId,
          boardItems: filteredQaBoardItems,
          currentIterationName,
          teamMembers: members,
          testers: qaTesters,
          testersInferred: qaTestersInferred,
          compactCards: assignmentOptions.compactCards,
          lookbackDays: qaOptions.lookbackDays,
          onRefresh,
          isLoading: qaBucketsLoading,
          newItemsError: qaBucketsError,
          historyWarning: qaHistoryWarning,
          qaOptions,
          qaOptionsUnreadable: qaOptionsUnreadableByTeam[selectedTeamId],
          onQaOptionsChange: handleQaOptionsChange,
          cardHighlightOptions: qaCardHighlightOptions,
          onCardHighlightOptionsChange: handleQaCardHighlightOptionsChange,
          projectWorkItemStates,
          projectWorkItemTypes,
          projectWorkItemStatesLoading,
          projectWorkItemStatesError,
          retryProjectWorkItemStates,
          teamIterations,
          teamIterationsLoading,
          teamIterationsError,
          rememberLastView,
        }}
        triagePageProps={{
          patConfigured,
          teamOptions: teamProfiles,
          selectedTeamId,
          onTeamChange,
          teamManagementUrl,
          result: triageResult,
          isLoading: triageLoading,
          error: triageError,
          syncedAt: triageSyncedAt,
          onRefresh,
          options: triageSettingsByTeam[selectedTeamId]?.options ?? createDefaultTriageOptions(),
          settingsError: triageSettingsByTeam[selectedTeamId]?.error ?? null,
          onOptionsChange: (next) => setTriageOptionsForTeam(selectedTeamId, next),
          quickFilterInputRef: triageQuickFilterInputRef,
          iterations: teamIterations,
          iterationsLoading: teamIterationsLoading,
          iterationsError: teamIterationsError,
          rememberLastView,
        }}
        backlogPageProps={{
          patConfigured,
          teamOptions: teamProfiles,
          selectedTeamId,
          onTeamChange,
          teamManagementUrl,
          quickFilterInput: backlogQuickFilterInput,
          onQuickFilterInputChange: onBacklogQuickFilterInputChange,
          onQuickFilterClear: onBacklogQuickFilterClear,
          quickFilterInputRef: backlogQuickFilterInputRef,
          onRefresh,
          bugs: filteredBacklogBugs,
          allBugs: backlogBugs,
          totalBugCount: backlogBugs.length,
          teamIterations,
          isLoading: backlogBugsLoading,
          error: backlogBugsError,
          syncedAt: backlogSyncedAt,
          compactRows: assignmentOptions.compactCards,
          onCompactRowsChange: (next) => handleAssignmentOptionsChange({ ...assignmentOptions, compactCards: next }),
          backlogOptions,
          onBacklogOptionsChange: (next) => setBacklogOptionsForTeam(selectedTeamId, next),
          rememberLastView,
        }}
      />
    </Box>
  )
}

export default App
