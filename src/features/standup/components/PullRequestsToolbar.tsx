import { useState } from 'react'
import {
  FormControl,
  IconButton,
  MenuItem,
  Select,
  type SelectChangeEvent,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgGitMerge from '@stratakit/icons/git-merge.svg'
import svgUserSettings from '@stratakit/icons/user-settings.svg'
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
        <IconButton
          size="small"
          label="PR options"
          onClick={handleOpenOptions}
          disabled={!patConfigured}
        >
          <Icon href={`${svgUserSettings}#icon-large`} size="large" />
        </IconButton>

        <IconButton
          size="small"
          label="Refresh"
          onClick={onRefresh}
          disabled={!patConfigured || isPullRequestsLoading}
        >
          <Icon href={`${svgCloudSync}#icon-large`} size="large" />
        </IconButton>

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
