import { useEffect, useRef } from 'react'
import { isValidRefreshMinutes, type AutoRefreshOptions } from '../utils/autoRefresh'

type UseAutoRefreshArgs = {
  options: AutoRefreshOptions
  active: boolean
  scope: string
  syncedAt: number | null
  isLoading: boolean
  onRefresh: () => void
}

/** Refreshes only the active page, measuring age from its own completed load, not from navigation. */
export function useAutoRefresh({ options, active, scope, syncedAt, isLoading, onRefresh }: UseAutoRefreshArgs) {
  const attempts = useRef(new Map<string, number>())

  useEffect(() => {
    if (!active || !options.enabled || !isValidRefreshMinutes(options.minutes) || isLoading || syncedAt === null) return
    const interval = options.minutes * 60_000
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const lastRefresh = Math.max(syncedAt, attempts.current.get(scope) ?? 0)
      timer = setTimeout(check, Math.min(Math.max(0, lastRefresh + interval - Date.now()), 2_147_483_647))
    }
    const check = () => {
      clearTimeout(timer)
      // Failed requests keep their old sync time. Wait an interval before retrying instead of looping.
      const lastRefresh = Math.max(syncedAt, attempts.current.get(scope) ?? 0)
      const remaining = lastRefresh + interval - Date.now()
      if (remaining <= 0) {
        attempts.current.set(scope, Date.now())
        onRefresh()
      }
      schedule()
    }
    // Let a completed load's timestamp commit before checking whether the previous data was overdue.
    schedule()
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [active, options.enabled, options.minutes, scope, syncedAt, isLoading, onRefresh])
}
