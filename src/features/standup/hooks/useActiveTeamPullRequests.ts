import { useEffect, useState } from 'react'
import type { AdoQueryEngine, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../teamProfiles'
import { isAbortError } from './queryErrors'

type UseActiveTeamPullRequestsArgs = {
  adoQueryEngine: AdoQueryEngine | null
  selectedTeam: Pick<TeamProfile, 'orgName' | 'projectName' | 'repoName'>
  members: TeamMember[]
  membersLoading: boolean
  membersError: string | null
}

type UseActiveTeamPullRequestsResult = {
  pullRequests: WorkItemSummary[]
  pullRequestsLoading: boolean
}

export function useActiveTeamPullRequests({
  adoQueryEngine,
  selectedTeam,
  members,
  membersLoading,
  membersError,
}: UseActiveTeamPullRequestsArgs): UseActiveTeamPullRequestsResult {
  const [pullRequests, setPullRequests] = useState<WorkItemSummary[]>([])
  const [pullRequestsLoading, setPullRequestsLoading] = useState(() => Boolean(adoQueryEngine))

  useEffect(() => {
    if (!adoQueryEngine) {
      setPullRequests([])
      setPullRequestsLoading(false)
      return
    }

    if (membersLoading) {
      setPullRequests([])
      setPullRequestsLoading(true)
      return
    }

    if (membersError || members.length === 0) {
      setPullRequests([])
      setPullRequestsLoading(false)
      return
    }

    const abortController = new AbortController()
    setPullRequestsLoading(true)

    adoQueryEngine
      .getActiveTeamPullRequestItems(selectedTeam, members, abortController.signal)
      .then((items) => {
        if (!abortController.signal.aborted) {
          setPullRequests(items)
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted && !isAbortError(error)) {
          setPullRequests([])
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setPullRequestsLoading(false)
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, members, membersError, membersLoading, selectedTeam])

  return {
    pullRequests,
    pullRequestsLoading,
  }
}
