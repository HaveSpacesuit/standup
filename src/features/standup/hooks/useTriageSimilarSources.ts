import { useEffect, useState } from 'react'
import type { AdoQueryEngine } from '../../../ado/queryEngine'
import type { BacklogBug, ClosedBug } from '../../../ado/types'
import type { TeamProfile } from '../../../appSettings'
import type { TriageSimilarOptions } from '../utils/triageOptions'
import { toErrorMessage } from './queryErrors'

type Args = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>
  options: TriageSimilarOptions
  enabled: boolean
  reloadNonce: number
}

/** The bugs beyond the queue that Triage compares titles with, for possible duplicates and regressions. */
export type TriageSimilarSources = {
  openBugs: BacklogBug[]
  closedBugs: ClosedBug[]
  /** Whether either list is still loading; meanwhile the queue is compared only with itself. */
  loading: boolean
  /** A source that failed to load is left out, with a warning, rather than holding back the page. */
  warnings: string[]
}

type Snapshot = { engine: AdoQueryEngine; key: string; sources: TriageSimilarSources }

export const EMPTY_TRIAGE_SIMILAR_SOURCES: TriageSimilarSources = { openBugs: [], closedBugs: [], loading: false, warnings: [] }
const LOADING_SOURCES: TriageSimilarSources = { ...EMPTY_TRIAGE_SIMILAR_SOURCES, loading: true }

/**
 * Loads the open bugs (shared with the Backlog page's cache) and the recently closed bugs that Similar items compares the
 * queue with, as the options ask. Only loads while enabled, so a clear queue costs no extra queries.
 */
export function useTriageSimilarSources({ adoQueryEngine, selectedTeam, options, enabled, reloadNonce }: Args): TriageSimilarSources {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const { openBugs, closedBugs, closedDays } = options
  const key = JSON.stringify([
    selectedTeam.id, selectedTeam.orgName, selectedTeam.projectName, selectedTeam.areaPath, openBugs, closedBugs && closedDays, reloadNonce,
  ])
  const canLoad = enabled && adoQueryEngine !== null && (openBugs || closedBugs)

  useEffect(() => {
    if (!canLoad || !adoQueryEngine) return
    let active = true
    setSnapshot({ engine: adoQueryEngine, key, sources: LOADING_SOURCES })
    void Promise.allSettled([
      openBugs ? adoQueryEngine.getBacklogBugs(selectedTeam) : Promise.resolve([]),
      closedBugs ? adoQueryEngine.getRecentlyClosedBugs(selectedTeam, closedDays) : Promise.resolve([]),
    ]).then(([open, closed]) => {
      if (!active) return
      const warnings: string[] = []
      if (open.status === 'rejected') {
        warnings.push(`Similar items could not check open bugs. ${toErrorMessage(open.reason, 'Refresh to retry.')}`)
      }
      if (closed.status === 'rejected') {
        warnings.push(`Similar items could not check bugs closed in the last ${closedDays} days. ${toErrorMessage(closed.reason, 'Refresh to retry.')}`)
      }
      setSnapshot({
        engine: adoQueryEngine,
        key,
        sources: {
          openBugs: open.status === 'fulfilled' ? open.value : [],
          closedBugs: closed.status === 'fulfilled' ? closed.value : [],
          loading: false,
          warnings,
        },
      })
    })
    return () => { active = false }
  }, [adoQueryEngine, canLoad, closedBugs, closedDays, key, openBugs, selectedTeam])

  if (!canLoad) return EMPTY_TRIAGE_SIMILAR_SOURCES
  return snapshot?.engine === adoQueryEngine && snapshot.key === key ? snapshot.sources : LOADING_SOURCES
}
