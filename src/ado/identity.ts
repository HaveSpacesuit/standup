export type IdentityRef = {
  displayName?: string
  uniqueName?: string
  imageUrl?: string
}

export function parseAssignedTo(value: unknown): IdentityRef | undefined {
  if (!value) {
    return undefined
  }

  if (typeof value === 'object') {
    const candidate = value as { displayName?: unknown; uniqueName?: unknown; name?: unknown; imageUrl?: unknown }
    const displayName =
      typeof candidate.displayName === 'string'
        ? candidate.displayName
        : typeof candidate.name === 'string'
          ? candidate.name
          : undefined
    const uniqueName = typeof candidate.uniqueName === 'string' ? candidate.uniqueName : undefined
    const imageUrl = typeof candidate.imageUrl === 'string' ? candidate.imageUrl : undefined

    if (displayName || uniqueName) {
      return { displayName, uniqueName, imageUrl }
    }

    return undefined
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }

    const match = /^(.*)\s<([^>]+)>$/.exec(trimmed)
    if (match) {
      return {
        displayName: match[1]?.trim(),
        uniqueName: match[2]?.trim(),
      }
    }

    return { displayName: trimmed }
  }

  return undefined
}

export function toIdentityKeys(identity?: IdentityRef): string[] {
  if (!identity) {
    return []
  }

  const keys = [identity.uniqueName, identity.displayName]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.toLowerCase())

  return Array.from(new Set(keys))
}
