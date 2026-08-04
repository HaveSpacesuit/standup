import { useEffect, useState } from 'react'
import type {
  AdoQueryEngine,
  ResolvedWorkItemAssignee,
  TeamMember,
  WorkItemSummary,
} from '../../../ado/queryEngine'
import { isAbortError, toErrorMessage } from './queryErrors'

type UseWorkItemAssigneesArgs = {
  adoQueryEngine: AdoQueryEngine | null
  orgName: string
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
}

export function useWorkItemAssignees({
  adoQueryEngine,
  orgName,
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

  useEffect(() => {
    if (!adoQueryEngine) {
      setWorkItemAssignees({})
      setAssigneesLoading(false)
      setAssigneesError(null)
      return
    }

    if (membersLoading || workItemsLoading) {
      setWorkItemAssignees({})
      setAssigneesLoading(false)
      setAssigneesError(null)
      return
    }

    if (membersError || workItemsError) {
      setWorkItemAssignees({})
      setAssigneesLoading(false)
      setAssigneesError(null)
      return
    }

    if (workItems.length === 0) {
      setWorkItemAssignees({})
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

    setAssigneesLoading(true)
    setAssigneesError(null)

    Promise.all(
      workItems.map(async (item) => ({
        id: item.id,
        assignee: await adoQueryEngine.resolveWorkItemAssignee(
          orgName,
          memberLookup,
          item,
          abortController.signal,
        ),
      })),
    )
      .then((resolved) => {
        if (abortController.signal.aborted) {
          return
        }

        const mapped = resolved.reduce<Record<number, ResolvedWorkItemAssignee>>((acc, item) => {
          acc[item.id] = item.assignee
          return acc
        }, {})

        setWorkItemAssignees(mapped)
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted || isAbortError(error)) {
          return
        }

        setWorkItemAssignees({})
        setAssigneesError(
          toErrorMessage(error, 'Unknown error while resolving work item assignees.'),
        )
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setAssigneesLoading(false)
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
    orgName,
    workItems,
    workItemsError,
    workItemsLoading,
  ])

  return {
    workItemAssignees,
    assigneesLoading,
    assigneesError,
  }
}
