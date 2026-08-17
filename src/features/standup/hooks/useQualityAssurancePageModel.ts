import { useMemo, useState } from 'react'
import { matchesQuickFilter, normalizeQuickFilterText } from '../utils/boardFilters'
import type { QualityAssuranceBucket, QualityAssuranceBucketId } from '../utils/qualityAssuranceBuckets'

type UseQualityAssurancePageModelArgs = {
  buckets: QualityAssuranceBucket[]
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

export function useQualityAssurancePageModel({ buckets }: UseQualityAssurancePageModelArgs): UseQualityAssurancePageModelResult {
  const [quickFilterInput, setQuickFilterInput] = useState('')

  const normalizedQuickFilterText = useMemo(
    () => normalizeQuickFilterText(quickFilterInput),
    [quickFilterInput],
  )

  const filteredBuckets = useMemo(
    () => buckets
      .map((bucket) => ({
        ...bucket,
        items: bucket.items.filter((item) => {
          const assignee = item.assignedTo?.displayName
            ? { kind: 'team-member' as const, label: item.assignedTo.displayName }
            : undefined

          return matchesQuickFilter(item, normalizedQuickFilterText, assignee)
        }),
      }))
      .sort((left, right) => sortBucketsByPriority(left.id) - sortBucketsByPriority(right.id)),
    [buckets, normalizedQuickFilterText],
  )

  return {
    quickFilterInput,
    onQuickFilterInputChange: setQuickFilterInput,
    onQuickFilterClear: () => setQuickFilterInput(''),
    filteredBuckets,
  }
}
