import type { IdentityRef } from '../../../ado/identity'
import type { BacklogBug, ClosedBug, TriageItem } from '../../../ado/types'

export type TriageMatchKind = 'queue' | 'open' | 'closed'

/** What a triage item's title is compared with: another item in the queue, an open bug, or a recently closed bug. */
export type TriageMatchCandidate = {
  kind: TriageMatchKind
  id: number
  title: string
  workItemType: string
  workItemIconUrl?: string
  state?: string
  iterationPath?: string
  assignedTo?: IdentityRef
  createdAt?: string
  createdBy?: IdentityRef
  /** When a closed bug was closed. */
  closedAt?: string
  severity?: string
  priority?: number
  effort?: number
  workItemUrl: string
}

/** A triage item's closest title match. */
export type TriageMatch = {
  candidate: TriageMatchCandidate
  /** How alike the two titles are, from 0 to 1, with rare words counting most. */
  score: number
  /** The word stems both titles share, rarest first. */
  stems: string[]
}

/** Titles at least this alike are matched; below it, the shared words are mostly the product's everyday vocabulary. */
export const TRIAGE_MATCH_MIN_SCORE = 0.5
const MIN_SHARED_STEMS = 2
const KIND_ORDER: Record<TriageMatchKind, number> = { queue: 0, open: 1, closed: 2 }

const STOP_WORDS = new Set(`a about above after again against all also am an and any are aren as at be been before being
below between both but by can cannot could couldn did didn do does doesn doing don down during each else etc few for from
further get gets got had hadn has hasn have haven having he her here hers him his how i if in into is isn it its itself
just me more most my no nor not now of off on once only or other our ours out over own same she should shouldn so some
such than that the their theirs them then there these they this those through to too under until up upon us very via vs
was wasn we were weren what when where which while who whom why will with within without won would wouldn you your
yours`.split(/\s+/))

const WORD = /[\p{L}\p{N}]+/gu
const DOUBLED_ENDING = /([b-df-hj-km-np-rtv-z])\1$/

/**
 * A light English stem, so that "crashes", "crashed" and "crashing" all read as "crash", and "rename" as "renaming".
 * Words with digits, such as "3D" or "E2E", are kept whole.
 */
export function stemWord(word: string): string {
  let stem = word.toLowerCase()
  if (stem.length <= 3 || /\d/.test(stem)) return stem
  if (stem.endsWith('ies') && stem.length > 4) stem = `${stem.slice(0, -3)}y`
  else if (stem.endsWith('sses')) stem = stem.slice(0, -2)
  else if (stem.endsWith('s') && !/(ss|us|is)$/.test(stem)) stem = stem.slice(0, -1)
  for (const suffix of ['ing', 'ed']) {
    if (stem.endsWith(suffix) && stem.length - suffix.length >= 3) {
      stem = stem.slice(0, -suffix.length)
      if (DOUBLED_ENDING.test(stem)) stem = stem.slice(0, -1)
      break
    }
  }
  return stem.endsWith('e') && stem.length > 3 ? stem.slice(0, -1) : stem
}

/** The stem a title word is compared by, or '' for a word too short or too common to tell titles apart. */
function stemOf(word: string): string {
  const lower = word.toLowerCase()
  return lower.length < 2 || STOP_WORDS.has(lower) ? '' : stemWord(lower)
}

/** The distinct stems of a title's words, leaving out common words such as "the" and "when". */
export function getTitleStems(title: string): string[] {
  const stems = new Set<string>()
  for (const word of title.match(WORD) ?? []) {
    const stem = stemOf(word)
    if (stem) stems.add(stem)
  }
  return [...stems]
}

/** A triage item as one side of a comparison. */
export function toTriageMatchCandidate(item: TriageItem): TriageMatchCandidate {
  return {
    kind: 'queue', id: item.id, title: item.title, workItemType: item.workItemType, workItemIconUrl: item.workItemIconUrl,
    state: item.state, iterationPath: item.iterationPath, assignedTo: item.assignedTo, createdAt: item.createdAt,
    createdBy: item.createdBy, severity: item.severity, priority: item.priority, effort: item.effort, workItemUrl: item.workItemUrl,
  }
}

function fromBug(
  bug: BacklogBug & Partial<Pick<ClosedBug, 'closedAt'>>,
  kind: 'open' | 'closed',
  workItemIconUrl: string | undefined,
): TriageMatchCandidate {
  return {
    kind, id: bug.id, title: bug.title, workItemType: 'Bug', workItemIconUrl, state: bug.state, iterationPath: bug.iterationPath,
    assignedTo: bug.assignedTo, createdAt: bug.createdAt, closedAt: bug.closedAt, severity: bug.severity,
    priority: bug.priority, effort: bug.effort, workItemUrl: bug.workItemUrl,
  }
}

/** Every title the queue is compared with: the queue itself, then the open and closed bugs that are not in it. */
export function collectTriageMatchCandidates(
  queue: readonly TriageItem[],
  openBugs: readonly BacklogBug[],
  closedBugs: readonly ClosedBug[],
): TriageMatchCandidate[] {
  const seen = new Set<number>()
  // The bug lists carry no type icon, so they borrow a queued bug's when there is one.
  const bugIconUrl = queue.find((item) => item.workItemType === 'Bug' && item.workItemIconUrl)?.workItemIconUrl
  return [
    ...queue.map(toTriageMatchCandidate),
    ...openBugs.map((bug) => fromBug(bug, 'open', bugIconUrl)),
    ...closedBugs.map((bug) => fromBug(bug, 'closed', bugIconUrl)),
  ].filter((candidate) => !seen.has(candidate.id) && Boolean(seen.add(candidate.id)))
}

/** The same key for a pair of items whichever way round they are named, for remembering "Not a duplicate". */
export function triagePairKey(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`
}

/**
 * Each queue item's closest match among `candidates`, which hold the queue too. Titles are compared by the cosine of their
 * word stems, each weighted by how rare it is across every title, so a shared "crash" counts for less than a shared
 * "watermark". A match needs two shared stems and a score of TRIAGE_MATCH_MIN_SCORE. Pairs marked as not duplicates are
 * skipped, so the next closest match shows instead.
 */
export function findTriageMatches(
  queue: readonly Pick<TriageItem, 'id' | 'title'>[],
  candidates: readonly TriageMatchCandidate[],
  notDuplicates: ReadonlySet<string> = new Set(),
): Map<number, TriageMatch> {
  const documents = candidates.map((candidate) => ({ candidate, stems: getTitleStems(candidate.title) }))
  const frequency = new Map<string, number>()
  const postings = new Map<string, number[]>()
  documents.forEach(({ stems }, index) => {
    for (const stem of stems) {
      frequency.set(stem, (frequency.get(stem) ?? 0) + 1)
      const list = postings.get(stem)
      if (list) list.push(index)
      else postings.set(stem, [index])
    }
  })
  const weight = (stem: string) => Math.log(1 + documents.length / (frequency.get(stem) ?? 1))
  const magnitude = (stems: readonly string[]) => Math.sqrt(stems.reduce((sum, stem) => sum + weight(stem) ** 2, 0))
  const magnitudes = documents.map(({ stems }) => magnitude(stems))

  const matches = new Map<number, TriageMatch>()
  for (const item of queue) {
    const stems = getTitleStems(item.title)
    const itemMagnitude = magnitude(stems)
    if (!itemMagnitude) continue
    const sharedByDocument = new Map<number, string[]>()
    for (const stem of stems) {
      for (const index of postings.get(stem) ?? []) {
        if (documents[index].candidate.id === item.id) continue
        const shared = sharedByDocument.get(index)
        if (shared) shared.push(stem)
        else sharedByDocument.set(index, [stem])
      }
    }

    let best: TriageMatch | undefined
    for (const [index, shared] of sharedByDocument) {
      const { candidate } = documents[index]
      if (shared.length < MIN_SHARED_STEMS || notDuplicates.has(triagePairKey(item.id, candidate.id))) continue
      const score = Math.min(shared.reduce((sum, stem) => sum + weight(stem) ** 2, 0) / (itemMagnitude * magnitudes[index]), 1)
      if (score < TRIAGE_MATCH_MIN_SCORE) continue
      const better = !best || score > best.score
        || (score === best.score && (KIND_ORDER[candidate.kind] - KIND_ORDER[best.candidate.kind] || candidate.id - best.candidate.id) < 0)
      if (better) best = { candidate, score, stems: [...shared].sort((left, right) => weight(right) - weight(left) || left.localeCompare(right)) }
    }
    if (best) matches.set(item.id, best)
  }
  return matches
}

/** A title in runs of text, marking each word whose stem is one of `stems`, to highlight what two titles share. */
export function splitTitleByStems(title: string, stems: readonly string[]): Array<{ text: string; shared: boolean }> {
  const shared = new Set(stems)
  // Splitting on a captured word pattern leaves the words at odd indexes, between the text around them.
  return title.split(/([\p{L}\p{N}]+)/u)
    .map((text, index) => ({ text, shared: index % 2 === 1 && shared.has(stemOf(text)) }))
    .filter((part) => part.text)
}

/** The words of `title` that the match shares, each once, as written in the title. */
export function getSharedTitleWords(title: string, stems: readonly string[]): string[] {
  const words = new Map<string, string>()
  for (const part of splitTitleByStems(title, stems)) {
    if (part.shared && !words.has(part.text.toLowerCase())) words.set(part.text.toLowerCase(), part.text)
  }
  return [...words.values()]
}

/** What a match is, ahead of its id. */
export const TRIAGE_MATCH_LEADS: Record<TriageMatchKind, string> = {
  queue: 'Also in triage:',
  open: 'Similar open bug',
  closed: 'Possible regression of',
}

/** "Possible regression of 2160021", "Also in triage: 2193540", or "Similar open bug 2178403". */
export function formatTriageMatchLead(match: TriageMatch): string {
  return `${TRIAGE_MATCH_LEADS[match.candidate.kind]} ${match.candidate.id}`
}

