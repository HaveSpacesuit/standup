import { useMemo, useState } from 'react'
import { matchesQuickFilter, normalizeQuickFilterText } from '../utils/boardFilters'
import type { QualityAssuranceBucket, QualityAssuranceBucketId } from '../utils/qualityAssuranceBuckets'
import { applyQaGeneralFilters, type QaOptions } from '../utils/qaOptions'

type UseQualityAssurancePageModelArgs = {
  buckets: QualityAssuranceBucket[]
  qaOptions: QaOptions
}

type UseQualityAssurancePageModelResult = {
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  filteredBuckets: QualityAssuranceBucket[]
}

function sortBucketsByPriority(bucketId: QualityAssuranceBucketId): number {
  switch (bucketId) {
    case 'new':
      return 0
    case 'needs-development':
      return 1
    case 'needs-testing':
      return 2
    case 'done':
      return 3
    default:
      return 99
  }
}

export function useQualityAssurancePageModel({ buckets, qaOptions }: UseQualityAssurancePageModelArgs): UseQualityAssurancePageModelResult {
  const [quickFilterInput, setQuickFilterInput] = useState('')

  const normalizedQuickFilterText = useMemo(
    () => normalizeQuickFilterText(quickFilterInput),
    [quickFilterInput],
  )

  const filteredBuckets = useMemo(
    () => buckets
      .map((bucket) => ({
        ...bucket,
        items: applyQaGeneralFilters(bucket.items, qaOptions.generalFilters).filter((item) => {
          // Match the quick filter against whichever person the card shows for this column:
          // created-by in the Newly added column, assigned-to elsewhere.
          const person = bucket.id === 'new' ? item.createdBy : item.assignedTo
          const assignee = person?.displayName
            ? { kind: 'team-member' as const, label: person.displayName }
            : undefined

          return matchesQuickFilter(item, normalizedQuickFilterText, assignee)
        }),
      }))
      .sort((left, right) => sortBucketsByPriority(left.id) - sortBucketsByPriority(right.id)),
    [buckets, normalizedQuickFilterText, qaOptions],
  )

  return {
    quickFilterInput,
    onQuickFilterInputChange: setQuickFilterInput,
    onQuickFilterClear: () => setQuickFilterInput(''),
    filteredBuckets,
  }
}
