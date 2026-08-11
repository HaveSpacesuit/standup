import { useEffect, useMemo, useState } from 'react'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { matchesQuickFilter, normalizeQuickFilterText } from '../utils/boardFilters'

type UsePullRequestsPageModelArgs = {
  activeTeamPullRequests: WorkItemSummary[]
}

type UsePullRequestsPageModelResult = {
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  selectedAuthorFilter: string
  authorFilterOptions: string[]
  onAuthorFilterChange: (value: string) => void
  fullApprovalThreshold: number
  onFullApprovalThresholdChange: (value: number) => void
  filteredPullRequests: WorkItemSummary[]
}

const PULL_REQUEST_FULL_APPROVAL_THRESHOLD_STORAGE_KEY = 'standup:pull-requests-full-approval-threshold'

function getInitialFullApprovalThreshold(): number {
  const rawValue = localStorage.getItem(PULL_REQUEST_FULL_APPROVAL_THRESHOLD_STORAGE_KEY)
  if (!rawValue) {
    return 2
  }

  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(parsed)) {
    return 2
  }

  return Math.min(Math.max(parsed, 0), 10)
}

function normalizeDisplayName(name: string): string {
  return name.trim().toLowerCase()
}

export function usePullRequestsPageModel({
  activeTeamPullRequests,
}: UsePullRequestsPageModelArgs): UsePullRequestsPageModelResult {
  const [quickFilterInput, setQuickFilterInput] = useState('')
  const [selectedAuthorFilter, setSelectedAuthorFilter] = useState('')
  const [fullApprovalThreshold, setFullApprovalThreshold] = useState(getInitialFullApprovalThreshold)

  const normalizedQuickFilterText = useMemo(
    () => normalizeQuickFilterText(quickFilterInput),
    [quickFilterInput],
  )

  const quickFilterMatchedPullRequests = useMemo(
    () => activeTeamPullRequests.filter((pullRequest) => {
      const assignee = pullRequest.assignedTo?.displayName
        ? { kind: 'team-member' as const, label: pullRequest.assignedTo.displayName }
        : undefined

      return matchesQuickFilter(pullRequest, normalizedQuickFilterText, assignee)
    }),
    [activeTeamPullRequests, normalizedQuickFilterText],
  )

  const authorFilterOptions = useMemo(() => {
    const labels = new Set<string>()

    for (const pullRequest of quickFilterMatchedPullRequests) {
      const authorName = pullRequest.assignedTo?.displayName?.trim()
      if (!authorName) {
        continue
      }

      labels.add(authorName)
    }

    return [...labels].sort((left, right) => left.localeCompare(right))
  }, [quickFilterMatchedPullRequests])

  const filteredPullRequests = useMemo(() => {
    if (!selectedAuthorFilter) {
      return quickFilterMatchedPullRequests
    }

    const normalizedSelectedAuthor = normalizeDisplayName(selectedAuthorFilter)

    return quickFilterMatchedPullRequests.filter((pullRequest) => {
      const authorName = pullRequest.assignedTo?.displayName
      if (!authorName) {
        return false
      }

      return normalizeDisplayName(authorName) === normalizedSelectedAuthor
    })
  }, [quickFilterMatchedPullRequests, selectedAuthorFilter])

  useEffect(() => {
    if (!selectedAuthorFilter) {
      return
    }

    const selectedStillExists = authorFilterOptions.some(
      (authorName) => normalizeDisplayName(authorName) === normalizeDisplayName(selectedAuthorFilter),
    )

    if (!selectedStillExists) {
      setSelectedAuthorFilter('')
    }
  }, [authorFilterOptions, selectedAuthorFilter])

  useEffect(() => {
    localStorage.setItem(
      PULL_REQUEST_FULL_APPROVAL_THRESHOLD_STORAGE_KEY,
      String(fullApprovalThreshold),
    )
  }, [fullApprovalThreshold])

  return {
    quickFilterInput,
    onQuickFilterInputChange: setQuickFilterInput,
    onQuickFilterClear: () => setQuickFilterInput(''),
    selectedAuthorFilter,
    authorFilterOptions,
    onAuthorFilterChange: setSelectedAuthorFilter,
    fullApprovalThreshold,
    onFullApprovalThresholdChange: setFullApprovalThreshold,
    filteredPullRequests,
  }
}
