import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamOption } from '../components/TeamToolbarControls'
import { QualityAssuranceList } from '../components/QualityAssuranceList'
import { QualityAssuranceToolbar } from '../components/QualityAssuranceToolbar'

type QualityAssurancePageProps = {
  patConfigured: boolean
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  onRefresh: () => void
  isLoading: boolean
  newItems: WorkItemSummary[]
  newItemsError: string | null
}

export function QualityAssurancePage({
  patConfigured,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  onRefresh,
  isLoading,
  newItems,
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
        selectedActivityFilter=""
        activityFilterOptions={[]}
        onActivityFilterChange={() => {}}
        onRefresh={onRefresh}
        isLoading={isLoading}
      />

      <QualityAssuranceList
        isLoading={isLoading}
        error={newItemsError}
        newItems={newItems}
      />
    </>
  )
}
