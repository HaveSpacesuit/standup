import { useState, type RefObject } from 'react'
import { Alert, AlertTitle, Box, Button, Typography } from '@mui/material'
import type {
  IterationWindowInfo,
  ResolvedWorkItemAssignee,
  TeamIterationOption,
  TeamMember,
  WorkItemSummary,
} from '../../../ado/queryEngine'
import type { TagRule } from '../../../ado/workItemStatus'
import type { TeamOption } from '../components/TeamToolbarControls'
import { KanbanBoard } from '../components/KanbanBoard'
import { SprintViewBoard } from '../components/SprintSummaryBoard'
import { HiddenTagsDialog } from '../components/HiddenTagsDialog'
import { PatMissingNotice } from '../components/PatMissingNotice'
import { SprintSummaryBar } from '../components/SprintSummaryBar'
import { StandupToolbar } from '../components/StandupToolbar'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'
import type { ChangeHighlightState } from '../hooks/useAdoHistoryHighlights'
import type { EffortFlowPoint } from '../hooks/useEffortFlowHistory'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import type { AssignmentSprintFilter } from '../utils/assignmentOptions'
import type { SprintForecast } from '../utils/sprintForecast'

type TeamAssignmentsPageProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  selectedMemberFilter: string
  memberFilterOptions: string[]
  onMemberFilterChange: (value: string) => void
  onMemberFilterCycle: (direction: -1 | 1) => void
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  onRefresh: () => void
  isTeamDataLoading: boolean
  membersError: string | null
  workItemsError: string | null
  pullRequestBoardItemsError: string | null
  assigneesError: string | null
  assigneesHistoryWarning: string | null
  retryAssigneeHistory: () => void
  members: TeamMember[]
  workItems: WorkItemSummary[]
  currentIterationName: string | null
  changeHighlightsByItemId: Record<number, ChangeHighlightState>
  effortFlowPoints: EffortFlowPoint[]
  effortFlowLoading: boolean
  sprintForecast: SprintForecast
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
  iterationWindow: IterationWindowInfo
  iterationLoading: boolean
  tagRules: TagRule[]
  onTagRulesChange: (nextRules: TagRule[]) => void
  cardHighlightOptions: CardHighlightOptions
  onCardHighlightOptionsChange: (next: CardHighlightOptions) => void
  projectWorkItemTypes: string[]
  projectWorkItemTypesLoading: boolean
  projectWorkItemStatesError?: string | null
  retryProjectWorkItemStates?: () => void
  includeWorkItemTypes: string[]
  onIncludeWorkItemTypesChange: (next: string[]) => void
  sprintFilter: AssignmentSprintFilter
  onSprintFilterChange: (next: AssignmentSprintFilter) => void
  hideUsersWithNoActivity: boolean
  onHideUsersWithNoActivityChange: (next: boolean) => void
  teamIterations: TeamIterationOption[]
  teamIterationsLoading: boolean
  teamIterationsError: string | null
  visitedStatusesByItemId: Record<number, import('../utils/statusColumnStyles').StatusColumn[]>
  rolledOverItemIds: Record<number, boolean>
}

export function TeamAssignmentsPage({
  patConfigured,
  colorScheme,
  quickFilterInput,
  onQuickFilterInputChange,
  onQuickFilterClear,
  quickFilterInputRef,
  selectedMemberFilter,
  memberFilterOptions,
  onMemberFilterChange,
  onMemberFilterCycle,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  onRefresh,
  isTeamDataLoading,
  membersError,
  workItemsError,
  pullRequestBoardItemsError,
  assigneesError,
  assigneesHistoryWarning,
  retryAssigneeHistory,
  members,
  workItems,
  currentIterationName,
  changeHighlightsByItemId,
  effortFlowPoints,
  effortFlowLoading,
  sprintForecast,
  workItemAssignees,
  iterationWindow,
  iterationLoading,
  tagRules,
  onTagRulesChange,
  cardHighlightOptions,
  onCardHighlightOptionsChange,
  projectWorkItemTypes,
  projectWorkItemTypesLoading,
  projectWorkItemStatesError,
  retryProjectWorkItemStates,
  includeWorkItemTypes,
  onIncludeWorkItemTypesChange,
  sprintFilter,
  onSprintFilterChange,
  hideUsersWithNoActivity,
  onHideUsersWithNoActivityChange,
  teamIterations,
  teamIterationsLoading,
  teamIterationsError,
  visitedStatusesByItemId,
  rolledOverItemIds,
}: TeamAssignmentsPageProps) {
  const [tagRulesDialogOpen, setTagRulesDialogOpen] = useState(false)
  const [isSprintView, setIsSprintView] = useState(false)
  const hasConfiguredTeams = teamOptions.length > 0

  return (
    <>
      <StandupToolbar
        patConfigured={patConfigured}
        quickFilterInput={quickFilterInput}
        onQuickFilterInputChange={onQuickFilterInputChange}
        onQuickFilterClear={onQuickFilterClear}
        quickFilterInputRef={quickFilterInputRef}
        selectedMemberFilter={selectedMemberFilter}
        memberFilterOptions={memberFilterOptions}
        members={members}
        onMemberFilterChange={onMemberFilterChange}
        onMemberFilterCycle={onMemberFilterCycle}
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
        onRefresh={onRefresh}
        onOpenTagRulesDialog={() => setTagRulesDialogOpen(true)}
        isTeamDataLoading={isTeamDataLoading}
        isSprintView={isSprintView}
        onSprintViewChange={setIsSprintView}
      />

      {!hasConfiguredTeams ? (
        <TeamConfigurationEmptyState pageLabel="Development" />
      ) : (
        <Box component="main" sx={{ flex: 1, minHeight: 0, p: 0, display: 'flex', flexDirection: 'column' }}>
          {patConfigured && teamIterationsError ? (
            <Alert
              role="alert"
              severity="error"
              action={<Button size="small" onClick={onRefresh}>Retry</Button>}
              sx={{ m: 1, mb: 0 }}
            >
              <AlertTitle>Unable to load team iterations</AlertTitle>
              Azure DevOps team settings/iterations request failed: {teamIterationsError} Board results are withheld because the sprint selection could not be verified. Refresh to retry.
            </Alert>
          ) : null}
          {patConfigured && pullRequestBoardItemsError ? (
            <Alert role="alert" severity="warning" sx={{ m: 1, mb: 0 }}>
              <AlertTitle>Pull request data unavailable</AlertTitle>
              {pullRequestBoardItemsError} Check that your Azure DevOps PAT has Code (Read) access and your account can access the repository, then refresh to try again.
            </Alert>
          ) : null}
          {patConfigured && assigneesHistoryWarning ? (
            <Alert
              role="alert"
              severity="warning"
              action={<Button size="small" onClick={retryAssigneeHistory}>Retry</Button>}
              sx={{ m: 1, mb: 0 }}
            >
              <AlertTitle>Assignee history unavailable</AlertTitle>
              {assigneesHistoryWarning}
            </Alert>
          ) : null}
          {patConfigured && !teamIterationsError && !isTeamDataLoading && !membersError && !workItemsError && !assigneesError && workItems.length === 0 ? (
            <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
              {quickFilterInput.trim() || selectedMemberFilter
                ? 'No cards match your filters. Clear the quick filter or select All team members to restore cards.'
                : 'No cards available for this team and sprint selection. Try Refresh, choose another team, or adjust sprint, work-item type, and hidden-tag filters in Assignments options.'}
            </Typography>
          ) : null}
          <Box sx={{ flex: 1, minHeight: 0 }}>
            {teamIterationsError ? null : isSprintView ? (
              <SprintViewBoard
                patConfigured={patConfigured}
                isLoading={isTeamDataLoading}
                colorScheme={colorScheme}
                workItemsError={workItemsError}
                workItems={workItems}
                currentIterationName={currentIterationName}
                visitedStatusesByItemId={visitedStatusesByItemId}
                members={members}
                workItemAssignees={workItemAssignees}
                changeHighlightsByItemId={changeHighlightsByItemId}
              />
            ) : (
              <KanbanBoard
                patConfigured={patConfigured}
                isLoading={isTeamDataLoading}
                colorScheme={colorScheme}
                membersError={membersError}
                workItemsError={workItemsError}
                assigneesError={assigneesError}
                members={members}
                selectedMemberFilter={selectedMemberFilter}
                hideUsersWithNoActivity={hideUsersWithNoActivity}
                workItems={workItems}
                currentIterationName={currentIterationName}
                changeHighlightsByItemId={changeHighlightsByItemId}
                rolledOverItemIds={rolledOverItemIds}
                workItemAssignees={workItemAssignees}
              />
            )}
          </Box>

          <SprintSummaryBar
            iterationWindow={iterationWindow}
            isLoading={iterationLoading || teamIterationsLoading}
            error={teamIterationsError}
            effortFlowPoints={effortFlowPoints}
            effortFlowLoading={effortFlowLoading}
            sprintForecast={isTeamDataLoading
              ? { status: 'loading' }
              : membersError || workItemsError || assigneesError
                ? { status: 'unavailable', reason: 'Board data could not be loaded. Refresh to retry.' }
                : sprintForecast}
            colorScheme={colorScheme}
          />

          <HiddenTagsDialog
            open={tagRulesDialogOpen}
            tagRules={tagRules}
            onChange={onTagRulesChange}
            onClose={() => setTagRulesDialogOpen(false)}
            cardHighlightOptions={cardHighlightOptions}
            onCardHighlightOptionsChange={onCardHighlightOptionsChange}
            projectWorkItemTypes={projectWorkItemTypes}
            projectWorkItemTypesLoading={projectWorkItemTypesLoading}
            projectWorkItemStatesError={projectWorkItemStatesError}
            retryProjectWorkItemStates={retryProjectWorkItemStates}
            includeWorkItemTypes={includeWorkItemTypes}
            onIncludeWorkItemTypesChange={onIncludeWorkItemTypesChange}
            sprintFilter={sprintFilter}
            onSprintFilterChange={onSprintFilterChange}
            hideUsersWithNoActivity={hideUsersWithNoActivity}
            onHideUsersWithNoActivityChange={onHideUsersWithNoActivityChange}
            teamIterations={teamIterations}
            teamIterationsLoading={teamIterationsLoading}
          />

          {!patConfigured ? <PatMissingNotice /> : null}
        </Box>
      )}
    </>
  )
}
