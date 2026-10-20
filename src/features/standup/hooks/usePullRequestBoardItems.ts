import { useEffect, useState } from 'react'
import type { AdoQueryEngine, CurrentIterationInfo, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { isAbortError, toErrorMessage } from './queryErrors'

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
  pullRequestBoardItemsError: string | null
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
  const [pullRequestBoardItemsError, setPullRequestBoardItemsError] = useState<string | null>(null)

  useEffect(() => {
    if (!adoQueryEngine || membersLoading || workItemsLoading) {
      setPullRequestBoardItems([])
      setPullRequestBoardItemsLoading(false)
      setPullRequestBoardItemsError(null)
      return
    }

    if (membersError || workItemsError || members.length === 0) {
      setPullRequestBoardItems([])
      setPullRequestBoardItemsLoading(false)
      setPullRequestBoardItemsError(null)
      return
    }

    const abortController = new AbortController()
    setPullRequestBoardItems([])
    setPullRequestBoardItemsLoading(true)
    setPullRequestBoardItemsError(null)

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
          setPullRequestBoardItemsError(toErrorMessage(error, 'Unable to load pull request data.'))
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
    pullRequestBoardItemsError,
  }
}
