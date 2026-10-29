import { useState } from 'react'
import { BacklogList } from '../components/BacklogList'
import { BacklogSettingsDialog } from '../components/BacklogSettingsDialog'
import { BacklogToolbar } from '../components/BacklogToolbar'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'
import type { TeamOption } from '../components/TeamToolbarControls'
import type { RankedBacklogBug } from '../utils/backlogValue'

type BacklogPageProps = {
  patConfigured: boolean
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  onRefresh: () => void
  bugs: RankedBacklogBug[]
  isLoading: boolean
  error: string | null
}

export function BacklogPage({
  patConfigured,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  onRefresh,
  bugs,
  isLoading,
  error,
}: BacklogPageProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const hasConfiguredTeams = teamOptions.length > 0

  return (
    <>
      <BacklogToolbar
        patConfigured={patConfigured}
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
        onRefresh={onRefresh}
        onOpenSettings={() => setSettingsOpen(true)}
        isLoading={isLoading}
      />

      {hasConfiguredTeams ? (
        <BacklogList isLoading={isLoading} error={error} bugs={bugs} />
      ) : (
        <TeamConfigurationEmptyState pageLabel="Backlog" />
      )}

      {hasConfiguredTeams ? (
        <BacklogSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </>
  )
}
