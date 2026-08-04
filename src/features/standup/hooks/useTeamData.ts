import { useEffect, useState, type MutableRefObject } from 'react'
import type { AdoQueryEngine, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
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

  useEffect(() => {
    if (!adoQueryEngine) {
      setMembers([])
      setMembersError(null)
      setMembersLoading(false)
      setWorkItems([])
      setWorkItemsError(null)
      setWorkItemsLoading(false)
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
      const [membersResult, workItemsResult] = await Promise.allSettled([
        adoQueryEngine.getTeamMembers(selectedTeam, abortController.signal),
        adoQueryEngine.getWorkItemsForCurrentAndNextIteration(selectedTeam, abortController.signal, {
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

      setMembersLoading(false)
      setWorkItemsLoading(false)
    }

    loadTeamData().catch((error: unknown) => {
      if (abortController.signal.aborted || isAbortError(error)) {
        return
      }

      setMembers([])
      setWorkItems([])
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
  }
}
