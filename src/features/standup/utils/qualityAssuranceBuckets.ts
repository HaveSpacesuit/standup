import type { TeamProfile } from '../../../teamProfiles'
import type { WorkItemSummary } from '../../../ado/queryEngine'

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
}

export type QualityAssuranceProjectConfig = {
  lookbackDays: number
  stateGroups: QualityAssuranceStateGroups
}

type WorkItemFieldUpdate = {
  oldValue?: unknown
  newValue?: unknown
}

type WorkItemUpdate = {
  revisedDate?: string
  fields?: Record<string, WorkItemFieldUpdate>
}

export type WorkItemUpdatesResponse = {
  value?: WorkItemUpdate[]
}

const DEFAULT_CONFIG: QualityAssuranceProjectConfig = {
  lookbackDays: 21,
  stateGroups: {
    testing: ['available for testing', 'ready for testing', 'aft'],
    development: ['committed', 'active', 'in progress'],
    done: ['done', 'closed', 'completed'],
  },
}

const PROJECT_CONFIGS: Record<string, Partial<QualityAssuranceProjectConfig>> = {
  'projectwise web': {
    stateGroups: {
      testing: ['available for testing', 'ready for testing', 'aft'],
      development: ['committed', 'active', 'in progress'],
      done: ['done', 'closed', 'completed'],
    },
  },
  'projectwise explorer': {
    stateGroups: {
      testing: ['available for testing', 'ready for testing', 'aft'],
      development: ['committed', 'active', 'in progress'],
      done: ['done', 'closed', 'completed'],
    },
  },
}

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

function normalizeState(state: string | undefined): string {
  return normalizeText(state ?? '')
}

export function resolveQualityAssuranceProjectConfig(team: Pick<TeamProfile, 'id' | 'projectName'>): QualityAssuranceProjectConfig {
  const overrides = PROJECT_CONFIGS[normalizeText(team.projectName)]
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    stateGroups: {
      ...DEFAULT_CONFIG.stateGroups,
      ...overrides?.stateGroups,
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

function resolveStateGroup(state: string | undefined, config: QualityAssuranceProjectConfig): 'testing' | 'development' | 'done' | 'other' {
  if (matchesStateGroup(state, config.stateGroups.testing)) {
    return 'testing'
  }

  if (matchesStateGroup(state, config.stateGroups.development)) {
    return 'development'
  }

  if (matchesStateGroup(state, config.stateGroups.done)) {
    return 'done'
  }

  return 'other'
}

function parseHistoryStateTransition(updates: WorkItemUpdate[]): { enteredStateAt?: string; previousState?: string } {
  let previousState: string | undefined
  let enteredStateAt: string | undefined
  let currentState = ''

  for (const update of updates) {
    const nextState = update.fields?.['System.State']?.newValue

    if (typeof nextState === 'string' && normalizeState(nextState) !== normalizeState(currentState)) {
      previousState = currentState || undefined
      currentState = nextState
      enteredStateAt = update.revisedDate ?? enteredStateAt
    }
  }

  return { enteredStateAt, previousState }
}

function isFresh(timestamp: string | undefined, now = Date.now(), lookbackDays = 21): boolean {
  const time = toTimestamp(timestamp)
  if (time === null) {
    return false
  }

  const windowStart = now - lookbackDays * 24 * 60 * 60 * 1000
  return time >= windowStart && time <= now
}

function collectTags(item: WorkItemSummary): string[] {
  return (item.tags ?? []).map((tag) => normalizeText(tag))
}

function isTriaged(item: WorkItemSummary): boolean {
  return collectTags(item).includes('triage')
}

function isNewCandidate(item: WorkItemSummary, config: QualityAssuranceProjectConfig): boolean {
  return isFresh(item.createdAt, Date.now(), config.lookbackDays) || isTriaged(item)
}

function isTransitionedRecently(enteredStateAt: string | undefined, config: QualityAssuranceProjectConfig): boolean {
  return isFresh(enteredStateAt, Date.now(), config.lookbackDays)
}

export function classifyQualityAssuranceItem(
  item: WorkItemSummary,
  updates: WorkItemUpdate[],
  config: QualityAssuranceProjectConfig,
): QualityAssuranceBucketId | null {
  const currentStateGroup = resolveStateGroup(item.state, config)
  const transition = parseHistoryStateTransition(updates)
  const previousStateGroup = resolveStateGroup(transition.previousState, config)

  if (currentStateGroup === 'testing' && isTransitionedRecently(transition.enteredStateAt, config)) {
    return 'needs-testing'
  }

  if (currentStateGroup === 'development' && previousStateGroup === 'testing' && isTransitionedRecently(transition.enteredStateAt, config)) {
    return 'needs-development'
  }

  if (currentStateGroup === 'done' && previousStateGroup === 'testing' && isTransitionedRecently(transition.enteredStateAt, config)) {
    return 'done'
  }

  if (currentStateGroup === 'other' && isNewCandidate(item, config)) {
    return 'new'
  }

  if (currentStateGroup === 'testing' && isNewCandidate(item, config)) {
    return 'new'
  }

  if (currentStateGroup === 'development' && isNewCandidate(item, config)) {
    return 'new'
  }

  if (currentStateGroup === 'done' && isNewCandidate(item, config)) {
    return 'new'
  }

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
    const bucketId = classifyQualityAssuranceItem(item, updatesByItemId[item.id] ?? [], config)
    if (!bucketId) {
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
