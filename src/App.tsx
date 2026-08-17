import { useRef } from 'react'
import { Box } from '@mui/material'
import { teamProfiles } from './teamProfiles'
import { AppNavigationRail } from './features/standup/components/AppNavigationRail'
import { useAppNavigation } from './features/standup/hooks/useAppNavigation'
import { useBoardViewModel } from './features/standup/hooks/useBoardViewModel'
import { useQualityAssurancePageModel } from './features/standup/hooks/useQualityAssurancePageModel'
import { QualityAssurancePage } from './features/standup/pages/QualityAssurancePage'
import { TeamAssignmentsPage } from './features/standup/pages/TeamAssignmentsPage'

type AppProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
}

function App({ patConfigured, colorScheme, onToggleColorScheme }: AppProps) {
  const quickFilterInputRef = useRef<HTMLInputElement | null>(null)
  const qualityAssuranceQuickFilterInputRef = useRef<HTMLInputElement | null>(null)

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
  } = useBoardViewModel({ patConfigured })

  const {
    quickFilterInput: qualityAssuranceQuickFilterInput,
    onQuickFilterInputChange: onQualityAssuranceQuickFilterInputChange,
    onQuickFilterClear: onQualityAssuranceQuickFilterClear,
    filteredBuckets: filteredQaBuckets,
  } = useQualityAssurancePageModel({ buckets: qaBuckets })

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
          />
        )}
      </Box>
    </Box>
  )
}

export default App
