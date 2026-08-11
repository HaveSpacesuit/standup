import { useMemo } from 'react'
import type { ResolvedWorkItemAssignee, WorkItemSummary } from '../../../ado/queryEngine'
import {
  matchesQuickFilter,
  matchesTeamMemberFilter,
  normalizeQuickFilterText,
  sortTeamMemberLabels,
} from '../utils/boardFilters'

type UseVisibleBoardItemsArgs = {
  boardItems: WorkItemSummary[]
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

  return {
    memberFilterOptions,
    visibleBoardItems,
  }
}
