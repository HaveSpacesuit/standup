import { useEffect, useMemo, useRef, useState } from 'react'
import { getAppConfig } from '../../../config'
import { AdoQueryEngine } from '../../../ado/queryEngine'
import type { IterationWindowInfo, ResolvedWorkItemAssignee, TeamIterationOption, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import { teamProfiles } from '../../../teamProfiles'
import { usePullRequestBoardItems } from './usePullRequestBoardItems'
import { useAdoHistoryHighlights, type ChangeHighlightState } from './useAdoHistoryHighlights'
import { useTeamData } from './useTeamData'
import { useWorkItemAssignees } from './useWorkItemAssignees'
import { useBoardPreferences } from './useBoardPreferences'
import { useTeamManagementUrl } from './useTeamManagementUrl'
import { useVisibleBoardItems } from './useVisibleBoardItems'
import { useQualityAssuranceBuckets } from './useQualityAssuranceBuckets'
import { useProjectWorkItemStates } from './useProjectWorkItemStates'
import { useTeamIterations } from './useTeamIterations'
import {
  applyTagRulesToItem,
  normalizeTeamMemberLabel,
} from '../utils/boardFilters'
import type { TagRule } from '../../../ado/workItemStatus'
import type { QaOptions } from '../utils/qaOptions'
import { resolveSelectedIterationPaths } from '../utils/qaOptions'
import type { ProjectWorkItemState } from '../../../ado/queryEngine'

type UseBoardViewModelArgs = {
  patConfigured: boolean
  qaOptionsByTeam?: Record<string, QaOptions>
}

type UseBoardViewModelResult = {
  selectedTeamId: string
  onTeamChange: (teamId: string) => void
  onRefresh: () => void
  tagRules: TagRule[]
  setTagRules: (value: TagRule[] | ((previous: TagRule[]) => TagRule[])) => void
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
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
  qaBuckets: import('../utils/qualityAssuranceBuckets').QualityAssuranceBucket[]
  qaBucketsLoading: boolean
  qaBucketsError: string | null
  projectWorkItemStates: ProjectWorkItemState[]
  projectWorkItemTypes: string[]
  projectWorkItemStatesLoading: boolean
  teamIterations: TeamIterationOption[]
  teamIterationsLoading: boolean
}

export function useBoardViewModel({ patConfigured, qaOptionsByTeam }: UseBoardViewModelArgs): UseBoardViewModelResult {
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
    setTagRules,
  } = useBoardPreferences()

  const forceRefreshRef = useRef(false)

  const selectedTeam =
    teamProfiles.find((team) => team.id === selectedTeamId) ?? teamProfiles[0]

  const adoQueryEngine = useMemo(() => {
    if (!patConfigured) {
      return null
    }

    const config = getAppConfig()
    return new AdoQueryEngine(config.azdoPat, config.azdoApiVersion)
  }, [patConfigured])

  const onRefresh = () => {
    adoQueryEngine?.clearTeamWorkItemsCache(selectedTeam.id)
    adoQueryEngine?.clearTeamMetadataCaches(selectedTeam)
    forceRefreshRef.current = true
    setReloadNonce((current) => current + 1)
  }

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
    adoQueryEngine,
    selectedTeam,
    reloadNonce,
    forceRefreshRef,
  })

  const filteredWorkItems = useMemo(
    () => workItems.map((item) => applyTagRulesToItem(item, tagRules)).filter((item): item is WorkItemSummary => item !== null),
    [workItems, tagRules],
  )

  const { pullRequestBoardItems, pullRequestBoardItemsLoading } = usePullRequestBoardItems({
    adoQueryEngine,
    selectedTeam,
    currentIteration,
    members,
    membersLoading,
    membersError,
    workItems: filteredWorkItems,
    workItemsLoading,
    workItemsError,
  })

  const boardItems = useMemo(
    () => [...filteredWorkItems, ...pullRequestBoardItems],
    [filteredWorkItems, pullRequestBoardItems],
  )

  const { workItemAssignees, assigneesLoading, assigneesError } = useWorkItemAssignees({
    adoQueryEngine,
    orgName: selectedTeam.orgName,
    members,
    membersLoading,
    membersError,
    workItems: boardItems,
    workItemsLoading: workItemsLoading || pullRequestBoardItemsLoading,
    workItemsError,
  })

  const { iterations: teamIterations, iterationsLoading: teamIterationsLoading } = useTeamIterations({
    adoQueryEngine,
    selectedTeam,
  })

  const sprintFilter = qaOptionsByTeam?.[selectedTeam.id]?.sprintFilter
  const selectedIterationPaths = useMemo(
    () => (sprintFilter ? resolveSelectedIterationPaths(sprintFilter, teamIterations) : []),
    [sprintFilter, teamIterations],
  )

  const { qaBuckets, qaBucketsLoading, qaBucketsError } = useQualityAssuranceBuckets({
    adoQueryEngine,
    selectedTeam,
    reloadNonce,
    includeWorkItemTypes: qaOptionsByTeam?.[selectedTeam.id]?.includeWorkItemTypes,
    includeIterationPaths: selectedIterationPaths,
    stateGroupOverrides: qaOptionsByTeam?.[selectedTeam.id]?.stateGroups,
  })

  const { workItemStates: projectWorkItemStates, workItemTypes: projectWorkItemTypes, workItemStatesLoading: projectWorkItemStatesLoading } = useProjectWorkItemStates({
    adoQueryEngine,
    selectedTeam,
  })

  const { memberFilterOptions, visibleBoardItems } = useVisibleBoardItems({
    boardItems,
    quickFilterInput,
    selectedMemberFilter,
    workItemAssignees,
  })

  const historyHighlightTeam = useMemo(
    () => ({
      orgName: selectedTeam.orgName,
      projectName: selectedTeam.projectName,
      repoName: selectedTeam.repoName,
    }),
    [selectedTeam.orgName, selectedTeam.projectName, selectedTeam.repoName],
  )

  const changeHighlightsByItemId = useAdoHistoryHighlights({
    adoQueryEngine,
    team: historyHighlightTeam,
    tagRules,
    workItems: boardItems,
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
    adoQueryEngine,
    patConfigured,
    selectedTeam,
  })

  const isTeamDataLoading = membersLoading || workItemsLoading || pullRequestBoardItemsLoading || assigneesLoading

  return {
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
    currentIterationName: currentIteration?.name ?? null,
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
  }
}
