import { useEffect, useState, type MutableRefObject } from 'react'
import type { AdoQueryEngine, CurrentIterationInfo, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../teamProfiles'
import { isAbortError, toErrorMessage } from './queryErrors'

type UseTeamDataArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: TeamProfile
  reloadNonce: number
  forceRefreshRef: MutableRefObject<boolean>
}

type UseTeamDataResult = {
  members: TeamMember[]
  membersLoading: boolean
  membersError: string | null
  workItems: WorkItemSummary[]
  workItemsLoading: boolean
  workItemsError: string | null
  currentIteration: CurrentIterationInfo | null
}

export function useTeamData({
  adoQueryEngine,
  selectedTeam,
  reloadNonce,
  forceRefreshRef,
}: UseTeamDataArgs): UseTeamDataResult {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [workItems, setWorkItems] = useState<WorkItemSummary[]>([])
  const [workItemsLoading, setWorkItemsLoading] = useState(false)
  const [workItemsError, setWorkItemsError] = useState<string | null>(null)
  const [currentIteration, setCurrentIteration] = useState<CurrentIterationInfo | null>(null)

  useEffect(() => {
    if (!adoQueryEngine) {
      setMembers([])
      setMembersError(null)
      setMembersLoading(false)
      setWorkItems([])
      setWorkItemsError(null)
      setWorkItemsLoading(false)
      setCurrentIteration(null)
      return
    }

    const abortController = new AbortController()
    const forceRefresh = forceRefreshRef.current
    forceRefreshRef.current = false

    setMembersLoading(true)
    setMembersError(null)
    setWorkItemsLoading(true)
    setWorkItemsError(null)

    const loadTeamData = async () => {
      const [membersResult, workItemsResult, currentIterationResult] = await Promise.allSettled([
        adoQueryEngine.getTeamMembers(selectedTeam, abortController.signal, {
          forceRefresh,
        }),
        adoQueryEngine.getWorkItemsForCurrentAndNextIteration(selectedTeam, abortController.signal, {
          forceRefresh,
        }),
        adoQueryEngine.getCurrentIterationInfo(selectedTeam, abortController.signal, {
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

      if (currentIterationResult.status === 'fulfilled') {
        setCurrentIteration(currentIterationResult.value)
      } else if (!isAbortError(currentIterationResult.reason)) {
        setCurrentIteration(null)
      }

      setMembersLoading(false)
      setWorkItemsLoading(false)
    }

    loadTeamData().catch((error: unknown) => {
      if (abortController.signal.aborted || isAbortError(error)) {
        return
      }

      setMembers([])
      setWorkItems([])
      setCurrentIteration(null)
      setMembersError(toErrorMessage(error, 'Unknown error while loading team data.'))
      setWorkItemsError(toErrorMessage(error, 'Unknown error while loading team data.'))
      setMembersLoading(false)
      setWorkItemsLoading(false)
    })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, selectedTeam, reloadNonce, forceRefreshRef])

  return {
    members,
    membersLoading,
    membersError,
    workItems,
    workItemsLoading,
    workItemsError,
    currentIteration,
  }
}
