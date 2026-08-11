import { useState } from 'react'
import {
  Button,
  FormControl,
  MenuItem,
  Select,
  type SelectChangeEvent,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgConfiguration from '@stratakit/icons/configuration.svg'
import svgGitMerge from '@stratakit/icons/git-merge.svg'
import { PullRequestsOptionsDialog } from './PullRequestsOptionsDialog'
import { PageToolbar } from './PageToolbar'
import { TeamToolbarControls, type TeamOption } from './TeamToolbarControls'

type PullRequestsToolbarProps = {
  patConfigured: boolean
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
}

export function PullRequestsToolbar({
  patConfigured,
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
}: PullRequestsToolbarProps) {
  const [isOptionsDialogOpen, setIsOptionsDialogOpen] = useState(false)

  const handleAuthorFilterChange = (event: SelectChangeEvent<string>) => {
    onAuthorFilterChange(event.target.value)
  }

  const handleOpenOptions = () => {
    setIsOptionsDialogOpen(true)
  }

  const handleCloseOptions = () => {
    setIsOptionsDialogOpen(false)
  }

  return (
    <PageToolbar iconHref={svgGitMerge} title="Pull Requests">
      <FormControl size="small" sx={{ minWidth: 210, maxWidth: 270 }}>
        <Select
          displayEmpty
          value={selectedAuthorFilter}
          onChange={handleAuthorFilterChange}
          disabled={!patConfigured || authorFilterOptions.length === 0}
          renderValue={(value) =>
            value && typeof value === 'string' ? value : 'All team members'
          }
        >
          <MenuItem value="">All team members</MenuItem>
          {authorFilterOptions.map((authorName) => (
            <MenuItem key={authorName} value={authorName}>
              {authorName}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TeamToolbarControls
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
      >
        <Button
          size="small"
          variant="outlined"
          startIcon={<Icon href={svgCloudSync} />}
          onClick={onRefresh}
          disabled={!patConfigured || isPullRequestsLoading}
        >
          Refresh
        </Button>

        <Button
          size="small"
          variant="outlined"
          startIcon={<Icon href={svgConfiguration} />}
          onClick={handleOpenOptions}
          disabled={!patConfigured}
        >
          Options
        </Button>

        <PullRequestsOptionsDialog
          open={isOptionsDialogOpen}
          fullApprovalThreshold={fullApprovalThreshold}
          onFullApprovalThresholdChange={onFullApprovalThresholdChange}
          onClose={handleCloseOptions}
        />
      </TeamToolbarControls>
    </PageToolbar>
  )
}
