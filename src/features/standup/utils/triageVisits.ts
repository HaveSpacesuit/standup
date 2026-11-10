const TRIAGE_VISIT_STORAGE_KEY_PREFIX = 'standup:triage-visit'

type StoredVisit = {
  /** The local day of the latest visit, as YYYY-MM-DD. */
  day: string
  /** When Triage was last open that day. */
  lastSeen: number
  /** The visit the day's "new" items are measured from: the last time Triage was open on an earlier day. */
  baseline: number | null
}

export function triageVisitStorageKey(teamId: string): string {
  return `${TRIAGE_VISIT_STORAGE_KEY_PREFIX}:${teamId}`
}

const dayKey = (time: number) => {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function readVisit(teamId: string): StoredVisit | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(triageVisitStorageKey(teamId)) ?? 'null')
    if (!parsed || typeof parsed !== 'object') return null
    const { day, lastSeen, baseline } = parsed as Record<string, unknown>
    if (typeof day !== 'string' || typeof lastSeen !== 'number' || (baseline !== null && typeof baseline !== 'number')) return null
    return { day, lastSeen, baseline }
  } catch {
    return null
  }
}

/**
 * Notes that the team's Triage page is open now and returns when the previous visit was, for the Inbox's "New since your
 * last visit". Visits count by day: every visit on the same day returns the same answer, the last time Triage was open on
 * an earlier day, so reloading or coming back later that day does not empty the group. Null on the first visit. Storage
 * that is unavailable or full only loses the grouping, never the page.
 */
export function recordTriageVisit(teamId: string, now = Date.now()): number | null {
  const stored = readVisit(teamId)
  const day = dayKey(now)
  const baseline = stored?.day === day ? stored.baseline : stored?.lastSeen ?? null
  try {
    localStorage.setItem(triageVisitStorageKey(teamId), JSON.stringify({ day, lastSeen: now, baseline } satisfies StoredVisit))
  } catch {
    // The next visit just measures from an older visit.
  }
  return baseline
}
