export type TriageOptions = {
  tags: string[]
  includeNewBugs: boolean
  excludedIterationPaths: string[]
}

export function createDefaultTriageOptions(): TriageOptions {
  return { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [] }
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
  if (tags.some((tag) => /[;\r\n]/.test(tag))) {
    throw new Error('Enter each Triage tag separately, without semicolons.')
  }
  if (candidate.includeNewBugs !== undefined && typeof candidate.includeNewBugs !== 'boolean') {
    throw new Error('Triage includeNewBugs must be true or false.')
  }
  return {
    tags,
    includeNewBugs: candidate.includeNewBugs ?? defaults.includeNewBugs,
    excludedIterationPaths: readList(
      candidate.excludedIterationPaths === undefined ? [] : candidate.excludedIterationPaths,
      'excluded iteration paths',
      (path) => path.replace(/\\+$/, ''),
    ),
  }
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

export function hasTriageRules(options: TriageOptions): boolean {
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
export function getActiveTriageOptions(options: TriageOptions): TriageOptions {
  return options.includeNewBugs || options.excludedIterationPaths.length === 0
    ? options
    : { ...options, excludedIterationPaths: [] }
}
