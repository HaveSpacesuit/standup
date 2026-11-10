import type { TriageItem } from '../../../ado/types'
import { TRIAGE_CHECK_LABELS, type TriageCheck, type TriageReadinessChecks } from './triageOptions'

/** The prefix `getTriageReasons` gives a matching tag's reason, as in "Tag: Triage". */
const TAG_REASON_PREFIX = 'Tag: '
export const NEW_BUG_REASON = 'New bug'

export type TriageReason = { kind: 'tag'; tag: string; label: string } | { kind: 'new-bug'; label: string }

/** Why the item is listed, one entry per rule it meets: each Triage tag it has ("Triage tag"), then "New bug". */
export function getTriageReasonDetails(item: Pick<TriageItem, 'reasons'>): TriageReason[] {
  return item.reasons.flatMap((reason): TriageReason[] => {
    if (reason.startsWith(TAG_REASON_PREFIX)) {
      const tag = reason.slice(TAG_REASON_PREFIX.length)
      return [{ kind: 'tag', tag, label: `${tag} tag` }]
    }
    return reason === NEW_BUG_REASON ? [{ kind: 'new-bug', label: NEW_BUG_REASON }] : []
  })
}

const isBug = (item: Pick<TriageItem, 'workItemType'>) => item.workItemType.toLowerCase() === 'bug'

/** The readiness checks for the item's type: the bug list for bugs, the other list for every other type. */
export function getTriageChecksFor(item: Pick<TriageItem, 'workItemType'>, checks: TriageReadinessChecks): TriageCheck[] {
  return isBug(item) ? checks.bug : checks.other
}

function isFilled(item: TriageItem, check: TriageCheck): boolean {
  switch (check) {
    case 'severity': return item.severity !== undefined
    case 'impact': return item.priority !== undefined
    case 'effort': return item.effort !== undefined
    default: return item.filledText?.[check] === true
  }
}

export type TriageReadiness = {
  checks: Array<{ check: TriageCheck; label: string; filled: boolean }>
  /** The labels of the checks still empty, in the checks' order. */
  missing: string[]
  /** Every check for the item's type passes; true when its type has none. */
  ready: boolean
}

export function getTriageReadiness(item: TriageItem, checks: TriageReadinessChecks): TriageReadiness {
  const results = getTriageChecksFor(item, checks).map((check) => ({ check, label: TRIAGE_CHECK_LABELS[check], filled: isFilled(item, check) }))
  const missing = results.filter((result) => !result.filled).map((result) => result.label)
  return { checks: results, missing, ready: missing.length === 0 }
}

export const hasTriageChecks = (checks: TriageReadinessChecks) => checks.bug.length > 0 || checks.other.length > 0

const quote = (text: string) => `“${text}”`
const AND_LIST = new Intl.ListFormat('en', { type: 'conjunction' })
const OR_LIST = new Intl.ListFormat('en', { type: 'disjunction' })

/**
 * What takes the item off the queue, from the rules it meets: removing each matched tag, and for a new bug, moving it
 * out of its first state or into an excluded iteration path. An item that meets both rules leaves once neither applies.
 * Completing or removing the item also clears it, but that is not a triage outcome, so it is not named.
 */
export function describeTriageClearing(item: Pick<TriageItem, 'reasons' | 'state'>, excludedIterationPaths: readonly string[]): string {
  const reasons = getTriageReasonDetails(item)
  const tags = reasons.flatMap((reason) => reason.kind === 'tag' ? [quote(reason.tag)] : [])
  const parts: string[] = []
  if (tags.length) parts.push(`remove the ${AND_LIST.format(tags)} ${tags.length === 1 ? 'tag' : 'tags'}`)
  if (reasons.some((reason) => reason.kind === 'new-bug')) {
    const iterations = excludedIterationPaths.map((path) => quote(path.split('\\').filter(Boolean).at(-1) ?? path))
    parts.push(`move it out of ${item.state}${iterations.length ? ` or into ${OR_LIST.format(iterations)}` : ''}`)
  }
  return parts.length ? `Clears when you ${parts.join(' and ')}.` : ''
}
