type SyncTransition = {
  teamId: string
  wasLoading: boolean
  isLoading: boolean
  failed: boolean
  /** True when Refresh was pressed for this team since its last recorded sync. */
  refreshRequested: boolean
  /** True when the team already has a recorded sync time. */
  hasSyncTime: boolean
}

/**
 * Whether a finished load fetched fresh data. Query results stay cached until Refresh clears them,
 * so returning to a team that was already loaded keeps the earlier time.
 */
export function shouldRecordTeamSync({
  teamId,
  wasLoading,
  isLoading,
  failed,
  refreshRequested,
  hasSyncTime,
}: SyncTransition): boolean {
  return Boolean(teamId) && wasLoading && !isLoading && !failed && (refreshRequested || !hasSyncTime)
}

/** Relative sync label such as "Synced just now" or "Synced 5m ago". */
export function formatSyncedLabel(syncedAt: number, now = Date.now()): string {
  const minutes = Math.floor(Math.max(now - syncedAt, 0) / 60_000)
  if (minutes === 0) {
    return 'Synced just now'
  }

  if (minutes < 60) {
    return `Synced ${minutes}m ago`
  }

  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `Synced ${hours}h ago` : `Synced ${Math.floor(hours / 24)}d ago`
}
