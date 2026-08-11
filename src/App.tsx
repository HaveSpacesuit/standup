import { useRef } from 'react'
import { Box } from '@mui/material'
import { teamProfiles } from './teamProfiles'
import { AppNavigationRail } from './features/standup/components/AppNavigationRail'
import { useAppNavigation } from './features/standup/hooks/useAppNavigation'
import { useBoardViewModel } from './features/standup/hooks/useBoardViewModel'
import { usePullRequestsPageModel } from './features/standup/hooks/usePullRequestsPageModel'
import { PullRequestsPage } from './features/standup/pages/PullRequestsPage'
import { QualityAssurancePage } from './features/standup/pages/QualityAssurancePage'
import { TeamAssignmentsPage } from './features/standup/pages/TeamAssignmentsPage'

type AppProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
}

function App({ patConfigured, colorScheme, onToggleColorScheme }: AppProps) {
  const quickFilterInputRef = useRef<HTMLInputElement | null>(null)

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
    activeTeamPullRequests,
    activeTeamPullRequestsLoading,
    visibleBoardItems,
    currentIterationName,
    iterationWindow,
    iterationLoading,
    changeHighlightsByItemId,
    workItemAssignees,
    qaNewItems,
    qaNewItemsLoading,
    qaNewItemsError,
  } = useBoardViewModel({ patConfigured })

  const {
    selectedAuthorFilter,
    authorFilterOptions,
    onAuthorFilterChange,
    fullApprovalThreshold,
    onFullApprovalThresholdChange,
    filteredPullRequests,
  } = usePullRequestsPageModel({ activeTeamPullRequests })

  const { activeView, onMemberFilterCycle } = useAppNavigation({
    patConfigured,
    memberFilterOptions,
    selectedMemberFilter,
    onMemberFilterChange,
    quickFilterInputRef,
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
        ) : activeView === 'pull-requests' ? (
          <PullRequestsPage
            patConfigured={patConfigured}
            teamOptions={teamProfiles}
            selectedTeamId={selectedTeamId}
            onTeamChange={onTeamChange}
            teamManagementUrl={teamManagementUrl}
            selectedAuthorFilter={selectedAuthorFilter}
            authorFilterOptions={authorFilterOptions}
            onAuthorFilterChange={onAuthorFilterChange}
            fullApprovalThreshold={fullApprovalThreshold}
            onFullApprovalThresholdChange={onFullApprovalThresholdChange}
            onRefresh={onRefresh}
            isPullRequestsLoading={activeTeamPullRequestsLoading}
            pullRequests={filteredPullRequests}
          />
        ) : (
          <QualityAssurancePage
            patConfigured={patConfigured}
            teamOptions={teamProfiles}
            selectedTeamId={selectedTeamId}
            onTeamChange={onTeamChange}
            teamManagementUrl={teamManagementUrl}
            onRefresh={onRefresh}
            isLoading={qaNewItemsLoading}
            newItems={qaNewItems}
            newItemsError={qaNewItemsError}
          />
        )}
      </Box>
    </Box>
  )
}

export default App
