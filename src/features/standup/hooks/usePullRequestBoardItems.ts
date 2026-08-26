import { useEffect, useState } from 'react'
import type { AdoQueryEngine, CurrentIterationInfo, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { isAbortError } from './queryErrors'

type UsePullRequestBoardItemsArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'repoName'>
  currentIteration: CurrentIterationInfo | null
  members: TeamMember[]
  membersLoading: boolean
  membersError: string | null
  workItems: WorkItemSummary[]
  workItemsLoading: boolean
  workItemsError: string | null
}

type UsePullRequestBoardItemsResult = {
  pullRequestBoardItems: WorkItemSummary[]
  pullRequestBoardItemsLoading: boolean
}

export function usePullRequestBoardItems({
  adoQueryEngine,
  selectedTeam,
  currentIteration,
  members,
  membersLoading,
  membersError,
  workItems,
  workItemsLoading,
  workItemsError,
}: UsePullRequestBoardItemsArgs): UsePullRequestBoardItemsResult {
  const [pullRequestBoardItems, setPullRequestBoardItems] = useState<WorkItemSummary[]>([])
  const [pullRequestBoardItemsLoading, setPullRequestBoardItemsLoading] = useState(false)

  useEffect(() => {
    if (!adoQueryEngine || membersLoading || workItemsLoading) {
      setPullRequestBoardItems([])
      setPullRequestBoardItemsLoading(false)
      return
    }

    if (membersError || workItemsError || members.length === 0) {
      setPullRequestBoardItems([])
      setPullRequestBoardItemsLoading(false)
      return
    }

    const abortController = new AbortController()
    setPullRequestBoardItemsLoading(true)

    adoQueryEngine
      .getUnlinkedActivePullRequestItems(
        selectedTeam,
        members,
        workItems,
        currentIteration,
        abortController.signal,
      )
      .then((items) => {
        if (!abortController.signal.aborted) {
          setPullRequestBoardItems(items)
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted && !isAbortError(error)) {
          setPullRequestBoardItems([])
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setPullRequestBoardItemsLoading(false)
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, currentIteration, members, membersError, membersLoading, selectedTeam, workItems, workItemsError, workItemsLoading])

  return {
    pullRequestBoardItems,
    pullRequestBoardItemsLoading,
  }
}
