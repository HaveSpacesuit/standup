import { type RefObject } from 'react'
import type { TeamOption } from '../components/TeamToolbarControls'
import { QualityAssuranceList } from '../components/QualityAssuranceList'
import { QualityAssuranceToolbar } from '../components/QualityAssuranceToolbar'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'

type QualityAssurancePageProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  buckets: QualityAssuranceBucket[]
  onRefresh: () => void
  isLoading: boolean
  newItemsError: string | null
}

export function QualityAssurancePage({
  patConfigured,
  colorScheme,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  quickFilterInput,
  onQuickFilterInputChange,
  onQuickFilterClear,
  quickFilterInputRef,
  buckets,
  onRefresh,
  isLoading,
  newItemsError,
}: QualityAssurancePageProps) {
  return (
    <>
      <QualityAssuranceToolbar
        patConfigured={patConfigured}
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
        quickFilterInput={quickFilterInput}
        onQuickFilterInputChange={onQuickFilterInputChange}
        onQuickFilterClear={onQuickFilterClear}
        quickFilterInputRef={quickFilterInputRef}
        onRefresh={onRefresh}
        isLoading={isLoading}
      />

      <QualityAssuranceList
        isLoading={isLoading}
        error={newItemsError}
        buckets={buckets}
        colorScheme={colorScheme}
      />
    </>
  )
}
