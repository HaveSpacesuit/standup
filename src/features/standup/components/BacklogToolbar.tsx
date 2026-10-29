import { IconButton, Tooltip } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgIssueReport from '@stratakit/icons/issue-report.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import { PageToolbar } from './PageToolbar'
import { TeamToolbarControls, type TeamOption } from './TeamToolbarControls'

type BacklogToolbarProps = {
  patConfigured: boolean
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  onRefresh: () => void
  onOpenSettings: () => void
  isLoading: boolean
}

export function BacklogToolbar({
  patConfigured,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  onRefresh,
  onOpenSettings,
  isLoading,
}: BacklogToolbarProps) {
  const hasConfiguredTeams = teamOptions.length > 0

  return (
    <PageToolbar iconHref={svgIssueReport} title="Backlog" isPageTitle wrap>
      <TeamToolbarControls
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
      >
        <Tooltip title="Backlog settings">
          <span>
            <IconButton
              size="small"
              aria-label="Backlog settings"
              onClick={onOpenSettings}
              disabled={!patConfigured || !hasConfiguredTeams}
            >
              <Icon href={svgSettings} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Refresh">
          <span>
            <IconButton
              size="small"
              aria-label="Refresh"
              onClick={onRefresh}
              disabled={!patConfigured || !hasConfiguredTeams || isLoading}
            >
              <Icon href={svgCloudSync} />
            </IconButton>
          </span>
        </Tooltip>
      </TeamToolbarControls>
    </PageToolbar>
  )
}
