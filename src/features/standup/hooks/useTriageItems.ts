import { useEffect, useState } from 'react'
import type { AdoQueryEngine } from '../../../ado/queryEngine'
import type { TriageResult } from '../../../ado/types'
import type { TeamProfile } from '../../../appSettings'
import { hasTriageRules, type TriageQueryOptions } from '../utils/triageOptions'
import { isAbortError, toErrorMessage } from './queryErrors'

type Args = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>
  options: TriageQueryOptions
  enabled: boolean
  reloadNonce: number
}

type Snapshot = {
  engine: AdoQueryEngine
  key: string
  result: TriageResult | null
  error: string | null
}
const EMPTY_RESULT: TriageResult = { items: [], warnings: [] }

export function useTriageItems({ adoQueryEngine, selectedTeam, options, enabled, reloadNonce }: Args) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const key = JSON.stringify([selectedTeam.id, selectedTeam.orgName, selectedTeam.projectName, selectedTeam.areaPath, options, reloadNonce])
  const canLoad = enabled && adoQueryEngine !== null && hasTriageRules(options)

  useEffect(() => {
    if (!canLoad || !adoQueryEngine) return
    let active = true
    setSnapshot({ engine: adoQueryEngine, key, result: null, error: null })
    adoQueryEngine.getTriageItems(selectedTeam, options).then(
      (result) => {
        if (active) setSnapshot({ engine: adoQueryEngine, key, result, error: null })
      },
      (cause: unknown) => {
        if (active) setSnapshot({
          engine: adoQueryEngine, key, result: null,
          error: isAbortError(cause) ? 'Triage loading was canceled. Refresh to retry.' : toErrorMessage(cause, 'Unable to load Triage items.'),
        })
      },
    )
    return () => { active = false }
  }, [adoQueryEngine, canLoad, key, options, selectedTeam])

  const current = canLoad && snapshot?.engine === adoQueryEngine && snapshot.key === key ? snapshot : null
  return {
    triageResult: current?.result ?? EMPTY_RESULT,
    triageLoading: canLoad && (!current || (current.result === null && current.error === null)),
    triageError: current?.error ?? null,
  }
}
