import { useMemo } from 'react'
import type { ResolvedWorkItemAssignee, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import {
  matchesQuickFilter,
  matchesTeamMemberFilter,
  normalizeQuickFilterText,
  sortTeamMemberLabels,
} from '../utils/boardFilters'
import { getAssignmentMemberFilterOptions } from '../utils/assignmentMembers'

type UseVisibleBoardItemsArgs = {
  boardItems: WorkItemSummary[]
  members?: TeamMember[]
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
  members = [],
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
    if (members.length > 0) {
      return getAssignmentMemberFilterOptions(members)
    }

    const labels = new Set<string>(selectedMemberFilter ? [selectedMemberFilter] : [])

    for (const item of quickFilterMatchedBoardItems) {
      const assignee = workItemAssignees[item.id]
      if (!assignee || assignee.kind !== 'team-member') {
        continue
      }

      labels.add(assignee.label)
    }

    return sortTeamMemberLabels([...labels])
  }, [members, quickFilterMatchedBoardItems, selectedMemberFilter, workItemAssignees])

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
