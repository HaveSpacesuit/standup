import { useEffect, useState } from 'react'
import type { AdoQueryEngine, TeamIterationOption } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { isAbortError } from './queryErrors'

type UseTeamIterationsArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'teamName' | 'iterationPath'>
  reloadNonce: number
}

type UseTeamIterationsResult = {
  iterations: TeamIterationOption[]
  iterationsLoading: boolean
}

export function useTeamIterations({
  adoQueryEngine,
  selectedTeam,
  reloadNonce,
}: UseTeamIterationsArgs): UseTeamIterationsResult {
  const [iterations, setIterations] = useState<TeamIterationOption[]>([])
  const [iterationsLoading, setIterationsLoading] = useState(false)

  useEffect(() => {
    if (!adoQueryEngine) {
      setIterations([])
      setIterationsLoading(false)
      return
    }

    const abortController = new AbortController()
    setIterationsLoading(true)

    adoQueryEngine
      .getTeamIterations(selectedTeam, abortController.signal)
      .then((result) => {
        if (!abortController.signal.aborted) {
          setIterations(result)
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted && !isAbortError(error)) {
          setIterations([])
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIterationsLoading(false)
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, selectedTeam, reloadNonce])

  return { iterations, iterationsLoading }
}
