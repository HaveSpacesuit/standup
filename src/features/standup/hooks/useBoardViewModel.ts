import { useEffect, useMemo, useRef, useState } from 'react'
import { getAppConfig } from '../../../config'
import { AdoQueryEngine } from '../../../ado/queryEngine'
import type { ResolvedWorkItemAssignee, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import { teamProfiles } from '../../../teamProfiles'
import { usePullRequestBoardItems } from './usePullRequestBoardItems'
import { useTeamData } from './useTeamData'
import { useWorkItemAssignees } from './useWorkItemAssignees'
import {
  matchesQuickFilter,
  matchesTeamMemberFilter,
  normalizeQuickFilterText,
  normalizeTagKey,
  normalizeTeamMemberLabel,
  parseStoredHiddenTags,
  shouldHideByTag,
  sortTeamMemberLabels,
} from '../utils/boardFilters'

type UseBoardViewModelArgs = {
  patConfigured: boolean
}

type UseBoardViewModelResult = {
  selectedTeamId: string
  onTeamChange: (teamId: string) => void
  onRefresh: () => void
  hiddenTags: string[]
  setHiddenTags: (value: string[] | ((previous: string[]) => string[])) => void
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
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
}

const HIDDEN_TAGS_STORAGE_KEY = 'standup:hidden-tags'
const SELECTED_TEAM_STORAGE_KEY = 'standup:selected-team-id'

function getInitialSelectedTeamId(): string {
  const storedTeamId = localStorage.getItem(SELECTED_TEAM_STORAGE_KEY)
  if (storedTeamId && teamProfiles.some((team) => team.id === storedTeamId)) {
    return storedTeamId
  }

  return teamProfiles[0].id
}

function buildTeamManagementUrl(
  orgName: string,
  projectName: string,
  teamName: string,
  subjectDescriptor?: string | null,
): string {
  const baseUrl = `https://dev.azure.com/${encodeURIComponent(orgName)}/${encodeURIComponent(projectName)}/_settings/teams`
  const params = new URLSearchParams(
    subjectDescriptor ? { subjectDescriptor } : { team: teamName },
  )
  return `${baseUrl}?${params.toString()}`
}

export function useBoardViewModel({ patConfigured }: UseBoardViewModelArgs): UseBoardViewModelResult {
  const [selectedTeamId, setSelectedTeamId] = useState(getInitialSelectedTeamId)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [quickFilterInput, setQuickFilterInput] = useState('')
  const [selectedMemberFilter, setSelectedMemberFilter] = useState('')
  const [teamSubjectDescriptor, setTeamSubjectDescriptor] = useState<string | null>(null)
  const [hiddenTags, setHiddenTags] = useState<string[]>(() =>
    parseStoredHiddenTags(localStorage.getItem(HIDDEN_TAGS_STORAGE_KEY)),
  )

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

  const onTeamChange = (teamId: string) => {
    setSelectedTeamId(teamId)
  }

  const onMemberFilterChange = (memberLabel: string) => {
    setSelectedMemberFilter(memberLabel)
  }

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
    currentIteration,
  } = useTeamData({
    adoQueryEngine,
    selectedTeam,
    reloadNonce,
    forceRefreshRef,
  })

  const hiddenTagKeys = useMemo(
    () => new Set(hiddenTags.map((tag) => normalizeTagKey(tag))),
    [hiddenTags],
  )

  const filteredWorkItems = useMemo(
    () => workItems.filter((item) => !shouldHideByTag(item, hiddenTagKeys)),
    [workItems, hiddenTagKeys],
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

  const normalizedQuickFilterText = useMemo(
    () => normalizeQuickFilterText(quickFilterInput),
    [quickFilterInput],
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

  const quickFilterMatchedBoardItems = useMemo(
    () => boardItems.filter((item) => matchesQuickFilter(item, normalizedQuickFilterText, workItemAssignees[item.id])),
    [boardItems, normalizedQuickFilterText, workItemAssignees],
  )

  const memberFilterOptions = useMemo(() => {
    const labels = new Set<string>()

    for (const item of quickFilterMatchedBoardItems) {
      const assignee = workItemAssignees[item.id]
      if (!assignee || assignee.kind !== 'team-member') {
        continue
      }

      labels.add(assignee.label)
    }

    return sortTeamMemberLabels([...labels])
  }, [quickFilterMatchedBoardItems, workItemAssignees])

  const visibleBoardItems = useMemo(
    () =>
      quickFilterMatchedBoardItems.filter((item) =>
        matchesTeamMemberFilter(workItemAssignees[item.id], selectedMemberFilter),
      ),
    [quickFilterMatchedBoardItems, selectedMemberFilter, workItemAssignees],
  )

  useEffect(() => {
    localStorage.setItem(HIDDEN_TAGS_STORAGE_KEY, JSON.stringify(hiddenTags))
  }, [hiddenTags])

  useEffect(() => {
    localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, selectedTeamId)
  }, [selectedTeamId])

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
  }, [memberFilterOptions, selectedMemberFilter])

  useEffect(() => {
    let isDisposed = false
    const abortController = new AbortController()

    setTeamSubjectDescriptor(null)

    if (!adoQueryEngine || !patConfigured) {
      return () => {
        isDisposed = true
        abortController.abort()
      }
    }

    adoQueryEngine
      .getTeamSubjectDescriptor(
        {
          orgName: selectedTeam.orgName,
          projectName: selectedTeam.projectName,
          teamName: selectedTeam.teamName,
        },
        abortController.signal,
      )
      .then((descriptor) => {
        if (!isDisposed) {
          setTeamSubjectDescriptor(descriptor)
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setTeamSubjectDescriptor(null)
        }
      })

    return () => {
      isDisposed = true
      abortController.abort()
    }
  }, [adoQueryEngine, patConfigured, selectedTeam.orgName, selectedTeam.projectName, selectedTeam.teamName])

  const teamManagementUrl = useMemo(
    () =>
      buildTeamManagementUrl(
        selectedTeam.orgName,
        selectedTeam.projectName,
        selectedTeam.teamName,
        teamSubjectDescriptor,
      ),
    [selectedTeam.orgName, selectedTeam.projectName, selectedTeam.teamName, teamSubjectDescriptor],
  )

  const isTeamDataLoading = membersLoading || workItemsLoading || pullRequestBoardItemsLoading || assigneesLoading

  return {
    selectedTeamId,
    onTeamChange,
    onRefresh,
    hiddenTags,
    setHiddenTags,
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
    workItemAssignees,
  }
}
