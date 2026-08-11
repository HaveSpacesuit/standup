import { Button, FormControl, MenuItem, Select, type SelectChangeEvent } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgGitMerge from '@stratakit/icons/git-merge.svg'
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
  onRefresh,
  isPullRequestsLoading,
}: PullRequestsToolbarProps) {
  const handleAuthorFilterChange = (event: SelectChangeEvent<string>) => {
    onAuthorFilterChange(event.target.value)
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
      </TeamToolbarControls>
    </PageToolbar>
  )
}
