import { useCallback, useEffect, useRef, useState } from 'react'
import { shouldRecordTeamSync } from '../utils/syncStatus'

type UseTeamDataSyncedAtArgs = {
  teamId: string
  isLoading: boolean
  failed: boolean
}

/** Remembers, per team, when the Development data last finished loading fresh from Azure DevOps. */
export function useTeamDataSyncedAt({ teamId, isLoading, failed }: UseTeamDataSyncedAtArgs) {
  const [syncedAtByTeam, setSyncedAtByTeam] = useState<Record<string, number>>({})
  const wasLoadingRef = useRef(isLoading)
  const refreshRequestedTeamRef = useRef<string | null>(null)

  useEffect(() => {
    const wasLoading = wasLoadingRef.current
    wasLoadingRef.current = isLoading
    if (!wasLoading || isLoading) {
      return
    }

    const refreshRequested = refreshRequestedTeamRef.current === teamId
    if (refreshRequested) {
      refreshRequestedTeamRef.current = null
    }

    setSyncedAtByTeam((previous) => shouldRecordTeamSync({
      teamId,
      wasLoading,
      isLoading,
      failed,
      refreshRequested,
      hasSyncTime: previous[teamId] !== undefined,
    }) ? { ...previous, [teamId]: Date.now() } : previous)
  }, [failed, isLoading, teamId])

  const markRefreshRequested = useCallback(() => {
    refreshRequestedTeamRef.current = teamId
  }, [teamId])

  return {
    syncedAt: teamId ? syncedAtByTeam[teamId] ?? null : null,
    markRefreshRequested,
  }
}
