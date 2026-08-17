import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../teamProfiles'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import { bucketQualityAssuranceItems, resolveQualityAssuranceProjectConfig } from '../utils/qualityAssuranceBuckets'
import type { QaStateGroupOverrides } from '../utils/qaOptions'
import { isAbortError, toErrorMessage } from './queryErrors'
import type { QualityAssuranceRawData } from '../../../ado/workItemsApi'

type UseQualityAssuranceBucketsArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>
  reloadNonce: number
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
  stateGroupOverrides,
}: UseQualityAssuranceBucketsArgs): UseQualityAssuranceBucketsResult {
  const [rawData, setRawData] = useState<QualityAssuranceRawData | null>(null)
  const [qaBucketsLoading, setQaBucketsLoading] = useState(false)
  const [qaBucketsError, setQaBucketsError] = useState<string | null>(null)

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

    adoQueryEngine
      .getQualityAssuranceRawData(selectedTeam, abortController.signal)
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
  }, [adoQueryEngine, reloadNonce, selectedTeam])

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
