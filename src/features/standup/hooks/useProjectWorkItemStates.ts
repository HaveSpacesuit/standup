import { useEffect, useState } from 'react'
import type { AdoQueryEngine, ProjectWorkItemState } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { isAbortError, toErrorMessage } from './queryErrors'

type UseProjectWorkItemStatesArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName'>
}

type UseProjectWorkItemStatesResult = {
  workItemStates: ProjectWorkItemState[]
  workItemTypes: string[]
  workItemStatesLoading: boolean
  workItemStatesError: string | null
  retryWorkItemStates: () => void
}

export function useProjectWorkItemStates({
  adoQueryEngine,
  selectedTeam,
}: UseProjectWorkItemStatesArgs): UseProjectWorkItemStatesResult {
  const [workItemStates, setWorkItemStates] = useState<ProjectWorkItemState[]>([])
  const [workItemTypes, setWorkItemTypes] = useState<string[]>([])
  const [workItemStatesLoading, setWorkItemStatesLoading] = useState(false)
  const [workItemStatesError, setWorkItemStatesError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  const retryWorkItemStates = () => {
    adoQueryEngine?.clearProjectWorkItemTypesCache(selectedTeam)
    setReloadNonce((current) => current + 1)
  }

  useEffect(() => {
    setWorkItemStatesError(null)
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
          setWorkItemStatesError(`Unable to load work item types and states: ${toErrorMessage(error, 'Unknown error')}`)
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
  }, [adoQueryEngine, selectedTeam, reloadNonce])

  return { workItemStates, workItemTypes, workItemStatesLoading, workItemStatesError, retryWorkItemStates }
}
