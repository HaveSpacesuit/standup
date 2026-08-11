import { Button } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgGitBranch from '@stratakit/icons/git-branch.svg'
import { PageToolbar } from './PageToolbar'
import { TeamToolbarControls, type TeamOption } from './TeamToolbarControls'

type PullRequestsToolbarProps = {
  patConfigured: boolean
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  onRefresh: () => void
  isPullRequestsLoading: boolean
}

export function PullRequestsToolbar({
  patConfigured,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  onRefresh,
  isPullRequestsLoading,
}: PullRequestsToolbarProps) {
  return (
    <PageToolbar iconHref={svgGitBranch} title="Pull Requests">
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
