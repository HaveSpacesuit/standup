const TRIAGE_NOT_DUPLICATES_STORAGE_KEY_PREFIX = 'standup:triage-not-duplicates'

/** The most pairs kept for a team; the oldest are forgotten first. */
export const MAX_TRIAGE_NOT_DUPLICATES = 500

export function triageNotDuplicatesStorageKey(teamId: string): string {
  return `${TRIAGE_NOT_DUPLICATES_STORAGE_KEY_PREFIX}:${teamId}`
}

/** The pairs of items marked "Not a duplicate" for the team, as triagePairKey keys, oldest first. */
export function loadTriageNotDuplicates(teamId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(triageNotDuplicatesStorageKey(teamId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((pair): pair is string => typeof pair === 'string' && /^\d+:\d+$/.test(pair)) : []
  } catch {
    return []
  }
}

/**
 * Adds a pair and saves the team's list, returning it so the page updates even when storage is unavailable or full; the
 * pair is then only remembered until the page reloads.
 */
export function addTriageNotDuplicate(teamId: string, pairs: readonly string[], pair: string): string[] {
  const next = [...pairs.filter((entry) => entry !== pair), pair].slice(-MAX_TRIAGE_NOT_DUPLICATES)
  try {
    localStorage.setItem(triageNotDuplicatesStorageKey(teamId), JSON.stringify(next))
  } catch {
    // Kept for this session only.
  }
  return next
}
