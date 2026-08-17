import type { TeamProfile } from '../teamProfiles'
import type { AdoRequestClient } from './httpClient'

type PullRequestThreadListResponse = {
  value?: PullRequestThreadApiResponse[]
}

type PullRequestThreadApiResponse = {
  publishedDate?: string
  properties?: {
    CodeReviewThreadType?: {
      $value?: string
    }
  }
  comments?: Array<{
    publishedDate?: string
    content?: string
  }>
}

function parseIsoDate(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

export function resolveLastReadyForReviewAtFromThreads(threads: PullRequestThreadApiResponse[]): string | undefined {
  const readyForReviewEvents: string[] = []

  for (const thread of threads) {
    const threadType = thread.properties?.CodeReviewThreadType?.$value?.trim()
    if (threadType !== 'IsDraftUpdate') {
      continue
    }

    for (const comment of thread.comments ?? []) {
      const content = comment.content?.trim()
      if (!content) {
        continue
      }

      if (/published the pull request\.?$/i.test(content)) {
        const eventDate = comment.publishedDate ?? thread.publishedDate
        if (eventDate) {
          readyForReviewEvents.push(eventDate)
        }
      }
    }
  }

  if (readyForReviewEvents.length === 0) {
    return undefined
  }

  return readyForReviewEvents
    .sort((left, right) => {
      const leftAt = parseIsoDate(left) ?? Number.NEGATIVE_INFINITY
      const rightAt = parseIsoDate(right) ?? Number.NEGATIVE_INFINITY
      return leftAt - rightAt
    })
    .at(-1)
}

export async function fetchPullRequestReadyForReviewAt(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  repositoryId: string | undefined,
  pullRequestId: number,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (!repositoryId) {
    return undefined
  }

  try {
    const response = await client.request<PullRequestThreadListResponse>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/pullRequests/${pullRequestId}/threads`,
      params: {
        'api-version': '7.1',
      },
      signal,
    })

    return resolveLastReadyForReviewAtFromThreads(response.value ?? [])
  } catch {
    return undefined
  }
}
