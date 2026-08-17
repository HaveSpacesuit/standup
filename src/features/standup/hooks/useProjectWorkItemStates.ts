import { useEffect, useState } from 'react'
import type { AdoQueryEngine, ProjectWorkItemState } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../teamProfiles'
import { isAbortError } from './queryErrors'

type UseProjectWorkItemStatesArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName'>
}

type UseProjectWorkItemStatesResult = {
  workItemStates: ProjectWorkItemState[]
  workItemStatesLoading: boolean
}

export function useProjectWorkItemStates({
  adoQueryEngine,
  selectedTeam,
}: UseProjectWorkItemStatesArgs): UseProjectWorkItemStatesResult {
  const [workItemStates, setWorkItemStates] = useState<ProjectWorkItemState[]>([])
  const [workItemStatesLoading, setWorkItemStatesLoading] = useState(false)

  useEffect(() => {
    if (!adoQueryEngine) {
      setWorkItemStates([])
      setWorkItemStatesLoading(false)
      return
    }

    const abortController = new AbortController()
    setWorkItemStatesLoading(true)

    adoQueryEngine
      .getProjectWorkItemStates(selectedTeam, abortController.signal)
      .then((states) => {
        if (!abortController.signal.aborted) {
          setWorkItemStates(states)
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted && !isAbortError(error)) {
          setWorkItemStates([])
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setWorkItemStatesLoading(false)
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, selectedTeam])

  return { workItemStates, workItemStatesLoading }
}
