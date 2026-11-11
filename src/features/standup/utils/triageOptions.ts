export const TRIAGE_CHECKS = ['severity', 'impact', 'effort', 'reproSteps', 'acceptanceCriteria', 'description'] as const
export type TriageCheck = (typeof TRIAGE_CHECKS)[number]
export const TRIAGE_CHECK_LABELS: Record<TriageCheck, string> = {
  severity: 'Severity',
  impact: 'Impact',
  effort: 'Effort',
  reproSteps: 'Repro steps',
  acceptanceCriteria: 'Acceptance criteria',
  description: 'Description',
}

/** The fields an item must have filled in before it counts as ready to clear: one list for bugs, one for other types. */
export type TriageReadinessChecks = { bug: TriageCheck[]; other: TriageCheck[] }

/** Where Similar items looks for possible duplicates beyond the queue itself, which is always compared. */
export type TriageSimilarOptions = {
  /** The team's open bugs, as on the Backlog page. */
  openBugs: boolean
  /** Bugs closed in the last `closedDays` days, as possible regressions. */
  closedBugs: boolean
  closedDays: number
}

export type TriageOptions = {
  tags: string[]
  includeNewBugs: boolean
  excludedIterationPaths: string[]
  /** Working days an item can wait in triage before its age is flagged. */
  ageFlagDays: number
  readinessChecks: TriageReadinessChecks
  /** Tags that mean the item is waiting on someone else, such as QA; the Inbox groups these items apart. */
  waitingTags: string[]
  similarItems: TriageSimilarOptions
}

/** The options that decide which items the queue holds; the rest only change how they are shown. */
export type TriageQueryOptions = Pick<TriageOptions, 'tags' | 'includeNewBugs' | 'excludedIterationPaths'>

export const DEFAULT_TRIAGE_AGE_FLAG_DAYS = 2
export const MAX_TRIAGE_AGE_FLAG_DAYS = 30
export const DEFAULT_TRIAGE_CLOSED_DAYS = 180
export const MAX_TRIAGE_CLOSED_DAYS = 365

export function createDefaultTriageReadinessChecks(): TriageReadinessChecks {
  return { bug: ['severity', 'impact', 'effort', 'reproSteps'], other: ['effort', 'acceptanceCriteria'] }
}

export function createDefaultTriageOptions(): TriageOptions {
  return {
    tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: DEFAULT_TRIAGE_AGE_FLAG_DAYS,
    readinessChecks: createDefaultTriageReadinessChecks(), waitingTags: ['Needs Info'],
    similarItems: { openBugs: true, closedBugs: true, closedDays: DEFAULT_TRIAGE_CLOSED_DAYS },
  }
}

export function triageOptionsStorageKey(teamId: string): string {
  return `standup:triage-options:${teamId}`
}

function readList(value: unknown, label: string, normalize = (entry: string) => entry): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Triage ${label} must be a list of strings.`)
  }
  const entries = new Map<string, string>()
  for (const entry of value) {
    const text = normalize(entry.trim())
    if (entry.trim() && !text) throw new Error(`Triage ${label} must not contain empty paths.`)
    if (text) entries.set(text.toLowerCase(), text)
  }
  return [...entries.values()].sort((a, b) => a.localeCompare(b))
}

export function parseTriageOptions(value: unknown): TriageOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Triage options must be an object.')
  }
  const candidate = value as Record<string, unknown>
  const defaults = createDefaultTriageOptions()
  const tags = readList(candidate.tags === undefined ? defaults.tags : candidate.tags, 'tags')
  const waitingTags = readList(candidate.waitingTags === undefined ? defaults.waitingTags : candidate.waitingTags, 'waiting tags')
  if ([...tags, ...waitingTags].some((tag) => /[;\r\n]/.test(tag))) {
    throw new Error('Enter each Triage tag separately, without semicolons.')
  }
  if (candidate.includeNewBugs !== undefined && typeof candidate.includeNewBugs !== 'boolean') {
    throw new Error('Triage includeNewBugs must be true or false.')
  }
  const ageFlagDays = candidate.ageFlagDays === undefined ? defaults.ageFlagDays : candidate.ageFlagDays
  if (typeof ageFlagDays !== 'number' || !Number.isInteger(ageFlagDays) || ageFlagDays < 1 || ageFlagDays > MAX_TRIAGE_AGE_FLAG_DAYS) {
    throw new Error(`Triage age flag must be a whole number of working days from 1 to ${MAX_TRIAGE_AGE_FLAG_DAYS}.`)
  }
  return {
    tags,
    includeNewBugs: candidate.includeNewBugs ?? defaults.includeNewBugs,
    excludedIterationPaths: readList(
      candidate.excludedIterationPaths === undefined ? [] : candidate.excludedIterationPaths,
      'excluded iteration paths',
      (path) => path.replace(/\\+$/, ''),
    ),
    ageFlagDays,
    readinessChecks: candidate.readinessChecks === undefined ? defaults.readinessChecks : readReadinessChecks(candidate.readinessChecks),
    waitingTags,
    similarItems: candidate.similarItems === undefined ? defaults.similarItems : readSimilarOptions(candidate.similarItems, defaults.similarItems),
  }
}

function readSimilarOptions(value: unknown, defaults: TriageSimilarOptions): TriageSimilarOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Triage similar items must be an object with openBugs, closedBugs and closedDays.')
  }
  const { openBugs = defaults.openBugs, closedBugs = defaults.closedBugs, closedDays = defaults.closedDays } = value as Record<string, unknown>
  if (typeof openBugs !== 'boolean' || typeof closedBugs !== 'boolean') {
    throw new Error('Triage similar items openBugs and closedBugs must be true or false.')
  }
  if (typeof closedDays !== 'number' || !Number.isInteger(closedDays) || closedDays < 1 || closedDays > MAX_TRIAGE_CLOSED_DAYS) {
    throw new Error(`Triage similar items must look back a whole number of days from 1 to ${MAX_TRIAGE_CLOSED_DAYS}.`)
  }
  return { openBugs, closedBugs, closedDays }
}

function readReadinessChecks(value: unknown): TriageReadinessChecks {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Triage readiness checks must be an object with bug and other lists.')
  }
  const lists = value as Record<string, unknown>
  const read = (list: unknown): TriageCheck[] => {
    if (!Array.isArray(list) || list.some((check) => !TRIAGE_CHECKS.includes(check))) {
      throw new Error(`Triage readiness checks must be lists of: ${TRIAGE_CHECKS.join(', ')}.`)
    }
    // Kept in one order, so the checks read the same on every item whichever order they were picked in.
    return TRIAGE_CHECKS.filter((check) => list.includes(check))
  }
  return { bug: read(lists.bug), other: read(lists.other) }
}

export type TriageSettings = { options: TriageOptions; error: string | null }

export function loadTriageSettings(teamId: string): TriageSettings {
  try {
    const stored = localStorage.getItem(triageOptionsStorageKey(teamId))
    return { options: stored === null ? createDefaultTriageOptions() : parseTriageOptions(JSON.parse(stored)), error: null }
  } catch (cause) {
    return {
      options: createDefaultTriageOptions(),
      error: `Unable to read Triage options. Saved data has been kept. Open Triage options to replace it. ${cause instanceof Error ? cause.message : String(cause)}`,
    }
  }
}

export function hasTriageRules(options: TriageQueryOptions): boolean {
  return options.tags.length > 0 || options.includeNewBugs
}

/**
 * Appends the tags typed in an editor draft, split on Azure DevOps' `;` tag separator.
 * A case-insensitive duplicate keeps the spelling already in the list.
 */
export function addTriageTags(tags: readonly string[], draft: string): string[] {
  const next = [...tags]
  const seen = new Set(tags.map((tag) => tag.toLowerCase()))
  for (const tag of draft.split(/[;\r\n]/).map((entry) => entry.trim()).filter(Boolean)) {
    if (seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    next.push(tag)
  }
  return next
}

/**
 * The options a query uses: excluded iteration paths apply only to the new-bug rule, so they are dropped while it is off.
 * The saved options keep them, so turning new bugs back on restores them.
 */
export function getActiveTriageOptions<T extends TriageQueryOptions>(options: T): T {
  return options.includeNewBugs || options.excludedIterationPaths.length === 0
    ? options
    : { ...options, excludedIterationPaths: [] }
}

/** Just the active options that pick the queue's items, so changing how they are shown does not reload them. */
export function getTriageQueryOptions(options: TriageQueryOptions): TriageQueryOptions {
  const { tags, includeNewBugs, excludedIterationPaths } = getActiveTriageOptions(options)
  return { tags, includeNewBugs, excludedIterationPaths }
}
