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
