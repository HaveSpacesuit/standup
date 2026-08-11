import { useState, type RefObject } from 'react'
import { Box } from '@mui/material'
import type {
  IterationWindowInfo,
  ResolvedWorkItemAssignee,
  TeamMember,
  WorkItemSummary,
} from '../../../ado/queryEngine'
import type { TagRule } from '../../../ado/workItemStatus'
import type { TeamOption } from '../components/TeamToolbarControls'
import { KanbanBoard } from '../components/KanbanBoard'
import { HiddenTagsDialog } from '../components/HiddenTagsDialog'
import { PatMissingNotice } from '../components/PatMissingNotice'
import { SprintSummaryBar } from '../components/SprintSummaryBar'
import { StandupToolbar } from '../components/StandupToolbar'
import type { ChangeHighlightState } from '../hooks/useAdoHistoryHighlights'

type TeamAssignmentsPageProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
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
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
  iterationWindow: IterationWindowInfo
  iterationLoading: boolean
  tagRules: TagRule[]
  onTagRulesChange: (nextRules: TagRule[]) => void
}

export function TeamAssignmentsPage({
  patConfigured,
  colorScheme,
  onToggleColorScheme,
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
  workItemAssignees,
  iterationWindow,
  iterationLoading,
  tagRules,
  onTagRulesChange,
}: TeamAssignmentsPageProps) {
  const [tagRulesDialogOpen, setTagRulesDialogOpen] = useState(false)

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
        onMemberFilterChange={onMemberFilterChange}
        onMemberFilterCycle={onMemberFilterCycle}
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
        onRefresh={onRefresh}
        onOpenTagRulesDialog={() => setTagRulesDialogOpen(true)}
        isTeamDataLoading={isTeamDataLoading}
      />

      <Box component="main" sx={{ flex: 1, minHeight: 0, p: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, minHeight: 0 }}>
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
        </Box>

        <SprintSummaryBar
          iterationWindow={iterationWindow}
          isLoading={iterationLoading}
          colorScheme={colorScheme}
          onToggleColorScheme={onToggleColorScheme}
        />

        <HiddenTagsDialog
          open={tagRulesDialogOpen}
          tagRules={tagRules}
          onChange={onTagRulesChange}
          onClose={() => setTagRulesDialogOpen(false)}
        />

        {!patConfigured ? <PatMissingNotice /> : null}
      </Box>
    </>
  )
}
