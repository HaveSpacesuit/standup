import { useMemo, useRef, useState } from 'react'
import { DEFAULT_AZDO_API_VERSION } from '../../../adoAuth'
import { AdoQueryEngine } from '../../../ado/queryEngine'
import type { IterationWindowInfo, ResolvedWorkItemAssignee, TeamIterationOption, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { usePullRequestBoardItems } from './usePullRequestBoardItems'
import { useAdoHistoryHighlights, type CardChangeDetail, type ChangeHighlightState } from './useAdoHistoryHighlights'
import { useEffortFlowHistory, type EffortFlowPoint } from './useEffortFlowHistory'
import { useSprintScopeChanges, type SprintScopeState } from './useSprintScopeChanges'
import { useTeamData } from './useTeamData'
import { useWorkItemAssignees } from './useWorkItemAssignees'
import { useBoardPreferences } from './useBoardPreferences'
import { useTeamManagementUrl } from './useTeamManagementUrl'
import { useVisibleBoardItems } from './useVisibleBoardItems'
import { useQualityAssuranceBuckets } from './useQualityAssuranceBuckets'
import { useBacklogBugs } from './useBacklogBugs'
import { useActiveAppView } from './useAppNavigation'
import { useProjectWorkItemStates } from './useProjectWorkItemStates'
import { useTeamIterations } from './useTeamIterations'
import { useAssignmentQueryFilters } from './useAssignmentQueryFilters'
import { useIterationRolloverFlags } from './useIterationRolloverFlags'
import { useTeamDataSyncedAt } from './useTeamDataSyncedAt'
import { applyTagRulesToItem } from '../utils/boardFilters'
import type { TagRule } from '../../../ado/workItemStatus'
import type { QaOptions } from '../utils/qaOptions'
import { resolveSelectedIterationPaths } from '../utils/qaOptions'
import { resolveQualityAssuranceProjectConfig } from '../utils/qualityAssuranceBuckets'
import { resolveQaTesters } from '../utils/qaTesters'
import type { RankedBacklogBug } from '../utils/backlogValue'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import type { ProjectWorkItemState } from '../../../ado/queryEngine'
import type { AssignmentOptions } from '../utils/assignmentOptions'
import type { SprintDeparture, SprintJourney } from '../utils/sprintJourney'
import type { SprintForecast } from '../utils/sprintForecast'

type UseBoardViewModelArgs = {
  pat: string | null
  teamProfiles: TeamProfile[]
  qaOptionsByTeam?: Record<string, QaOptions>
  assignmentOptionsByTeam?: Record<string, AssignmentOptions>
  assignmentCardHighlightOptions?: CardHighlightOptions
}

type UseBoardViewModelResult = {
  selectedTeamId: string
  onTeamChange: (teamId: string) => void
  onRefresh: () => void
  tagRules: TagRule[]
  tagRulesByTeam: Record<string, TagRule[]>
  setTagRules: (value: TagRule[] | ((previous: TagRule[]) => TagRule[])) => void
  setTagRulesForTeam: (teamId: string, rules: TagRule[]) => void
  quickFilterInput: string
  setQuickFilterInput: (value: string) => void
  selectedMemberFilter: string
  onMemberFilterChange: (memberLabel: string) => void
  memberFilterOptions: string[]
  teamManagementUrl: string
  isTeamDataLoading: boolean
  /** When the selected team's Development data last loaded fresh, or null before its first load. */
  teamDataSyncedAt: number | null
  membersError: string | null
  workItemsError: string | null
  pullRequestBoardItemsError: string | null
  assigneesError: string | null
  assigneesHistoryWarning: string | null
  retryAssigneeHistory: () => void
  members: TeamMember[]
  visibleBoardItems: WorkItemSummary[]
  boardItems: WorkItemSummary[]
  currentIterationName: string | null
  iterationWindow: IterationWindowInfo
  iterationLoading: boolean
  changeHighlightsByItemId: Record<number, ChangeHighlightState>
  changeDetailsByItemId: Record<number, CardChangeDetail>
  effortFlowPoints: EffortFlowPoint[]
  effortFlowLoading: boolean
  sprintForecast: SprintForecast
  journeysByItemId: Record<number, SprintJourney>
  /** Sprint-start membership and the items since removed from the sprint. */
  sprintScope: SprintScopeState
  departuresByItemId: Record<number, SprintDeparture>
  rolledOverItemIds: Record<number, boolean>
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
  qaBuckets: import('../utils/qualityAssuranceBuckets').QualityAssuranceBucket[]
  qaBucketsLoading: boolean
  qaBucketsError: string | null
  qaHistoryWarning: string | null
  qaUpdatesByItemId: Record<number, import('../../../ado/types').WorkItemUpdate[]>
  /** The team's QA testers, chosen in QA options or inferred from QA activity. */
  qaTesters: TeamMember[]
  /** No testers are chosen in QA options, so qaTesters were inferred. */
  qaTestersInferred: boolean
  backlogBugs: RankedBacklogBug[]
  backlogBugsLoading: boolean
  backlogBugsError: string | null
  projectWorkItemStates: ProjectWorkItemState[]
  projectWorkItemTypes: string[]
  selectedAssignmentWorkItemTypes: string[]
  projectWorkItemStatesLoading: boolean
  projectWorkItemStatesError: string | null
  retryProjectWorkItemStates: () => void
  teamIterations: TeamIterationOption[]
  teamIterationsLoading: boolean
  teamIterationsError: string | null
}

const EMPTY_TEAM_PROFILE: TeamProfile = {
  id: '',
  orgName: '',
  projectName: '',
  displayName: '',
  areaPath: '',
  iterationPath: '',
  teamName: '',
  repoName: '',
}

export function useBoardViewModel({
  pat,
  teamProfiles,
  qaOptionsByTeam,
  assignmentOptionsByTeam,
  assignmentCardHighlightOptions,
}: UseBoardViewModelArgs): UseBoardViewModelResult {
  const [developmentReloadNonce, setDevelopmentReloadNonce] = useState(0)
  const [qaReloadNonce, setQaReloadNonce] = useState(0)
  const [backlogReloadNonce, setBacklogReloadNonce] = useState(0)

  const {
    selectedTeamId,
    onTeamChange,
    quickFilterInput,
    setQuickFilterInput,
    selectedMemberFilter,
    onMemberFilterChange,
    tagRules,
    tagRulesByTeam,
    setTagRules,
    setTagRulesForTeam,
  } = useBoardPreferences(teamProfiles)

  const forceRefreshRef = useRef(false)
  const activeView = useActiveAppView()

  const selectedTeam = teamProfiles.find((team) => team.id === selectedTeamId) ?? null
  const effectiveTeam = selectedTeam ?? EMPTY_TEAM_PROFILE
  const hasConfiguredTeam = selectedTeam !== null

  const patConfigured = Boolean(pat)

  const adoQueryEngine = useMemo(() => {
    if (!pat) {
      return null
    }

    return new AdoQueryEngine(pat, DEFAULT_AZDO_API_VERSION)
  }, [pat])
  const dataQueryEngine = hasConfiguredTeam ? adoQueryEngine : null

  const {
    iterations: teamIterations,
    iterationsLoading: teamIterationsLoading,
    iterationsError: teamMetadataIterationsError,
  } = useTeamIterations({
    adoQueryEngine: dataQueryEngine,
    selectedTeam: effectiveTeam,
    reloadNonce: developmentReloadNonce + qaReloadNonce,
  })
  const scopedQueryEngine = teamIterationsLoading || teamMetadataIterationsError ? null : dataQueryEngine

  const {
    selectedAssignmentIterationPaths,
    useDefaultAssignmentIterationWindow,
    selectedAssignmentWorkItemTypes,
  } = useAssignmentQueryFilters({
    selectedTeamId: effectiveTeam.id,
    teamIterations,
    assignmentOptionsByTeam,
  })

  const {
    members,
    membersLoading,
    membersError,
    workItems,
    workItemsLoading,
    workItemsError,
    iterationLoading,
    iterationWindowError,
    currentIteration,
    iterationWindow,
  } = useTeamData({
    adoQueryEngine: scopedQueryEngine,
    selectedTeam: effectiveTeam,
    reloadNonce: developmentReloadNonce,
    forceRefreshRef,
    includeWorkItemTypes: selectedAssignmentWorkItemTypes,
    includeIterationPaths: selectedAssignmentIterationPaths,
    useDefaultIterationWindow: useDefaultAssignmentIterationWindow,
  })
  const teamIterationsError = teamMetadataIterationsError ?? iterationWindowError

  const filteredWorkItems = useMemo(
    () => workItems.map((item) => applyTagRulesToItem(item, tagRules)).filter((item): item is WorkItemSummary => item !== null),
    [workItems, tagRules],
  )

  const { pullRequestBoardItems, pullRequestBoardItemsLoading, pullRequestBoardItemsError } = usePullRequestBoardItems({
    adoQueryEngine: scopedQueryEngine,
    selectedTeam: effectiveTeam,
    currentIteration,
    members,
    membersLoading,
    membersError,
    workItems: filteredWorkItems,
    workItemsLoading,
    workItemsError,
  })

  const boardItems = useMemo(() => {
    // The unlinked-PR query can go stale relative to the work items on the board, so drop any
    // standalone PR card whose PR is already linked to a work item card.
    const linkedPullRequestIds = new Set(
      filteredWorkItems.flatMap((item) => [
        ...(item.linkedPullRequestIds ?? []),
        ...(item.activePullRequests ?? []).map((pullRequest) => pullRequest.id),
      ]),
    )

    const standalonePullRequestItems = pullRequestBoardItems.filter(
      (item) => item.pullRequest === undefined || !linkedPullRequestIds.has(item.pullRequest.id),
    )

    return [...filteredWorkItems, ...standalonePullRequestItems]
  }, [filteredWorkItems, pullRequestBoardItems])

  const {
    workItemAssignees,
    assigneesLoading,
    assigneesError,
    assigneesHistoryWarning,
    retryAssigneeHistory,
  } = useWorkItemAssignees({
    adoQueryEngine: scopedQueryEngine,
    team: effectiveTeam,
    members,
    membersLoading,
    membersError,
    workItems: boardItems,
    workItemsLoading: workItemsLoading || pullRequestBoardItemsLoading,
    workItemsError,
  })

  const sprintFilter = qaOptionsByTeam?.[effectiveTeam.id]?.sprintFilter
  const selectedIterationPaths = useMemo(
    () => (sprintFilter ? resolveSelectedIterationPaths(sprintFilter, teamIterations) : []),
    [sprintFilter, teamIterations],
  )

  const { qaBuckets, qaBucketsLoading, qaBucketsError, qaHistoryWarning, qaUpdatesByItemId } = useQualityAssuranceBuckets({
    adoQueryEngine: scopedQueryEngine,
    selectedTeam: effectiveTeam,
    reloadNonce: qaReloadNonce,
    enabled: activeView === 'qa-activity'
      || (activeView === 'development' && assignmentOptionsByTeam?.[effectiveTeam.id]?.includeQaTestersInStandup === true),
    includeWorkItemTypes: qaOptionsByTeam?.[effectiveTeam.id]?.includeWorkItemTypes,
    includeIterationPaths: selectedIterationPaths,
    lookbackDays: qaOptionsByTeam?.[effectiveTeam.id]?.lookbackDays,
    stateGroupOverrides: qaOptionsByTeam?.[effectiveTeam.id]?.stateGroups,
    tagGroups: qaOptionsByTeam?.[effectiveTeam.id]?.tagGroups,
  })

  const qaTesterNames = qaOptionsByTeam?.[effectiveTeam.id]?.testers
  const qaStateGroupOverrides = qaOptionsByTeam?.[effectiveTeam.id]?.stateGroups
  const { testers: qaTesters, inferred: qaTestersInferred } = useMemo(
    () => resolveQaTesters({
      configuredNames: qaTesterNames ?? [],
      teamMembers: members,
      updatesByItemId: qaUpdatesByItemId,
      stateGroups: resolveQualityAssuranceProjectConfig(effectiveTeam, qaStateGroupOverrides).stateGroups,
    }),
    [effectiveTeam, members, qaStateGroupOverrides, qaTesterNames, qaUpdatesByItemId],
  )

  // The backlog ignores sprints, so it only needs a configured team, not resolved iterations.
  const { backlogBugs, backlogBugsLoading, backlogBugsError } = useBacklogBugs({
    adoQueryEngine: dataQueryEngine,
    selectedTeam: effectiveTeam,
    reloadNonce: backlogReloadNonce,
    enabled: activeView === 'backlog',
  })

  const {
    workItemStates: projectWorkItemStates,
    workItemTypes: projectWorkItemTypes,
    workItemStatesLoading: projectWorkItemStatesLoading,
    workItemStatesError: projectWorkItemStatesError,
    retryWorkItemStates: retryProjectWorkItemStates,
  } = useProjectWorkItemStates({
    adoQueryEngine: dataQueryEngine,
    selectedTeam: effectiveTeam,
  })

  const { memberFilterOptions, visibleBoardItems } = useVisibleBoardItems({
    boardItems,
    members,
    quickFilterInput,
    selectedMemberFilter,
    workItemAssignees,
  })

  const historyHighlightTeam = useMemo(
    () => ({
      orgName: effectiveTeam.orgName,
      projectName: effectiveTeam.projectName,
      repoName: effectiveTeam.repoName,
    }),
    [effectiveTeam.orgName, effectiveTeam.projectName, effectiveTeam.repoName],
  )

  const { highlightsByItemId: changeHighlightsByItemId, changeDetailsByItemId } = useAdoHistoryHighlights({
    adoQueryEngine: scopedQueryEngine,
    team: historyHighlightTeam,
    tagRules,
    workItems: boardItems,
    cardHighlightOptions: assignmentCardHighlightOptions,
  })

  const currentSprintBoardItems = useMemo(
    () =>
      currentIteration
        ? visibleBoardItems.filter((item) => item.sprintName === currentIteration.name)
        : visibleBoardItems,
    [visibleBoardItems, currentIteration],
  )

  const sprintScope = useSprintScopeChanges({
    adoQueryEngine: scopedQueryEngine,
    team: effectiveTeam,
    currentIteration,
    includeWorkItemTypes: selectedAssignmentWorkItemTypes,
    tagRules,
    members,
    quickFilterInput,
    selectedMemberFilter,
    reloadNonce: developmentReloadNonce,
  })

  const { points: effortFlowPoints, isLoading: effortFlowLoading, journeysByItemId, departuresByItemId, sprintForecast } = useEffortFlowHistory({
    adoQueryEngine: scopedQueryEngine,
    team: historyHighlightTeam,
    tagRules,
    workItems: currentSprintBoardItems,
    historyWorkItems: visibleBoardItems,
    iterationWindow,
    sprintScope,
  })

  const rolledOverItemIds = useIterationRolloverFlags({
    adoQueryEngine: scopedQueryEngine,
    team: historyHighlightTeam,
    workItems: visibleBoardItems,
    iterationWindow,
    teamIterations,
  })

  const onRefresh = () => {
    if (!selectedTeam || !adoQueryEngine) {
      return
    }

    retryProjectWorkItemStates()

    if (activeView === 'qa-activity') {
      adoQueryEngine.clearQualityAssuranceDataCache(selectedTeam.id)
      adoQueryEngine.clearTeamIterationsCache(selectedTeam.id)
      adoQueryEngine.clearWorkItemUpdatesCache(selectedTeam, qaBuckets.flatMap((bucket) => bucket.items.map((item) => item.id)))
      setQaReloadNonce((current) => current + 1)
      return
    }

    if (activeView === 'backlog') {
      adoQueryEngine.clearBacklogDataCache(selectedTeam.id)
      setBacklogReloadNonce((current) => current + 1)
      return
    }

    if (assignmentOptionsByTeam?.[selectedTeam.id]?.includeQaTestersInStandup) {
      adoQueryEngine.clearQualityAssuranceDataCache(selectedTeam.id)
      adoQueryEngine.clearWorkItemUpdatesCache(selectedTeam, qaBuckets.flatMap((bucket) => bucket.items.map((item) => item.id)))
      setQaReloadNonce((current) => current + 1)
    }

    adoQueryEngine.clearDevelopmentDataCache(selectedTeam.id)
    adoQueryEngine.clearTeamMetadataCaches(selectedTeam)
    adoQueryEngine.clearWorkItemUpdatesCache(selectedTeam, [
      ...boardItems.map((item) => item.id),
      ...(sprintScope.status === 'ready' ? sprintScope.removedItems.map((item) => item.id) : []),
    ])
    forceRefreshRef.current = true
    markTeamDataRefreshRequested()
    setDevelopmentReloadNonce((current) => current + 1)
  }

  const teamManagementUrl = useTeamManagementUrl({
    adoQueryEngine: dataQueryEngine,
    patConfigured,
    hasConfiguredTeam,
    selectedTeam: effectiveTeam,
  })

  const isTeamDataLoading = teamIterationsLoading || membersLoading || workItemsLoading || pullRequestBoardItemsLoading || assigneesLoading
  const { syncedAt: teamDataSyncedAt, markRefreshRequested: markTeamDataRefreshRequested } = useTeamDataSyncedAt({
    teamId: selectedTeam?.id ?? '',
    isLoading: isTeamDataLoading,
    failed: Boolean(teamIterationsError || membersError || workItemsError),
  })

  return {
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
    boardItems,
    currentIterationName: currentIteration?.name ?? null,
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
    projectWorkItemStates,
    projectWorkItemTypes,
    selectedAssignmentWorkItemTypes,
    projectWorkItemStatesLoading,
    projectWorkItemStatesError,
    retryProjectWorkItemStates,
    teamIterations,
    teamIterationsLoading,
    teamIterationsError,
  }
}
