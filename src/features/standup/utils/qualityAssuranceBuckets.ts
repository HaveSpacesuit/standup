import type { TeamProfile } from '../../../appSettings'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { QaStateGroupOverrides, QaTagGroups } from './qaOptions'
import { DEFAULT_QA_LOOKBACK_DAYS, DEFAULT_QA_TAG_GROUPS, normalizeQaLookbackDays } from './qaOptions'

export type QualityAssuranceBucketId = 'new' | 'needs-testing' | 'needs-development' | 'done'

export type QualityAssuranceBucket = {
  id: QualityAssuranceBucketId
  title: string
  items: WorkItemSummary[]
}

export type QualityAssuranceStateGroups = {
  testing: string[]
  development: string[]
  done: string[]
  new: string[]
}

export type QualityAssuranceProjectConfig = {
  lookbackDays: number
  stateGroups: QualityAssuranceStateGroups
  tagGroups: QaTagGroups
  /**
   * When true, the user has explicitly configured the "Newly added" states, so an item only
   * reaches that column via a new-group state or a new-group tag — the freshness catch-all for
   * unclassified ('other') states is disabled. When false (default), fresh unclassified items
   * still fall into "Newly added" as a sensible catch-all.
   */
  strictNewStates: boolean
}

type WorkItemFieldUpdate = {
  oldValue?: unknown
  newValue?: unknown
}

export type WorkItemUpdate = {
  revisedDate?: string
  fields?: Record<string, WorkItemFieldUpdate>
}

export type WorkItemUpdatesResponse = {
  value?: WorkItemUpdate[]
}

const DEFAULT_CONFIG: QualityAssuranceProjectConfig = {
  lookbackDays: DEFAULT_QA_LOOKBACK_DAYS,
  stateGroups: {
    testing: ['available for testing', 'ready for testing', 'aft'],
    development: ['committed', 'active', 'in progress'],
    done: ['done', 'closed', 'completed'],
    new: ['new', 'proposed'],
  },
  tagGroups: DEFAULT_QA_TAG_GROUPS,
  strictNewStates: false,
}

// Per-project default overrides. Empty by default — all projects use DEFAULT_CONFIG unless an
// entry is added here (keyed by lowercased project name). Users can also override per team via
// the QA options dialog. Kept as an extension seam for projects with non-standard workflow states.
const PROJECT_CONFIGS: Record<string, Partial<QualityAssuranceProjectConfig>> = {}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function toTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null
  }

  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

function resolveFreshnessTimestamp(
  candidateTimestamp: string | undefined,
  fallbackTimestamp: string | undefined,
  now = Date.now(),
): string | undefined {
  const candidateTime = toTimestamp(candidateTimestamp)
  if (candidateTime !== null && candidateTime <= now) {
    return candidateTimestamp
  }

  return fallbackTimestamp
}

function normalizeState(state: string | undefined): string {
  return normalizeText(state ?? '')
}

export function resolveQualityAssuranceProjectConfig(
  team: Pick<TeamProfile, 'id' | 'projectName'>,
  stateGroupOverrides?: QaStateGroupOverrides | null,
  tagGroupsOverride?: QaTagGroups | null,
  lookbackDaysOverride?: number | null,
): QualityAssuranceProjectConfig {
  const overrides = PROJECT_CONFIGS[normalizeText(team.projectName)]
  const lookbackDays = normalizeQaLookbackDays(lookbackDaysOverride ?? overrides?.lookbackDays ?? DEFAULT_QA_LOOKBACK_DAYS)
  const base: QualityAssuranceProjectConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    lookbackDays,
    stateGroups: {
      ...DEFAULT_CONFIG.stateGroups,
      ...overrides?.stateGroups,
    },
    // Tag groups: an explicit (non-null) override replaces the built-in default entirely, so
    // clearing a group (e.g. removing the default Triage tag) sticks instead of reverting.
    tagGroups: tagGroupsOverride ?? DEFAULT_QA_TAG_GROUPS,
  }

  if (!stateGroupOverrides) {
    return base
  }

  return {
    ...base,
    // The user explicitly configured the new-column states → route to "Newly added" only by those
    // states or a new-group tag (disables the unclassified-state freshness catch-all).
    strictNewStates: stateGroupOverrides.new.length > 0,
    stateGroups: {
      testing: stateGroupOverrides.testing.length > 0 ? stateGroupOverrides.testing : base.stateGroups.testing,
      development: stateGroupOverrides.development.length > 0 ? stateGroupOverrides.development : base.stateGroups.development,
      done: stateGroupOverrides.done.length > 0 ? stateGroupOverrides.done : base.stateGroups.done,
      new: stateGroupOverrides.new.length > 0 ? stateGroupOverrides.new : base.stateGroups.new,
    },
  }
}

function matchesStateGroup(state: string | undefined, candidates: string[]): boolean {
  const normalizedState = normalizeState(state)
  if (!normalizedState) {
    return false
  }

  return candidates.some((candidate) => normalizedState === normalizeText(candidate))
}

function resolveStateGroup(state: string | undefined, config: QualityAssuranceProjectConfig): 'testing' | 'development' | 'done' | 'new' | 'other' {
  if (matchesStateGroup(state, config.stateGroups.testing)) {
    return 'testing'
  }

  if (matchesStateGroup(state, config.stateGroups.done)) {
    return 'done'
  }

  if (matchesStateGroup(state, config.stateGroups.development)) {
    return 'development'
  }

  if (config.stateGroups.new.length > 0 && matchesStateGroup(state, config.stateGroups.new)) {
    return 'new'
  }

  return 'other'
}

/**
 * Returns true if the item entered a "ready for QA" (testing-group) state within the lookback
 * window at any point in its history — not just as the immediately preceding state. This lets an
 * item that moved testing → done → development still be recognized as "was recently ready for QA",
 * so it can be routed to Needs follow-up / Recently completed after multi-hop transitions.
 */
function wasReadyForQaRecently(
  item: WorkItemSummary,
  updates: WorkItemUpdate[],
  config: QualityAssuranceProjectConfig,
  now = Date.now(),
): boolean {
  for (const update of updates) {
    const nextState = update.fields?.['System.State']?.newValue
    if (
      typeof nextState === 'string' &&
      matchesStateGroup(nextState, config.stateGroups.testing) &&
      isFresh(resolveFreshnessTimestamp(update.revisedDate, item.recentActivityAt, now), now, config.lookbackDays)
    ) {
      return true
    }
  }
  return false
}

function isFresh(timestamp: string | undefined, now = Date.now(), lookbackDays = DEFAULT_QA_LOOKBACK_DAYS): boolean {
  const time = toTimestamp(timestamp)
  if (time === null) {
    return false
  }

  const windowStart = now - normalizeQaLookbackDays(lookbackDays) * 24 * 60 * 60 * 1000
  return time >= windowStart && time <= now
}

function collectTags(item: WorkItemSummary): string[] {
  return (item.tags ?? []).map((tag) => normalizeText(tag))
}

/**
 * Maps a group key to its board bucket id. Shared by tag-group classification.
 */
const GROUP_TO_BUCKET: Record<'testing' | 'done' | 'development' | 'new', QualityAssuranceBucketId> = {
  testing: 'needs-testing',
  done: 'done',
  development: 'needs-development',
  new: 'new',
}

/**
 * If any of the item's tags matches a configured column tag group, returns that column's bucket.
 * Groups are checked in precedence order (testing → done → development → new) — the first match
 * wins. Matching is case-insensitive and exact against each tag. Returns null when no tag matches.
 */
function resolveTagBucket(item: WorkItemSummary, config: QualityAssuranceProjectConfig): QualityAssuranceBucketId | null {
  const itemTags = new Set(collectTags(item))
  if (itemTags.size === 0) {
    return null
  }

  const groupOrder: Array<'testing' | 'done' | 'development' | 'new'> = ['testing', 'done', 'development', 'new']
  for (const group of groupOrder) {
    const configuredTags = config.tagGroups[group]
    if (configuredTags.some((tag) => itemTags.has(normalizeText(tag)))) {
      return GROUP_TO_BUCKET[group]
    }
  }

  return null
}

function isNewCandidate(item: WorkItemSummary, config: QualityAssuranceProjectConfig): boolean {
  return isFresh(item.createdAt, Date.now(), config.lookbackDays)
}

/**
 * Work item update fields that represent meaningful QA-relevant activity. A candidate is only
 * surfaced on the board if it had a change to one of these fields within the lookback window
 * (or was created in-window, or has related PRs). This filters out noise like Backlog Priority
 * reordering, board-column recalcs, and description tweaks that bump System.ChangedDate without
 * representing real QA progress.
 *
 * Iteration/scheduling changes are intentionally excluded — merely (re)scheduling an old item
 * into a sprint doesn't make it newly added or actively worked on.
 */
const HIGH_IMPACT_UPDATE_FIELDS = [
  'System.State',
  'System.AreaPath',
  'System.Tags',
] as const

function hasRecentHighImpactActivity(
  item: WorkItemSummary,
  updates: WorkItemUpdate[],
  config: QualityAssuranceProjectConfig,
): boolean {
  const now = Date.now()

  // Newly created items are inherently meaningful.
  if (isFresh(item.createdAt, now, config.lookbackDays)) {
    return true
  }

  // Related/active pull requests make an item worth surfacing.
  if ((item.activePullRequests?.length ?? 0) > 0) {
    return true
  }

  // A change to a high-impact field within the window counts as meaningful activity.
  for (const update of updates) {
    if (!isFresh(resolveFreshnessTimestamp(update.revisedDate, item.recentActivityAt, now), now, config.lookbackDays)) {
      continue
    }
    const fields = update.fields
    if (!fields) {
      continue
    }
    for (const field of HIGH_IMPACT_UPDATE_FIELDS) {
      if (fields[field] !== undefined) {
        return true
      }
    }
  }

  return false
}

export function classifyQualityAssuranceItem(
  item: WorkItemSummary,
  updates: WorkItemUpdate[],
  config: QualityAssuranceProjectConfig,
): QualityAssuranceBucketId | null {
  // Tag-based classification takes precedence over state heuristics: a configured column tag is
  // an explicit signal for where the item belongs (checked testing → done → development → new).
  const tagBucket = resolveTagBucket(item, config)
  if (tagBucket) {
    return tagBucket
  }

  const currentStateGroup = resolveStateGroup(item.state, config)
  const readyForQaRecently = wasReadyForQaRecently(item, updates, config)

  // An item that was ready for QA within the window is routed by its current state group:
  // still in testing → Ready for QA; moved to development → Needs follow-up; moved to done →
  // Recently completed. We scan the full recent history (not just the immediately prior state)
  // so multi-hop transitions like testing → done → development are handled correctly.
  if (currentStateGroup === 'testing' && readyForQaRecently) {
    return 'needs-testing'
  }

  if (currentStateGroup === 'development' && readyForQaRecently) {
    return 'needs-development'
  }

  if (currentStateGroup === 'done' && readyForQaRecently) {
    return 'done'
  }

  if (currentStateGroup === 'new') {
    return 'new'
  }

  // Fresh items in an unclassified ('other') state fall into "Newly added" as a catch-all — but
  // only when the user hasn't explicitly configured the new-column states. Once configured, we
  // trust that list exactly (an item then reaches "Newly added" only via a new state or new tag).
  if (currentStateGroup === 'other' && !config.strictNewStates && isNewCandidate(item, config)) {
    return 'new'
  }

  // Items in a recognized workflow state (testing / development / done) are intentionally NOT
  // routed to "Newly added" on freshness alone — that would override the configured state groups.
  // Such items only reach "Newly added" via a new-group state or a new-group tag.

  return null
}

export function bucketQualityAssuranceItems(
  items: WorkItemSummary[],
  updatesByItemId: Record<number, WorkItemUpdate[]>,
  config: QualityAssuranceProjectConfig,
): QualityAssuranceBucket[] {
  const buckets: Record<QualityAssuranceBucketId, WorkItemSummary[]> = {
    new: [],
    'needs-testing': [],
    'needs-development': [],
    done: [],
  }

  for (const item of items) {
    const updates = updatesByItemId[item.id] ?? []
    const bucketId = classifyQualityAssuranceItem(item, updates, config)
    if (!bucketId) {
      continue
    }

    // Skip items whose only recent activity is low-impact noise (e.g. Backlog Priority reorder).
    if (!hasRecentHighImpactActivity(item, updates, config)) {
      continue
    }

    buckets[bucketId].push(item)
  }

  for (const key of Object.keys(buckets) as QualityAssuranceBucketId[]) {
    buckets[key] = buckets[key].sort((left, right) => {
      const leftAt = toTimestamp(left.createdAt ?? left.recentActivityAt) ?? 0
      const rightAt = toTimestamp(right.createdAt ?? right.recentActivityAt) ?? 0
      return rightAt - leftAt
    })
  }

  return [
    { id: 'new', title: 'Newly added', items: buckets.new },
    { id: 'needs-development', title: 'Needs follow-up', items: buckets['needs-development'] },
    { id: 'needs-testing', title: 'Ready for QA', items: buckets['needs-testing'] },
    { id: 'done', title: 'Recently completed', items: buckets.done },
  ]
}
