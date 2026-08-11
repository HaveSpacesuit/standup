import { useEffect, useState } from 'react'
import type { AdoQueryEngine, WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../teamProfiles'
import { isAbortError, toErrorMessage } from './queryErrors'

type UseQaNewWorkItemsArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>
  reloadNonce: number
}

type UseQaNewWorkItemsResult = {
  qaNewItems: WorkItemSummary[]
  qaNewItemsLoading: boolean
  qaNewItemsError: string | null
}

export function useQaNewWorkItems({
  adoQueryEngine,
  selectedTeam,
  reloadNonce,
}: UseQaNewWorkItemsArgs): UseQaNewWorkItemsResult {
  const [qaNewItems, setQaNewItems] = useState<WorkItemSummary[]>([])
  const [qaNewItemsLoading, setQaNewItemsLoading] = useState(false)
  const [qaNewItemsError, setQaNewItemsError] = useState<string | null>(null)

  useEffect(() => {
    if (!adoQueryEngine) {
      setQaNewItems([])
      setQaNewItemsLoading(false)
      setQaNewItemsError(null)
      return
    }

    const abortController = new AbortController()
    setQaNewItemsLoading(true)
    setQaNewItemsError(null)

    adoQueryEngine
      .getQaNewWorkItems(selectedTeam, abortController.signal)
      .then((items) => {
        if (!abortController.signal.aborted) {
          setQaNewItems(items)
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted && !isAbortError(error)) {
          setQaNewItems([])
          setQaNewItemsError(toErrorMessage(error, 'Unknown error while loading QA New items.'))
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setQaNewItemsLoading(false)
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, reloadNonce, selectedTeam])

  return {
    qaNewItems,
    qaNewItemsLoading,
    qaNewItemsError,
  }
}
