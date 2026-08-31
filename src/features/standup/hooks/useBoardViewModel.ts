import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_AZDO_API_VERSION } from '../../../adoAuth'
import { AdoQueryEngine } from '../../../ado/queryEngine'
import type { IterationWindowInfo, ResolvedWorkItemAssignee, TeamIterationOption, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { usePullRequestBoardItems } from './usePullRequestBoardItems'
import { useAdoHistoryHighlights, type ChangeHighlightState } from './useAdoHistoryHighlights'
import { useEffortFlowHistory, type EffortFlowPoint } from './useEffortFlowHistory'
import { useTeamData } from './useTeamData'
import { useWorkItemAssignees } from './useWorkItemAssignees'
import { useBoardPreferences } from './useBoardPreferences'
import { useTeamManagementUrl } from './useTeamManagementUrl'
import { useVisibleBoardItems } from './useVisibleBoardItems'
import { useQualityAssuranceBuckets } from './useQualityAssuranceBuckets'
import { useActiveAppView } from './useAppNavigation'
import { useProjectWorkItemStates } from './useProjectWorkItemStates'
import { useTeamIterations } from './useTeamIterations'
import { useAssignmentQueryFilters } from './useAssignmentQueryFilters'
import { useIterationRolloverFlags } from './useIterationRolloverFlags'
import {
  applyTagRulesToItem,
  normalizeTeamMemberLabel,
} from '../utils/boardFilters'
import type { TagRule } from '../../../ado/workItemStatus'
import type { QaOptions } from '../utils/qaOptions'
import { resolveSelectedIterationPaths } from '../utils/qaOptions'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import type { ProjectWorkItemState } from '../../../ado/queryEngine'
import type { AssignmentOptions } from '../utils/assignmentOptions'
import type { StatusColumn } from '../utils/statusColumnStyles'

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
  membersError: string | null
  workItemsError: string | null
  assigneesError: string | null
  members: TeamMember[]
  visibleBoardItems: WorkItemSummary[]
  currentIterationName: string | null
  iterationWindow: IterationWindowInfo
  iterationLoading: boolean
  changeHighlightsByItemId: Record<number, ChangeHighlightState>
  effortFlowPoints: EffortFlowPoint[]
  effortFlowLoading: boolean
  visitedStatusesByItemId: Record<number, StatusColumn[]>
  rolledOverItemIds: Record<number, boolean>
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
  qaBuckets: import('../utils/qualityAssuranceBuckets').QualityAssuranceBucket[]
  qaBucketsLoading: boolean
  qaBucketsError: string | null
  projectWorkItemStates: ProjectWorkItemState[]
  projectWorkItemTypes: string[]
  selectedAssignmentWorkItemTypes: string[]
  projectWorkItemStatesLoading: boolean
  teamIterations: TeamIterationOption[]
  teamIterationsLoading: boolean
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
  const [reloadNonce, setReloadNonce] = useState(0)

  const {
    selectedTeamId,
    onTeamChange,
    quickFilterInput,
    setQuickFilterInput,
    selectedMemberFilter,
    onMemberFilterChange,
    setSelectedMemberFilter,
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

  const onRefresh = () => {
    if (!selectedTeam) {
      return
    }

    adoQueryEngine?.clearTeamWorkItemsCache(selectedTeam.id)
    adoQueryEngine?.clearTeamMetadataCaches(selectedTeam)
    forceRefreshRef.current = true
    setReloadNonce((current) => current + 1)
  }

  const { iterations: teamIterations, iterationsLoading: teamIterationsLoading } = useTeamIterations({
    adoQueryEngine: dataQueryEngine,
    selectedTeam: effectiveTeam,
    reloadNonce,
  })

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
    currentIteration,
    iterationWindow,
  } = useTeamData({
    adoQueryEngine: dataQueryEngine,
    selectedTeam: effectiveTeam,
    reloadNonce,
    forceRefreshRef,
    includeWorkItemTypes: selectedAssignmentWorkItemTypes,
    includeIterationPaths: selectedAssignmentIterationPaths,
    useDefaultIterationWindow: useDefaultAssignmentIterationWindow,
  })

  const filteredWorkItems = useMemo(
    () => workItems.map((item) => applyTagRulesToItem(item, tagRules)).filter((item): item is WorkItemSummary => item !== null),
    [workItems, tagRules],
  )

  const { pullRequestBoardItems, pullRequestBoardItemsLoading } = usePullRequestBoardItems({
    adoQueryEngine: dataQueryEngine,
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

  const { workItemAssignees, assigneesLoading, assigneesError } = useWorkItemAssignees({
    adoQueryEngine: dataQueryEngine,
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

  const { qaBuckets, qaBucketsLoading, qaBucketsError } = useQualityAssuranceBuckets({
    adoQueryEngine: dataQueryEngine,
    selectedTeam: effectiveTeam,
    reloadNonce,
    enabled: activeView === 'qa-activity',
    includeWorkItemTypes: qaOptionsByTeam?.[effectiveTeam.id]?.includeWorkItemTypes,
    includeIterationPaths: selectedIterationPaths,
    lookbackDays: qaOptionsByTeam?.[effectiveTeam.id]?.lookbackDays,
    stateGroupOverrides: qaOptionsByTeam?.[effectiveTeam.id]?.stateGroups,
    tagGroups: qaOptionsByTeam?.[effectiveTeam.id]?.tagGroups,
  })

  const { workItemStates: projectWorkItemStates, workItemTypes: projectWorkItemTypes, workItemStatesLoading: projectWorkItemStatesLoading } = useProjectWorkItemStates({
    adoQueryEngine: dataQueryEngine,
    selectedTeam: effectiveTeam,
  })

  const { memberFilterOptions, visibleBoardItems } = useVisibleBoardItems({
    boardItems,
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

  const changeHighlightsByItemId = useAdoHistoryHighlights({
    adoQueryEngine: dataQueryEngine,
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

  const { points: effortFlowPoints, isLoading: effortFlowLoading, visitedStatusesByItemId } = useEffortFlowHistory({
    adoQueryEngine: dataQueryEngine,
    team: historyHighlightTeam,
    tagRules,
    workItems: currentSprintBoardItems,
    historyWorkItems: visibleBoardItems,
    iterationWindow,
  })

  const rolledOverItemIds = useIterationRolloverFlags({
    adoQueryEngine: dataQueryEngine,
    team: historyHighlightTeam,
    workItems: visibleBoardItems,
    iterationWindow,
    teamIterations,
  })

  useEffect(() => {
    if (!selectedMemberFilter) {
      return
    }

    const selectedStillExists = memberFilterOptions.some(
      (memberName) => normalizeTeamMemberLabel(memberName) === normalizeTeamMemberLabel(selectedMemberFilter),
    )

    if (!selectedStillExists) {
      setSelectedMemberFilter('')
    }
  }, [memberFilterOptions, selectedMemberFilter, setSelectedMemberFilter])

  const teamManagementUrl = useTeamManagementUrl({
    adoQueryEngine: dataQueryEngine,
    patConfigured,
    hasConfiguredTeam,
    selectedTeam: effectiveTeam,
  })

  const isTeamDataLoading = membersLoading || workItemsLoading || pullRequestBoardItemsLoading || assigneesLoading

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
    membersError,
    workItemsError,
    assigneesError,
    members,
    visibleBoardItems,
    currentIterationName: currentIteration?.name ?? null,
    iterationWindow,
    iterationLoading,
    changeHighlightsByItemId,
    effortFlowPoints,
    effortFlowLoading,
    visitedStatusesByItemId,
    rolledOverItemIds,
    workItemAssignees,
    qaBuckets,
    qaBucketsLoading,
    qaBucketsError,
    projectWorkItemStates,
    projectWorkItemTypes,
    selectedAssignmentWorkItemTypes,
    projectWorkItemStatesLoading,
    teamIterations,
    teamIterationsLoading,
  }
}
