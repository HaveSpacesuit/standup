import { useEffect, useState } from 'react'
import type { AdoQueryEngine, ProjectWorkItemState } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { isAbortError } from './queryErrors'

type UseProjectWorkItemStatesArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName'>
}

type UseProjectWorkItemStatesResult = {
  workItemStates: ProjectWorkItemState[]
  workItemTypes: string[]
  workItemStatesLoading: boolean
}

export function useProjectWorkItemStates({
  adoQueryEngine,
  selectedTeam,
}: UseProjectWorkItemStatesArgs): UseProjectWorkItemStatesResult {
  const [workItemStates, setWorkItemStates] = useState<ProjectWorkItemState[]>([])
  const [workItemTypes, setWorkItemTypes] = useState<string[]>([])
  const [workItemStatesLoading, setWorkItemStatesLoading] = useState(false)

  useEffect(() => {
    if (!adoQueryEngine) {
      setWorkItemStates([])
      setWorkItemTypes([])
      setWorkItemStatesLoading(false)
      return
    }

    const abortController = new AbortController()
    setWorkItemStatesLoading(true)

    Promise.all([
      adoQueryEngine.getProjectWorkItemStates(selectedTeam, abortController.signal),
      adoQueryEngine.getProjectWorkItemTypes(selectedTeam, abortController.signal),
    ])
      .then(([states, types]) => {
        if (!abortController.signal.aborted) {
          setWorkItemStates(states)
          setWorkItemTypes(types)
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted && !isAbortError(error)) {
          setWorkItemStates([])
          setWorkItemTypes([])
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

  return { workItemStates, workItemTypes, workItemStatesLoading }
}
