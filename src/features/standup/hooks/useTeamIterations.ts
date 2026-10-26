import { useEffect, useState } from 'react'
import type { AdoQueryEngine, TeamIterationOption } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { isAbortError, toErrorMessage } from './queryErrors'

type UseTeamIterationsArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>
  reloadNonce: number
}

type UseTeamIterationsResult = {
  iterations: TeamIterationOption[]
  iterationsLoading: boolean
  iterationsError: string | null
}

type IterationLoadState = {
  requestKey: string
  iterations: TeamIterationOption[]
  loading: boolean
  error: string | null
}

export function useTeamIterations({
  adoQueryEngine,
  selectedTeam,
  reloadNonce,
}: UseTeamIterationsArgs): UseTeamIterationsResult {
  const requestKey = JSON.stringify([
    selectedTeam.id,
    selectedTeam.orgName,
    selectedTeam.projectName,
    selectedTeam.teamName,
    selectedTeam.iterationPath,
  ])
  const [loadState, setLoadState] = useState<IterationLoadState>({
    requestKey: '',
    iterations: [],
    loading: false,
    error: null,
  })
  const currentState = loadState.requestKey === requestKey
    ? loadState
    : { requestKey, iterations: [], loading: Boolean(adoQueryEngine), error: null }

  useEffect(() => {
    if (!adoQueryEngine) {
      setLoadState({ requestKey, iterations: [], loading: false, error: null })
      return
    }

    const abortController = new AbortController()
    setLoadState({ requestKey, iterations: [], loading: true, error: null })

    adoQueryEngine
      .getTeamIterations(selectedTeam, abortController.signal)
      .then((result) => {
        if (!abortController.signal.aborted) {
          setLoadState({ requestKey, iterations: result, loading: false, error: null })
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted && !isAbortError(error)) {
          setLoadState({
            requestKey,
            iterations: [],
            loading: false,
            error: toErrorMessage(error, 'Unknown error while loading team iterations.'),
          })
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, selectedTeam, requestKey, reloadNonce])

  return {
    iterations: currentState.iterations,
    iterationsLoading: currentState.loading,
    iterationsError: currentState.error,
  }
}
