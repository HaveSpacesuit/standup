import { useEffect, useRef, useState } from 'react'
import type {
  AdoQueryEngine,
  ResolvedWorkItemAssignee,
  TeamMember,
  WorkItemSummary,
} from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { mapWithConcurrency } from '../../../ado/concurrency'
import { isSameData } from '../utils/sameData'
import { isAbortError, toErrorMessage } from './queryErrors'

const ASSIGNEE_RESOLUTION_CONCURRENCY = 8

type UseWorkItemAssigneesArgs = {
  adoQueryEngine: AdoQueryEngine | null
  team: Pick<TeamProfile, 'orgName' | 'projectName'>
  members: TeamMember[]
  membersLoading: boolean
  membersError: string | null
  workItems: WorkItemSummary[]
  workItemsLoading: boolean
  workItemsError: string | null
}

type UseWorkItemAssigneesResult = {
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
  assigneesLoading: boolean
  assigneesError: string | null
  assigneesHistoryWarning: string | null
  retryAssigneeHistory: () => void
}

export function useWorkItemAssignees({
  adoQueryEngine,
  team,
  members,
  membersLoading,
  membersError,
  workItems,
  workItemsLoading,
  workItemsError,
}: UseWorkItemAssigneesArgs): UseWorkItemAssigneesResult {
  const [workItemAssignees, setWorkItemAssignees] = useState<Record<number, ResolvedWorkItemAssignee>>({})
  const [assigneesLoading, setAssigneesLoading] = useState(false)
  const [assigneesError, setAssigneesError] = useState<string | null>(null)
  const [historyRetryNonce, setHistoryRetryNonce] = useState(0)
  const historyRetryInProgress = useRef(false)
  // The cards the shown assignees cover, kept until the board reloads. A card edited in place, such as by Quick assign, or
  // one a tag rule hides and reveals again, re-resolves without blanking the board; only an unseen card shows loading.
  const resolvedItemIds = useRef(new Set<number>())

  useEffect(() => {
    if (!adoQueryEngine) {
      historyRetryInProgress.current = false
      resolvedItemIds.current = new Set()
      setWorkItemAssignees({})
      setAssigneesLoading(false)
      setAssigneesError(null)
      return
    }

    if (membersLoading || workItemsLoading) {
      historyRetryInProgress.current = false
      resolvedItemIds.current = new Set()
      setWorkItemAssignees({})
      setAssigneesLoading(false)
      setAssigneesError(null)
      return
    }

    if (membersError || workItemsError) {
      historyRetryInProgress.current = false
      resolvedItemIds.current = new Set()
      setWorkItemAssignees({})
      setAssigneesLoading(false)
      setAssigneesError(null)
      return
    }

    if (workItems.length === 0) {
      historyRetryInProgress.current = false
      setAssigneesLoading(false)
      setAssigneesError(null)
      return
    }

    const abortController = new AbortController()

    const memberLookup = members.reduce<Record<string, string>>((lookup, member) => {
      const canonical = member.displayName
      if (member.uniqueName) {
        lookup[member.uniqueName.toLowerCase()] = canonical
      }
      lookup[member.displayName.toLowerCase()] = canonical
      return lookup
    }, {})

    if (!historyRetryInProgress.current && workItems.some((item) => !resolvedItemIds.current.has(item.id))) {
      setAssigneesLoading(true)
    }
    setAssigneesError(null)

    mapWithConcurrency(
      workItems,
      ASSIGNEE_RESOLUTION_CONCURRENCY,
      async (item) => ({
        id: item.id,
        assignee: await adoQueryEngine.resolveWorkItemAssignee(
          team,
          memberLookup,
          item,
          abortController.signal,
        ),
      }),
    )
      .then((resolved) => {
        if (abortController.signal.aborted) {
          return
        }

        const mapped = resolved.reduce<Record<number, ResolvedWorkItemAssignee>>((acc, item) => {
          acc[item.id] = item.assignee
          resolvedItemIds.current.add(item.id)
          return acc
        }, {})

        // Equal assignees keep the shown map, so a tag rule that hides or reveals cards doesn't re-render the board again.
        setWorkItemAssignees((current) => (resolved.every((item) => isSameData(current[item.id], item.assignee, 2))
          ? current
          : { ...current, ...mapped }))
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted || isAbortError(error)) {
          return
        }

        resolvedItemIds.current = new Set()
        setWorkItemAssignees({})
        setAssigneesError(
          toErrorMessage(error, 'Unknown error while resolving work item assignees.'),
        )
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setAssigneesLoading(false)
          historyRetryInProgress.current = false
        }
      })

    return () => {
      abortController.abort()
    }
  }, [
    adoQueryEngine,
    members,
    membersError,
    membersLoading,
    team,
    workItems,
    workItemsError,
    workItemsLoading,
    historyRetryNonce,
  ])

  // Assignees of hidden cards stay resolved for when they return, so only the shown cards count.
  const unavailableCount = workItems
    .filter((item) => workItemAssignees[item.id]?.kind === 'history-unavailable').length

  return {
    workItemAssignees,
    assigneesLoading,
    assigneesError,
    assigneesHistoryWarning: unavailableCount > 0
      ? `Work-item history is unavailable for ${unavailableCount} item${unavailableCount === 1 ? '' : 's'}, so the team assignee could not be verified. These cards remain visible under Assignee unavailable; no historical assignment is inferred.`
      : null,
    retryAssigneeHistory: () => {
      historyRetryInProgress.current = true
      setHistoryRetryNonce((current) => current + 1)
    },
  }
}
