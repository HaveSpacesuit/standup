import svgGitBranch from '@stratakit/icons/git-branch.svg'
import { PageToolbar } from './PageToolbar'
import { TeamToolbarControls, type TeamOption } from './TeamToolbarControls'

type PullRequestsToolbarProps = {
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
}

export function PullRequestsToolbar({
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
}: PullRequestsToolbarProps) {
  return (
    <PageToolbar iconHref={svgGitBranch} title="Pull Requests">
        <TeamToolbarControls
          teamOptions={teamOptions}
          selectedTeamId={selectedTeamId}
          onTeamChange={onTeamChange}
          teamManagementUrl={teamManagementUrl}
        />
    </PageToolbar>
  )
}
