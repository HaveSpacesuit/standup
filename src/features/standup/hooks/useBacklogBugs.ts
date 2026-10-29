import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine, BacklogBug } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { rankBacklogBugs, type RankedBacklogBug } from '../utils/backlogValue'
import { isAbortError, toErrorMessage } from './queryErrors'

type UseBacklogBugsArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>
  reloadNonce: number
  enabled: boolean
}

type UseBacklogBugsResult = {
  backlogBugs: RankedBacklogBug[]
  backlogBugsLoading: boolean
  backlogBugsError: string | null
}

export function useBacklogBugs({
  adoQueryEngine,
  selectedTeam,
  reloadNonce,
  enabled,
}: UseBacklogBugsArgs): UseBacklogBugsResult {
  const [bugs, setBugs] = useState<BacklogBug[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!adoQueryEngine) {
      setBugs(null)
      setLoading(false)
      setError(null)
      return
    }

    // Skip the query until the Backlog page is actually viewed.
    if (!enabled) {
      setLoading(false)
      return
    }

    const abortController = new AbortController()
    setLoading(true)
    setError(null)

    adoQueryEngine
      .getBacklogBugs(selectedTeam, abortController.signal)
      .then((loadedBugs) => {
        if (!abortController.signal.aborted) {
          setBugs(loadedBugs)
        }
      })
      .catch((loadError: unknown) => {
        if (!abortController.signal.aborted && !isAbortError(loadError)) {
          setBugs(null)
          setError(toErrorMessage(loadError, 'Unknown error while loading backlog bugs.'))
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, enabled, reloadNonce, selectedTeam])

  const backlogBugs = useMemo(() => (bugs ? rankBacklogBugs(bugs) : []), [bugs])

  // Until the first result (or error) arrives, report loading so the page never flashes an empty state.
  const backlogBugsLoading = loading || (enabled && adoQueryEngine !== null && bugs === null && error === null)

  return {
    backlogBugs,
    backlogBugsLoading,
    backlogBugsError: error,
  }
}
