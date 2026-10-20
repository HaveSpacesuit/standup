import { useMemo } from 'react'
import type { ResolvedWorkItemAssignee, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import {
  matchesQuickFilter,
  matchesTeamMemberFilter,
  normalizeQuickFilterText,
} from '../utils/boardFilters'
import { getAssignmentMemberFilterOptions } from '../utils/assignmentMembers'

type UseVisibleBoardItemsArgs = {
  boardItems: WorkItemSummary[]
  members: TeamMember[]
  quickFilterInput: string
  selectedMemberFilter: string
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
}

type UseVisibleBoardItemsResult = {
  memberFilterOptions: string[]
  visibleBoardItems: WorkItemSummary[]
}

export function useVisibleBoardItems({
  boardItems,
  members,
  quickFilterInput,
  selectedMemberFilter,
  workItemAssignees,
}: UseVisibleBoardItemsArgs): UseVisibleBoardItemsResult {
  const normalizedQuickFilterText = useMemo(
    () => normalizeQuickFilterText(quickFilterInput),
    [quickFilterInput],
  )

  const quickFilterMatchedBoardItems = useMemo(
    () => boardItems.filter((item) => matchesQuickFilter(item, normalizedQuickFilterText, workItemAssignees[item.id])),
    [boardItems, normalizedQuickFilterText, workItemAssignees],
  )

  const memberFilterOptions = useMemo(() => {
    return getAssignmentMemberFilterOptions(members)
  }, [members])

  const visibleBoardItems = useMemo(
    () =>
      quickFilterMatchedBoardItems.filter((item) =>
        matchesTeamMemberFilter(workItemAssignees[item.id], selectedMemberFilter),
      ),
    [quickFilterMatchedBoardItems, selectedMemberFilter, workItemAssignees],
  )

  return {
    memberFilterOptions,
    visibleBoardItems,
  }
}
