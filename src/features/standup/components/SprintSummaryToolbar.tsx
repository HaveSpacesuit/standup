import svgFastForward from '@stratakit/icons/fast-forward.svg'
import { PageToolbar } from './PageToolbar'
import { TeamToolbarControls, type TeamOption } from './TeamToolbarControls'

type SprintSummaryToolbarProps = {
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
}

export function SprintSummaryToolbar({
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
}: SprintSummaryToolbarProps) {
  return (
    <PageToolbar iconHref={svgFastForward} title="Sprint Review">
      <TeamToolbarControls
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
      />
    </PageToolbar>
  )
}
