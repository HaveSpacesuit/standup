import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamOption } from '../components/TeamToolbarControls'
import { PullRequestsList } from '../components/PullRequestsList'
import { PullRequestsToolbar } from '../components/PullRequestsToolbar'
import type { RefObject } from 'react'

type PullRequestsPageProps = {
  patConfigured: boolean
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  selectedAuthorFilter: string
  authorFilterOptions: string[]
  onAuthorFilterChange: (value: string) => void
  fullApprovalThreshold: number
  onFullApprovalThresholdChange: (value: number) => void
  onRefresh: () => void
  isPullRequestsLoading: boolean
  pullRequests: WorkItemSummary[]
}

export function PullRequestsPage({
  patConfigured,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  quickFilterInput,
  onQuickFilterInputChange,
  onQuickFilterClear,
  quickFilterInputRef,
  selectedAuthorFilter,
  authorFilterOptions,
  onAuthorFilterChange,
  fullApprovalThreshold,
  onFullApprovalThresholdChange,
  onRefresh,
  isPullRequestsLoading,
  pullRequests,
}: PullRequestsPageProps) {
  return (
    <>
      <PullRequestsToolbar
        patConfigured={patConfigured}
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
        quickFilterInput={quickFilterInput}
        onQuickFilterInputChange={onQuickFilterInputChange}
        onQuickFilterClear={onQuickFilterClear}
        quickFilterInputRef={quickFilterInputRef}
        selectedAuthorFilter={selectedAuthorFilter}
        authorFilterOptions={authorFilterOptions}
        onAuthorFilterChange={onAuthorFilterChange}
        fullApprovalThreshold={fullApprovalThreshold}
        onFullApprovalThresholdChange={onFullApprovalThresholdChange}
        onRefresh={onRefresh}
        isPullRequestsLoading={isPullRequestsLoading}
      />

      <PullRequestsList
        isLoading={isPullRequestsLoading}
        pullRequests={pullRequests}
        fullApprovalThreshold={fullApprovalThreshold}
      />
    </>
  )
}
