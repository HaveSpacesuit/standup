import { useState, type RefObject } from 'react'
import { Alert, AlertTitle, Box, Typography } from '@mui/material'
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
  members: TeamMember[]
  workItems: WorkItemSummary[]
  currentIterationName: string | null
  changeHighlightsByItemId: Record<number, ChangeHighlightState>
  effortFlowPoints: EffortFlowPoint[]
  effortFlowLoading: boolean
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
  iterationWindow: IterationWindowInfo
  iterationLoading: boolean
  tagRules: TagRule[]
  onTagRulesChange: (nextRules: TagRule[]) => void
  cardHighlightOptions: CardHighlightOptions
  onCardHighlightOptionsChange: (next: CardHighlightOptions) => void
  projectWorkItemTypes: string[]
  projectWorkItemTypesLoading: boolean
  includeWorkItemTypes: string[]
  onIncludeWorkItemTypesChange: (next: string[]) => void
  sprintFilter: AssignmentSprintFilter
  onSprintFilterChange: (next: AssignmentSprintFilter) => void
  teamIterations: TeamIterationOption[]
  teamIterationsLoading: boolean
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
  members,
  workItems,
  currentIterationName,
  changeHighlightsByItemId,
  effortFlowPoints,
  effortFlowLoading,
  workItemAssignees,
  iterationWindow,
  iterationLoading,
  tagRules,
  onTagRulesChange,
  cardHighlightOptions,
  onCardHighlightOptionsChange,
  projectWorkItemTypes,
  projectWorkItemTypesLoading,
  includeWorkItemTypes,
  onIncludeWorkItemTypesChange,
  sprintFilter,
  onSprintFilterChange,
  teamIterations,
  teamIterationsLoading,
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
          {patConfigured && pullRequestBoardItemsError ? (
            <Alert role="alert" severity="warning" sx={{ m: 1, mb: 0 }}>
              <AlertTitle>Pull request data unavailable</AlertTitle>
              {pullRequestBoardItemsError} Check that your Azure DevOps PAT has Code (Read) access and your account can access the repository, then refresh to try again.
            </Alert>
          ) : null}
          {patConfigured && !isTeamDataLoading && !membersError && !workItemsError && !assigneesError && workItems.length === 0 ? (
            <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
              {quickFilterInput.trim() || selectedMemberFilter
                ? 'No cards match your filters. Clear the quick filter or select All team members to restore cards.'
                : 'No cards available for this team and sprint selection. Try Refresh, choose another team, or adjust sprint, work-item type, and hidden-tag filters in Assignments options.'}
            </Typography>
          ) : null}
          <Box sx={{ flex: 1, minHeight: 0 }}>
            {isSprintView ? (
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
            isLoading={iterationLoading}
            effortFlowPoints={effortFlowPoints}
            effortFlowLoading={effortFlowLoading}
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
            includeWorkItemTypes={includeWorkItemTypes}
            onIncludeWorkItemTypesChange={onIncludeWorkItemTypesChange}
            sprintFilter={sprintFilter}
            onSprintFilterChange={onSprintFilterChange}
            teamIterations={teamIterations}
            teamIterationsLoading={teamIterationsLoading}
          />

          {!patConfigured ? <PatMissingNotice /> : null}
        </Box>
      )}
    </>
  )
}
