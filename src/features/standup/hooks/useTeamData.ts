import { useEffect, useState, type MutableRefObject } from 'react'
import type { AdoQueryEngine, CurrentIterationInfo, IterationWindowInfo, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { isAbortError, toErrorMessage } from './queryErrors'

type UseTeamDataArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: TeamProfile
  reloadNonce: number
  forceRefreshRef: MutableRefObject<boolean>
  includeWorkItemTypes?: string[]
  includeIterationPaths?: string[]
  useDefaultIterationWindow?: boolean
}

type UseTeamDataResult = {
  members: TeamMember[]
  membersLoading: boolean
  membersError: string | null
  workItems: WorkItemSummary[]
  workItemsLoading: boolean
  workItemsError: string | null
  iterationLoading: boolean
  currentIteration: CurrentIterationInfo | null
  iterationWindow: IterationWindowInfo
}

export function useTeamData({
  adoQueryEngine,
  selectedTeam,
  reloadNonce,
  forceRefreshRef,
  includeWorkItemTypes,
  includeIterationPaths,
  useDefaultIterationWindow,
}: UseTeamDataArgs): UseTeamDataResult {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [workItems, setWorkItems] = useState<WorkItemSummary[]>([])
  const [workItemsLoading, setWorkItemsLoading] = useState(false)
  const [workItemsError, setWorkItemsError] = useState<string | null>(null)
  const [iterationLoading, setIterationLoading] = useState(false)
  const [currentIteration, setCurrentIteration] = useState<CurrentIterationInfo | null>(null)
  const [iterationWindow, setIterationWindow] = useState<IterationWindowInfo>({ current: null, next: null })

  useEffect(() => {
    if (!adoQueryEngine) {
      setMembers([])
      setMembersError(null)
      setMembersLoading(false)
      setWorkItems([])
      setWorkItemsError(null)
      setWorkItemsLoading(false)
      setIterationLoading(false)
      setCurrentIteration(null)
      setIterationWindow({ current: null, next: null })
      return
    }

    const abortController = new AbortController()
    const forceRefresh = forceRefreshRef.current
    forceRefreshRef.current = false

    setMembersLoading(true)
    setMembersError(null)
    setWorkItemsLoading(true)
    setWorkItemsError(null)
    setIterationLoading(true)

    const loadTeamData = async () => {
      const [membersResult, workItemsResult, iterationWindowResult] = await Promise.allSettled([
        adoQueryEngine.getTeamMembers(selectedTeam, abortController.signal, {
          forceRefresh,
        }),
        adoQueryEngine.getWorkItemsForCurrentAndNextIteration(selectedTeam, abortController.signal, {
          forceRefresh,
          includeWorkItemTypes,
          includeIterationPaths,
          useDefaultIterationWindow,
        }),
        adoQueryEngine.getIterationWindowInfo(selectedTeam, abortController.signal, {
          forceRefresh,
        }),
      ])

      if (abortController.signal.aborted) {
        return
      }

      if (membersResult.status === 'fulfilled') {
        setMembers(membersResult.value)
      } else if (isAbortError(membersResult.reason)) {
        return
      } else {
        setMembers([])
        setMembersError(
          toErrorMessage(membersResult.reason, 'Unknown error while loading team members.'),
        )
      }

      if (workItemsResult.status === 'fulfilled') {
        setWorkItems(workItemsResult.value)
      } else if (isAbortError(workItemsResult.reason)) {
        return
      } else {
        setWorkItems([])
        setWorkItemsError(
          toErrorMessage(workItemsResult.reason, 'Unknown error while loading work items.'),
        )
      }

      if (iterationWindowResult.status === 'fulfilled') {
        setIterationWindow(iterationWindowResult.value)
        setCurrentIteration(iterationWindowResult.value.current)
      } else if (!isAbortError(iterationWindowResult.reason)) {
        setIterationWindow({ current: null, next: null })
        setCurrentIteration(null)
      }

      setMembersLoading(false)
      setWorkItemsLoading(false)
      setIterationLoading(false)
    }

    loadTeamData().catch((error: unknown) => {
      if (abortController.signal.aborted || isAbortError(error)) {
        return
      }

      setMembers([])
      setWorkItems([])
      setIterationWindow({ current: null, next: null })
      setCurrentIteration(null)
      setMembersError(toErrorMessage(error, 'Unknown error while loading team data.'))
      setWorkItemsError(toErrorMessage(error, 'Unknown error while loading team data.'))
      setMembersLoading(false)
      setWorkItemsLoading(false)
      setIterationLoading(false)
    })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, selectedTeam, reloadNonce, forceRefreshRef, includeWorkItemTypes, includeIterationPaths, useDefaultIterationWindow])

  return {
    members,
    membersLoading,
    membersError,
    workItems,
    workItemsLoading,
    workItemsError,
    iterationLoading,
    currentIteration,
    iterationWindow,
  }
}
