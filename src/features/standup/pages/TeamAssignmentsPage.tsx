import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
import { Alert, AlertTitle, Box, Button, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgHistory from '@stratakit/icons/history.svg'
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
import { HiddenTagsDialog } from '../components/HiddenTagsDialog'
import { PatMissingNotice } from '../components/PatMissingNotice'
import { SprintRibbon } from '../components/SprintRibbon'
import { SprintReplayBar, type SprintReplayStatus } from '../components/SprintReplayBar'
import { StandupToolbar } from '../components/StandupToolbar'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'
import type { CardChangeDetail, ChangeHighlightState } from '../hooks/useAdoHistoryHighlights'
import { useCardFlip } from '../hooks/useCardFlip'
import type { EffortFlowPoint } from '../hooks/useEffortFlowHistory'
import { useSprintReplay } from '../hooks/useSprintReplay'
import type { SprintScopeState } from '../hooks/useSprintScopeChanges'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import type { AssignmentSprintFilter } from '../utils/assignmentOptions'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import type { SprintForecast } from '../utils/sprintForecast'
import type { SprintDeparture, SprintJourney } from '../utils/sprintJourney'
import { getCurrentSprintEffortTotals } from '../utils/sprintEffortTotals'
import { formatReplayDate, getSprintReplayTimeline } from '../utils/sprintReplay'

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
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  onRefresh: () => void
  isTeamDataLoading: boolean
  teamDataSyncedAt?: number | null
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
  changeDetailsByItemId?: Record<number, CardChangeDetail>
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
  hideUsersWithOnlyStaleDoneWork: boolean
  onHideUsersWithOnlyStaleDoneWorkChange: (next: boolean) => void
  compactCards?: boolean
  onCompactCardsChange?: (next: boolean) => void
  includeQaTestersInStandup: boolean
  onIncludeQaTestersInStandupChange: (next: boolean) => void
  qaBuckets: QualityAssuranceBucket[]
  qaTesters: TeamMember[]
  qaBucketsLoading: boolean
  qaBucketsError: string | null
  teamIterations: TeamIterationOption[]
  teamIterationsLoading: boolean
  teamIterationsError: string | null
  journeysByItemId: Record<number, SprintJourney>
  /** Sprint-start membership, which splits the Sprint view into committed, added, and removed lanes. */
  sprintScope?: SprintScopeState
  departuresByItemId?: Record<number, SprintDeparture>
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
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  onRefresh,
  isTeamDataLoading,
  teamDataSyncedAt = null,
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
  changeDetailsByItemId,
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
  hideUsersWithOnlyStaleDoneWork,
  onHideUsersWithOnlyStaleDoneWorkChange,
  compactCards = false,
  onCompactCardsChange,
  includeQaTestersInStandup,
  onIncludeQaTestersInStandupChange,
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
}: TeamAssignmentsPageProps) {
  const [tagRulesDialogOpen, setTagRulesDialogOpen] = useState(false)
  const [isSprintView, setIsSprintView] = useState(false)
  const [standupActive, setStandupActive] = useState(false)
  const hasConfiguredTeams = teamOptions.length > 0
  const standupLive = standupActive && !isSprintView && !teamIterationsError
  const sprintEffortTotals = useMemo(
    () => getCurrentSprintEffortTotals(workItems, currentIterationName),
    [workItems, currentIterationName],
  )

  const boardRef = useRef<HTMLDivElement>(null)
  const captureCards = useCardFlip(boardRef)
  const replayTimeline = useMemo(() => getSprintReplayTimeline(effortFlowPoints), [effortFlowPoints])
  const replayStatus: SprintReplayStatus = effortFlowLoading || isTeamDataLoading
    ? 'loading'
    : replayTimeline && replayTimeline.todayIndex > 0 && Object.keys(journeysByItemId).length > 0 ? 'ready' : 'unavailable'
  const replayReady = isSprintView && replayStatus === 'ready' && !teamIterationsError
  const replay = useSprintReplay(replayReady ? replayTimeline : null, captureCards)
  const resetReplay = replay.reset

  // Standup walks every lane, so it starts from the whole team in the People view.
  const startStandup = () => {
    onMemberFilterChange('')
    resetReplay()
    setIsSprintView(false)
    setStandupActive(true)
  }
  const endStandup = useCallback(() => setStandupActive(false), [])
  const handleSprintViewChange = (nextIsSprintView: boolean) => {
    if (nextIsSprintView) {
      setStandupActive(false)
    }
    resetReplay()
    setIsSprintView(nextIsSprintView)
  }
  const handleTeamChange = (value: string) => {
    setStandupActive(false)
    resetReplay()
    onTeamChange(value)
  }

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
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={handleTeamChange}
        teamManagementUrl={teamManagementUrl}
        onRefresh={onRefresh}
        onOpenTagRulesDialog={() => setTagRulesDialogOpen(true)}
        isTeamDataLoading={isTeamDataLoading}
        teamDataSyncedAt={teamDataSyncedAt}
        isSprintView={isSprintView}
        onSprintViewChange={handleSprintViewChange}
        standupActive={standupLive}
        onStartStandup={hasConfiguredTeams ? startStandup : undefined}
        onReplaySprint={hasConfiguredTeams ? replay.start : undefined}
        replayAvailable={replayReady}
      />

      {!hasConfiguredTeams ? (
        <TeamConfigurationEmptyState pageLabel="Development" />
      ) : (
        <Box component="main" sx={{ flex: 1, minHeight: 0, p: 0, display: 'flex', flexDirection: 'column' }}>
          <SprintRibbon
            iterationWindow={iterationWindow}
            isLoading={iterationLoading || teamIterationsLoading}
            error={teamIterationsError}
            effortTotals={sprintEffortTotals}
            effortFlowPoints={effortFlowPoints}
            effortFlowLoading={effortFlowLoading}
            sprintForecast={isTeamDataLoading
              ? { status: 'loading' }
              : membersError || workItemsError || assigneesError
                ? { status: 'unavailable', reason: 'Board data could not be loaded. Refresh to retry.' }
                : sprintForecast}
            colorScheme={colorScheme}
          />
          {isSprintView && replayTimeline && !teamIterationsError ? (
            <SprintReplayBar
              timeline={replayTimeline}
              points={effortFlowPoints}
              replay={replay}
              status={replayStatus}
              colorScheme={colorScheme}
            />
          ) : null}
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
          {standupLive && includeQaTestersInStandup && qaBucketsLoading ? (
            <Alert severity="info" role="status" sx={{ m: 1, mb: 0 }}>
              Loading QA tester lanes for standup…
            </Alert>
          ) : null}
          {standupLive && includeQaTestersInStandup && qaBucketsError ? (
            <Alert severity="warning" role="alert" sx={{ m: 1, mb: 0 }}>
              QA tester lanes could not be loaded: {qaBucketsError}
            </Alert>
          ) : null}
          {patConfigured && !teamIterationsError && !isTeamDataLoading && !membersError && !workItemsError && !assigneesError && workItems.length === 0 ? (
            <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
              {quickFilterInput.trim() || selectedMemberFilter
                ? 'No cards match your filters. Clear the quick filter or select All team members to restore cards.'
                : 'No cards available for this team and sprint selection. Try Refresh, choose another team, or adjust sprint, work-item type, and hidden-tag filters in Development options.'}
            </Typography>
          ) : null}
          {isSprintView && replay.pastDay ? (
            <Alert
              data-replay-banner=""
              severity="info"
              icon={<Icon href={svgHistory} />}
              action={<Button size="small" onClick={replay.exit}>Back to today</Button>}
              sx={{ m: 1, mb: 0 }}
            >
              Showing the board at the end of Day {replay.pastDay.day} ({formatReplayDate(replay.pastDay)}). Cards show where each item stood; live details like pull requests and next steps are hidden.
            </Alert>
          ) : null}
          <Box ref={boardRef} sx={{ flex: 1, minHeight: 0 }}>
            {teamIterationsError ? null : (
              <KanbanBoard
                // Each lens keeps its own collapse and expansion state.
                key={isSprintView ? 'sprint' : 'people'}
                lens={isSprintView ? 'sprint' : 'people'}
                patConfigured={patConfigured}
                isLoading={isTeamDataLoading}
                membersError={membersError}
                workItemsError={workItemsError}
                assigneesError={assigneesError}
                members={members}
                selectedMemberFilter={selectedMemberFilter}
                hideUsersWithNoActivity={hideUsersWithNoActivity}
                hideUsersWithOnlyStaleDoneWork={hideUsersWithOnlyStaleDoneWork}
                workItems={workItems}
                currentIterationName={currentIterationName}
                changeHighlightsByItemId={changeHighlightsByItemId}
                changeDetailsByItemId={changeDetailsByItemId}
                compactCards={compactCards}
                rolledOverItemIds={rolledOverItemIds}
                workItemAssignees={workItemAssignees}
                standupActive={standupLive}
                includeQaTestersInStandup={includeQaTestersInStandup}
                qaBuckets={qaBuckets}
                qaTesters={qaTesters}
                onStandupEnd={endStandup}
                journeysByItemId={journeysByItemId}
                sprintScope={sprintScope}
                departuresByItemId={departuresByItemId}
                iterationWindow={iterationWindow}
                teamIterations={teamIterations}
                effortFlowPoints={effortFlowPoints}
                replayAt={replay.pastDay?.at ?? null}
              />
            )}
          </Box>

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
            hideUsersWithOnlyStaleDoneWork={hideUsersWithOnlyStaleDoneWork}
            onHideUsersWithOnlyStaleDoneWorkChange={onHideUsersWithOnlyStaleDoneWorkChange}
            compactCards={compactCards}
            onCompactCardsChange={onCompactCardsChange}
            includeQaTestersInStandup={includeQaTestersInStandup}
            onIncludeQaTestersInStandupChange={onIncludeQaTestersInStandupChange}
            teamIterations={teamIterations}
            teamIterationsLoading={teamIterationsLoading}
          />

          {!patConfigured ? <PatMissingNotice /> : null}
        </Box>
      )}
    </>
  )
}
