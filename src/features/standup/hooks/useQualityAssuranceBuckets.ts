import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../teamProfiles'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import { bucketQualityAssuranceItems, resolveQualityAssuranceProjectConfig } from '../utils/qualityAssuranceBuckets'
import type { QaFilterRule, QaStateGroupOverrides } from '../utils/qaOptions'
import { isAbortError, toErrorMessage } from './queryErrors'
import type { QualityAssuranceRawData } from '../../../ado/workItemsApi'

type UseQualityAssuranceBucketsArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>
  reloadNonce: number
  generalFilters?: QaFilterRule[]
  stateGroupOverrides?: QaStateGroupOverrides | null
}

type UseQualityAssuranceBucketsResult = {
  qaBuckets: QualityAssuranceBucket[]
  qaBucketsLoading: boolean
  qaBucketsError: string | null
}

export function useQualityAssuranceBuckets({
  adoQueryEngine,
  selectedTeam,
  reloadNonce,
  generalFilters,
  stateGroupOverrides,
}: UseQualityAssuranceBucketsArgs): UseQualityAssuranceBucketsResult {
  const [rawData, setRawData] = useState<QualityAssuranceRawData | null>(null)
  const [qaBucketsLoading, setQaBucketsLoading] = useState(false)
  const [qaBucketsError, setQaBucketsError] = useState<string | null>(null)

  // Derive excluded work item types from general filters as a stable string key for the fetch effect.
  const excludeWorkItemTypesKey = useMemo(() => {
    return (generalFilters ?? [])
      .filter((r): r is Extract<QaFilterRule, { type: 'work-item-type' }> => r.type === 'work-item-type')
      .map((r) => r.workItemType.trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join(',')
  }, [generalFilters])

  useEffect(() => {
    if (!adoQueryEngine) {
      setRawData(null)
      setQaBucketsLoading(false)
      setQaBucketsError(null)
      return
    }

    const abortController = new AbortController()
    setQaBucketsLoading(true)
    setQaBucketsError(null)

    const excludeWorkItemTypes = excludeWorkItemTypesKey ? excludeWorkItemTypesKey.split(',') : []

    adoQueryEngine
      .getQualityAssuranceRawData(selectedTeam, abortController.signal, { excludeWorkItemTypes })
      .then((data) => {
        if (!abortController.signal.aborted) {
          setRawData(data)
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted && !isAbortError(error)) {
          setRawData(null)
          setQaBucketsError(toErrorMessage(error, 'Unknown error while loading QA items.'))
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setQaBucketsLoading(false)
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, reloadNonce, selectedTeam, excludeWorkItemTypesKey])

  const qaBuckets = useMemo<QualityAssuranceBucket[]>(() => {
    if (!rawData) {
      return []
    }

    const config = resolveQualityAssuranceProjectConfig(selectedTeam, stateGroupOverrides)
    return bucketQualityAssuranceItems(rawData.candidates, rawData.updatesByItemId, config)
  }, [rawData, selectedTeam, stateGroupOverrides])

  return {
    qaBuckets,
    qaBucketsLoading,
    qaBucketsError,
  }
}
