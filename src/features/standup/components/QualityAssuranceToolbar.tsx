import { FormControl, IconButton, MenuItem, Select, type SelectChangeEvent } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgClipboard from '@stratakit/icons/clipboard.svg'
import svgUserSettings from '@stratakit/icons/user-settings.svg'
import { PageToolbar } from './PageToolbar'
import { TeamToolbarControls, type TeamOption } from './TeamToolbarControls'

type QualityAssuranceToolbarProps = {
  patConfigured: boolean
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  selectedActivityFilter: string
  activityFilterOptions: string[]
  onActivityFilterChange: (value: string) => void
  onRefresh: () => void
  isLoading: boolean
}

export function QualityAssuranceToolbar({
  patConfigured,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  selectedActivityFilter,
  activityFilterOptions,
  onActivityFilterChange,
  onRefresh,
  isLoading,
}: QualityAssuranceToolbarProps) {
  const handleActivityFilterChange = (event: SelectChangeEvent<string>) => {
    onActivityFilterChange(event.target.value)
  }

  return (
    <PageToolbar iconHref={svgClipboard} title="Quality Assurance">
      <FormControl size="small" sx={{ minWidth: 230, maxWidth: 300 }}>
        <Select
          displayEmpty
          value={selectedActivityFilter}
          onChange={handleActivityFilterChange}
          disabled={!patConfigured || activityFilterOptions.length === 0}
          renderValue={(value) =>
            value && typeof value === 'string' ? value : 'All QA activity'
          }
        >
          <MenuItem value="">All QA activity</MenuItem>
          {activityFilterOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
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
          label="QA options"
          disabled
        >
          <Icon href={`${svgUserSettings}#icon-large`} size="large" />
        </IconButton>

        <IconButton
          size="small"
          label="Refresh"
          onClick={onRefresh}
          disabled={!patConfigured || isLoading}
        >
          <Icon href={`${svgCloudSync}#icon-large`} size="large" />
        </IconButton>
      </TeamToolbarControls>
    </PageToolbar>
  )
}
