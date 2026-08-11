import { Box, FormControlLabel, Switch, Typography } from '@mui/material'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamOption } from '../components/TeamToolbarControls'
import { PullRequestsList } from '../components/PullRequestsList'
import { PullRequestsToolbar } from '../components/PullRequestsToolbar'

type PullRequestsPageProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
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
  colorScheme,
  onToggleColorScheme,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
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

      <Box
        sx={{
          px: 2,
          py: 1,
          minHeight: 52,
          flexShrink: 0,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.default',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Switch
              size="small"
              checked={colorScheme === 'dark'}
              onChange={onToggleColorScheme}
            />
          }
          label={<Typography variant="body-sm">Dark mode</Typography>}
        />
      </Box>
    </>
  )
}
