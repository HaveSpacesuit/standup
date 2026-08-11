import { useMemo, useState } from 'react'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { matchesQuickFilter, normalizeQuickFilterText } from '../utils/boardFilters'

type UseQualityAssurancePageModelArgs = {
  newItems: WorkItemSummary[]
}

type UseQualityAssurancePageModelResult = {
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  filteredNewItems: WorkItemSummary[]
}

export function useQualityAssurancePageModel({ newItems }: UseQualityAssurancePageModelArgs): UseQualityAssurancePageModelResult {
  const [quickFilterInput, setQuickFilterInput] = useState('')

  const normalizedQuickFilterText = useMemo(
    () => normalizeQuickFilterText(quickFilterInput),
    [quickFilterInput],
  )

  const quickFilterMatchedItems = useMemo(
    () => newItems.filter((item) => {
      const assignee = item.assignedTo?.displayName
        ? { kind: 'team-member' as const, label: item.assignedTo.displayName }
        : undefined

      return matchesQuickFilter(item, normalizedQuickFilterText, assignee)
    }),
    [newItems, normalizedQuickFilterText],
  )

  return {
    quickFilterInput,
    onQuickFilterInputChange: setQuickFilterInput,
    onQuickFilterClear: () => setQuickFilterInput(''),
    filteredNewItems: quickFilterMatchedItems,
  }
}
