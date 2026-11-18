import { useEffect, useRef, useState } from 'react'
import type { AdoQueryEngine, CurrentIterationInfo, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import { applyPullRequestPatch } from '../../../ado/workItemPatch'
import type { TeamProfile } from '../../../appSettings'
import { isAbortError, toErrorMessage } from './queryErrors'
import { usePullRequestPatches } from './useWorkItemPatches'

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
  // The request the shown cards answer. A card edited in place, such as by Quick assign, repeats it without blanking the board.
  const shownRequest = useRef<string | null>(null)

  useEffect(() => {
    if (!adoQueryEngine || membersLoading || workItemsLoading) {
      shownRequest.current = null
      setPullRequestBoardItems([])
      setPullRequestBoardItemsLoading(false)
      setPullRequestBoardItemsError(null)
      return
    }

    if (membersError || workItemsError || members.length === 0) {
      shownRequest.current = null
      setPullRequestBoardItems([])
      setPullRequestBoardItemsLoading(false)
      setPullRequestBoardItemsError(null)
      return
    }

    const abortController = new AbortController()
    const request = JSON.stringify([
      selectedTeam.id, selectedTeam.orgName, selectedTeam.projectName, selectedTeam.repoName,
      currentIteration?.startDate, currentIteration?.finishDate, workItems.map((item) => item.id),
    ])
    if (shownRequest.current !== request) {
      shownRequest.current = null
      setPullRequestBoardItems([])
      setPullRequestBoardItemsLoading(true)
    }
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
          shownRequest.current = request
          setPullRequestBoardItems(items)
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted && !isAbortError(error)) {
          shownRequest.current = null
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

  // A card reloaded on its own changes in place, or leaves once it's abandoned or a draft again.
  usePullRequestPatches(adoQueryEngine, (patch) => setPullRequestBoardItems((current) => applyPullRequestPatch(current, patch)))

  return {
    pullRequestBoardItems,
    pullRequestBoardItemsLoading,
    pullRequestBoardItemsError,
  }
}
