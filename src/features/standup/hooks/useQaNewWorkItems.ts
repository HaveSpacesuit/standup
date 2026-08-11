import { useEffect, useState } from 'react'
import type { AdoQueryEngine } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../teamProfiles'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import { isAbortError, toErrorMessage } from './queryErrors'

type UseQaNewWorkItemsArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>
  reloadNonce: number
}

type UseQaNewWorkItemsResult = {
  qaBuckets: QualityAssuranceBucket[]
  qaBucketsLoading: boolean
  qaBucketsError: string | null
}

export function useQaNewWorkItems({
  adoQueryEngine,
  selectedTeam,
  reloadNonce,
}: UseQaNewWorkItemsArgs): UseQaNewWorkItemsResult {
  const [qaBuckets, setQaBuckets] = useState<QualityAssuranceBucket[]>([])
  const [qaBucketsLoading, setQaBucketsLoading] = useState(false)
  const [qaBucketsError, setQaBucketsError] = useState<string | null>(null)

  useEffect(() => {
    if (!adoQueryEngine) {
      setQaBuckets([])
      setQaBucketsLoading(false)
      setQaBucketsError(null)
      return
    }

    const abortController = new AbortController()
    setQaBucketsLoading(true)
    setQaBucketsError(null)

    adoQueryEngine
      .getQualityAssuranceBuckets(selectedTeam, abortController.signal)
      .then((buckets) => {
        if (!abortController.signal.aborted) {
          setQaBuckets(buckets)
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted && !isAbortError(error)) {
          setQaBuckets([])
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

  return {
    qaBuckets,
    qaBucketsLoading,
    qaBucketsError,
  }
}
