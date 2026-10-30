import { useDeferredValue, useMemo, useState } from 'react'
import { filterBacklogBugs } from '../utils/backlogFilter'
import type { RankedBacklogBug } from '../utils/backlogValue'

type UseBacklogPageModelArgs = {
  bugs: RankedBacklogBug[]
}

type UseBacklogPageModelResult = {
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  filteredBugs: RankedBacklogBug[]
}

/** Owns the Backlog quick filter outside the page, like the Quality Assurance model, so the text survives page switches. */
export function useBacklogPageModel({ bugs }: UseBacklogPageModelArgs): UseBacklogPageModelResult {
  const [quickFilterInput, setQuickFilterInput] = useState('')

  // Deferred so typing stays responsive while a long backlog re-renders.
  const deferredQuickFilterInput = useDeferredValue(quickFilterInput)
  const filteredBugs = useMemo(
    () => filterBacklogBugs(bugs, deferredQuickFilterInput),
    [bugs, deferredQuickFilterInput],
  )

  return {
    quickFilterInput,
    onQuickFilterInputChange: setQuickFilterInput,
    onQuickFilterClear: () => setQuickFilterInput(''),
    filteredBugs,
  }
}
