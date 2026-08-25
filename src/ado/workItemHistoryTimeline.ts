import type { WorkItemUpdate } from './types'

/** Parses an ISO date string, returning null if missing or unparseable. */
export function toTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/** A timestamp is only usable if it parses and isn't in the future (clock skew, bad data, etc). */
export function isUsableHistoryTimestamp(value: string | undefined, now = Date.now()): value is string {
  const timestamp = toTimestamp(value)
  return timestamp !== null && timestamp <= now
}

/** Resolves the effective timestamp of a work item revision, preferring the changed-date field
 * over the revision's own `revisedDate` (falling back to it if the field is missing or unusable). */
export function resolveUpdateTimestamp(update: WorkItemUpdate, now = Date.now()): string | undefined {
  const fieldChangedDate = update.fields?.['System.ChangedDate']?.newValue
  const changedDateValue = typeof fieldChangedDate === 'string' ? fieldChangedDate : undefined

  if (isUsableHistoryTimestamp(changedDateValue, now)) {
    return changedDateValue
  }

  return isUsableHistoryTimestamp(update.revisedDate, now) ? update.revisedDate : undefined
}
