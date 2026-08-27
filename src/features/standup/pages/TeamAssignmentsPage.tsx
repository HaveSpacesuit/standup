import { useState, type RefObject } from 'react'
import { Box } from '@mui/material'
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
        <TeamConfigurationEmptyState pageLabel="Team assignments" />
      ) : (
        <Box component="main" sx={{ flex: 1, minHeight: 0, p: 0, display: 'flex', flexDirection: 'column' }}>
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
                workItems={workItems}
                currentIterationName={currentIterationName}
                changeHighlightsByItemId={changeHighlightsByItemId}
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
