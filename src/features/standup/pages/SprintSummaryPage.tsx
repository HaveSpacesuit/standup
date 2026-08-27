import { Box } from '@mui/material'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { StatusColumn } from '../utils/statusColumnStyles'
import type { TeamOption } from '../components/TeamToolbarControls'
import { SprintSummaryBoard } from '../components/SprintSummaryBoard'
import { SprintSummaryToolbar } from '../components/SprintSummaryToolbar'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'

type SprintSummaryPageProps = {
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  isLoading: boolean
  workItemsError: string | null
  workItems: WorkItemSummary[]
  currentIterationName: string | null
  visitedStatusesByItemId: Record<number, StatusColumn[]>
}

export function SprintSummaryPage({
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  patConfigured,
  colorScheme,
  isLoading,
  workItemsError,
  workItems,
  currentIterationName,
  visitedStatusesByItemId,
}: SprintSummaryPageProps) {
  const hasConfiguredTeams = teamOptions.length > 0

  return (
    <>
      <SprintSummaryToolbar
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
      />

      {!hasConfiguredTeams ? (
        <TeamConfigurationEmptyState pageLabel="Sprint summary" />
      ) : (
        <Box component="main" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <SprintSummaryBoard
            patConfigured={patConfigured}
            isLoading={isLoading}
            colorScheme={colorScheme}
            workItemsError={workItemsError}
            workItems={workItems}
            currentIterationName={currentIterationName}
            visitedStatusesByItemId={visitedStatusesByItemId}
          />
        </Box>
      )}
    </>
  )
}
