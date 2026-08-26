export function parseIsoDate(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

export function getPullRequestIconUrl(iconMap: Record<string, string>): string | undefined {
  const direct = iconMap['icon_pull_request']
  if (direct) {
    return direct
  }

  for (const [iconId, iconUrl] of Object.entries(iconMap)) {
    const normalized = iconId.trim().toLowerCase()
    if (normalized.includes('pull') && normalized.includes('request')) {
      return iconUrl
    }
  }

  return undefined
}

export type PullRequestArtifactRef = {
  repositoryId: string
  pullRequestId: number
}

const PULL_REQUEST_ARTIFACT_PREFIX = 'vstfs:///Git/PullRequestId/'

/** Parses a work item/update `ArtifactLink` relation URL into its repo + PR id, if it's a PR link. */
export function parsePullRequestArtifactLink(url: string): PullRequestArtifactRef | null {
  const markerIndex = url.indexOf(PULL_REQUEST_ARTIFACT_PREFIX)
  if (markerIndex === -1) {
    return null
  }

  const encodedPayload = url.slice(markerIndex + PULL_REQUEST_ARTIFACT_PREFIX.length)
  const decodedPayload = decodeURIComponent(encodedPayload)
  const segments = decodedPayload.split('/').filter(Boolean)

  if (segments.length < 3) {
    return null
  }

  const repositoryId = segments[1]
  const pullRequestId = Number(segments[2])

  if (!repositoryId || !Number.isFinite(pullRequestId)) {
    return null
  }

  return {
    repositoryId,
    pullRequestId,
  }
}
