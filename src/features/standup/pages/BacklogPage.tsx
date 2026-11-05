import { useState, type RefObject } from 'react'
import { BacklogList } from '../components/BacklogList'
import { BacklogOptionsDialog } from '../components/BacklogOptionsDialog'
import { BacklogToolbar } from '../components/BacklogToolbar'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'
import type { TeamOption } from '../components/TeamToolbarControls'
import { formatBacklogCount } from '../utils/backlogFilter'
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
  /** When the backlog last loaded fresh from Azure DevOps, for the "Synced 5m ago" label. */
  syncedAt?: number | null
  /** One-line rows; the team's compact density, shared with the Development and QA cards. */
  compactRows?: boolean
  onCompactRowsChange?: (compactRows: boolean) => void
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
  syncedAt = null,
  compactRows = false,
  onCompactRowsChange = () => {},
}: BacklogPageProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const hasConfiguredTeams = teamOptions.length > 0
  const hasList = patConfigured && hasConfiguredTeams && !isLoading && !error

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
        countLabel={hasList ? formatBacklogCount(bugs.length, totalBugCount) : null}
        syncedAt={syncedAt}
      />

      {hasConfiguredTeams ? (
        <BacklogList
          isLoading={isLoading}
          error={error}
          bugs={bugs}
          totalBugCount={totalBugCount}
          compact={compactRows}
        />
      ) : (
        <TeamConfigurationEmptyState pageLabel="Backlog" />
      )}

      {hasConfiguredTeams ? (
        <BacklogOptionsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          compactRows={compactRows}
          onCompactRowsChange={onCompactRowsChange}
        />
      ) : null}
    </>
  )
}
