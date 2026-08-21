import { useRef, useState } from 'react'
import { Box } from '@mui/material'
import { teamProfiles } from './teamProfiles'
import { AppNavigationRail } from './features/standup/components/AppNavigationRail'
import { useAppNavigation } from './features/standup/hooks/useAppNavigation'
import { useBoardViewModel } from './features/standup/hooks/useBoardViewModel'
import { useQualityAssurancePageModel } from './features/standup/hooks/useQualityAssurancePageModel'
import { QualityAssurancePage } from './features/standup/pages/QualityAssurancePage'
import { TeamAssignmentsPage } from './features/standup/pages/TeamAssignmentsPage'
import {
  type QaOptions,
  DEFAULT_QA_LOOKBACK_DAYS,
  EMPTY_SPRINT_FILTER,
  parseStoredQaOptions,
  serializeQaOptions,
  qaOptionsStorageKey,
} from './features/standup/utils/qaOptions'

type AppProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
}

function App({ patConfigured, colorScheme, onToggleColorScheme }: AppProps) {
  const quickFilterInputRef = useRef<HTMLInputElement | null>(null)
  const qualityAssuranceQuickFilterInputRef = useRef<HTMLInputElement | null>(null)

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

  const {
    selectedTeamId,
    onTeamChange,
    onRefresh,
    tagRules,
    setTagRules,
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
    projectWorkItemStatesLoading,
    teamIterations,
    teamIterationsLoading,
  } = useBoardViewModel({ patConfigured, qaOptionsByTeam })

  const qaOptions = qaOptionsByTeam[selectedTeamId] ?? {
    generalFilters: [],
    includeWorkItemTypes: [],
    lookbackDays: DEFAULT_QA_LOOKBACK_DAYS,
    sprintFilter: { ...EMPTY_SPRINT_FILTER },
    stateGroups: null,
    tagGroups: null,
  }

  const handleQaOptionsChange = (next: QaOptions) => {
    setQaOptionsByTeam((prev) => ({ ...prev, [selectedTeamId]: next }))
    localStorage.setItem(qaOptionsStorageKey(selectedTeamId), serializeQaOptions(next))
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
      <AppNavigationRail
        activeView={activeView}
        colorScheme={colorScheme}
        onToggleColorScheme={onToggleColorScheme}
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
