import type { TeamIterationOption } from '../../../ado/types'
import type { AttentionTone } from '../components/boardAttention'
import type { BacklogTierThresholds } from './backlogOptions'
import { findNextIteration } from './backlogSprint'
import { BACKLOG_TIERS, getBacklogTier, type BacklogTierKey } from './backlogTiers'
import {
  getBacklogAgeDays,
  getImpactDescription,
  getSeverityDisplay,
  MIN_ADJUSTED_EFFORT,
  type RankedBacklogBug,
} from './backlogValue'
import { parseDateOnly } from './dateOnly'

export type BacklogFacetKey = 'severe' | 'ended' | 'missing' | 'noEffort' | 'old'

export type BacklogFacet = {
  key: BacklogFacetKey
  label: string
  tone: AttentionTone
  description: string
}

export const BACKLOG_FACET_KEYS: readonly BacklogFacetKey[] = ['severe', 'ended', 'missing', 'noEffort', 'old']

/** "1 month", "6 months", "1 year", or "2 years"; whole years read as years. */
export function formatAgingPeriod(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12
    return years === 1 ? '1 year' : `${years} years`
  }
  return months === 1 ? '1 month' : `${months} months`
}

/** The Needs attention facets, in bar order; the age facet's label follows the team's Backlog options. */
export function getBacklogFacets(agingMonths: number): BacklogFacet[] {
  const period = formatAgingPeriod(agingMonths)
  return [
    {
      key: 'severe',
      label: 'Severe, not planned',
      tone: 'critical',
      description: 'Severity 1, or Severity 2 with Impact 1, and not in this sprint or the next.',
    },
    {
      key: 'ended',
      label: 'In an ended sprint',
      tone: 'attention',
      description: 'Still open in a sprint that has ended. Move it to a new sprint or back to the backlog.',
    },
    {
      key: 'missing',
      label: 'Missing severity or impact',
      tone: 'attention',
      description: 'The Value counts a missing Severity or Impact as 4, the lowest level, so these bugs may rank too low.',
    },
    {
      key: 'noEffort',
      label: 'No effort',
      tone: 'attention',
      description: `The Value counts a missing Effort as ${MIN_ADJUSTED_EFFORT} points, and these bugs cannot be planned by effort.`,
    },
    {
      key: 'old',
      label: `Older than ${period}`,
      tone: 'info',
      description: `Still New after ${period}. Close it, or confirm it still matters. Change the age in Backlog options.`,
    },
  ]
}

export type BacklogFacetContext = {
  agingMonths: number
  now?: number
}

const isPlanned = (bug: RankedBacklogBug) => bug.sprint.kind === 'current' || bug.sprint.kind === 'next'

const hasEffort = (bug: RankedBacklogBug) => bug.effort !== undefined && Number.isFinite(bug.effort)

function wasCreatedMonthsAgo(createdAt: string | undefined, months: number, now: number): boolean {
  const created = createdAt ? Date.parse(createdAt) : Number.NaN
  if (Number.isNaN(created)) {
    return false
  }

  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - months)
  return created <= cutoff.getTime()
}

/** Whether a bug shows the facet's signal. */
export function matchesBacklogFacet(bug: RankedBacklogBug, key: BacklogFacetKey, context: BacklogFacetContext): boolean {
  switch (key) {
    case 'severe': {
      const level = getSeverityDisplay(bug.severity)?.level
      return (level === 1 || (level === 2 && bug.priority === 1)) && !isPlanned(bug)
    }
    case 'ended':
      return bug.sprint.kind === 'past'
    case 'missing':
      // An unreadable level is scored like a missing one, so it is flagged too.
      return getSeverityDisplay(bug.severity)?.level === undefined || getImpactDescription(bug.priority) === undefined
    case 'noEffort':
      return !hasEffort(bug)
    case 'old':
      return bug.state?.trim().toLowerCase() === 'new'
        && wasCreatedMonthsAgo(bug.createdAt, context.agingMonths, context.now ?? Date.now())
  }
}

/** How many of the bugs show each facet's signal. */
export function countBacklogFacets(bugs: readonly RankedBacklogBug[], context: BacklogFacetContext): Record<BacklogFacetKey, number> {
  const resolved = { ...context, now: context.now ?? Date.now() }
  const counts = Object.fromEntries(BACKLOG_FACET_KEYS.map((key) => [key, 0])) as Record<BacklogFacetKey, number>
  for (const bug of bugs) {
    for (const key of BACKLOG_FACET_KEYS) {
      if (matchesBacklogFacet(bug, key, resolved)) {
        counts[key] += 1
      }
    }
  }
  return counts
}

/** The ids of the bugs that show the facet's signal. */
export function getBacklogFacetMatches(
  bugs: readonly RankedBacklogBug[],
  key: BacklogFacetKey,
  context: BacklogFacetContext,
): Set<number> {
  const resolved = { ...context, now: context.now ?? Date.now() }
  return new Set(bugs.filter((bug) => matchesBacklogFacet(bug, key, resolved)).map((bug) => bug.id))
}

export type SeverityLevel = 1 | 2 | 3 | 4

export const SEVERITY_LEVELS: readonly SeverityLevel[] = [1, 2, 3, 4]

export type BacklogSummary = {
  openCount: number
  /** The sum of the Effort entered on the bugs. */
  effortTotal: number
  /** Bugs with no Effort, which the total leaves out. */
  unestimatedCount: number
  tierCounts: Record<BacklogTierKey, number>
  severityCounts: Record<SeverityLevel, number>
  /** Bugs whose Severity is missing or has no level the Value can read. */
  severityNotSetCount: number
  /** The team's sprints; both are undefined until the sprints load, and then the summary leaves out the sprint groups. */
  currentSprint?: TeamIterationOption
  nextSprint?: TeamIterationOption
  hasSprints: boolean
  plannedThisSprint: number
  plannedNextSprint: number
  inEndedSprints: number
  /** Bugs created on or after the day the current sprint started, or undefined with no current sprint. */
  newThisSprint?: number
  /** The median age in whole days, or undefined when no bug has a created date. */
  medianAgeDays?: number
}

function median(sorted: readonly number[]): number | undefined {
  if (sorted.length === 0) {
    return undefined
  }

  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : Math.floor((sorted[middle - 1] + sorted[middle]) / 2)
}

/** The whole backlog at a glance, for the summary ribbon above the list. */
export function summarizeBacklog(
  bugs: readonly RankedBacklogBug[],
  thresholds: BacklogTierThresholds,
  iterations: readonly TeamIterationOption[],
  now = Date.now(),
): BacklogSummary {
  const tierCounts = Object.fromEntries(BACKLOG_TIERS.map(({ key }) => [key, 0])) as Record<BacklogTierKey, number>
  const severityCounts: Record<SeverityLevel, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  const currentSprint = iterations.find((iteration) => iteration.timeFrame === 'current')
  const sprintStart = parseDateOnly(currentSprint?.startDate)?.getTime()
  const ages: number[] = []
  let effortTotal = 0
  let unestimatedCount = 0
  let severityNotSetCount = 0
  let plannedThisSprint = 0
  let plannedNextSprint = 0
  let inEndedSprints = 0
  let newThisSprint = 0

  for (const bug of bugs) {
    if (hasEffort(bug)) {
      effortTotal += bug.effort as number
    } else {
      unestimatedCount += 1
    }

    tierCounts[getBacklogTier(bug.value, thresholds)] += 1

    const level = getSeverityDisplay(bug.severity)?.level as SeverityLevel | undefined
    if (level === undefined) {
      severityNotSetCount += 1
    } else {
      severityCounts[level] += 1
    }

    if (bug.sprint.kind === 'current') {
      plannedThisSprint += 1
    } else if (bug.sprint.kind === 'next') {
      plannedNextSprint += 1
    } else if (bug.sprint.kind === 'past') {
      inEndedSprints += 1
    }

    const created = bug.createdAt ? Date.parse(bug.createdAt) : Number.NaN
    if (sprintStart !== undefined && !Number.isNaN(created) && created >= sprintStart) {
      newThisSprint += 1
    }

    const age = getBacklogAgeDays(bug.createdAt, now)
    if (age !== undefined) {
      ages.push(age)
    }
  }

  return {
    openCount: bugs.length,
    effortTotal,
    unestimatedCount,
    tierCounts,
    severityCounts,
    severityNotSetCount,
    currentSprint,
    nextSprint: findNextIteration(iterations),
    hasSprints: iterations.length > 0,
    plannedThisSprint,
    plannedNextSprint,
    inEndedSprints,
    newThisSprint: sprintStart === undefined ? undefined : newThisSprint,
    medianAgeDays: median(ages.sort((a, b) => a - b)),
  }
}
