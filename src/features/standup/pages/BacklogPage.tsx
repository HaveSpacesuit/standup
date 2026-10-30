import { useState, type RefObject } from 'react'
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
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  onRefresh: () => void
  /** The ranked bugs that pass the quick filter. */
  bugs: RankedBacklogBug[]
  /** How many open bugs there are before the quick filter, to tell "no match" from "no open bugs". */
  totalBugCount: number
  isLoading: boolean
  error: string | null
}

export function BacklogPage({
  patConfigured,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  quickFilterInput,
  onQuickFilterInputChange,
  onQuickFilterClear,
  quickFilterInputRef,
  onRefresh,
  bugs,
  totalBugCount,
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
        quickFilterInput={quickFilterInput}
        onQuickFilterInputChange={onQuickFilterInputChange}
        onQuickFilterClear={onQuickFilterClear}
        quickFilterInputRef={quickFilterInputRef}
        onRefresh={onRefresh}
        onOpenSettings={() => setSettingsOpen(true)}
        isLoading={isLoading}
      />

      {hasConfiguredTeams ? (
        <BacklogList isLoading={isLoading} error={error} bugs={bugs} totalBugCount={totalBugCount} />
      ) : (
        <TeamConfigurationEmptyState pageLabel="Backlog" />
      )}

      {hasConfiguredTeams ? (
        <BacklogSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </>
  )
}
