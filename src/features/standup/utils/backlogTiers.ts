import type { CSSProperties } from 'react'
import type { BacklogTierThresholds } from './backlogOptions'
import { formatBacklogValue, formatValueTerm, type RankedBacklogBug } from './backlogValue'

export type BacklogTierKey = 'top' | 'high' | 'medium' | 'low'

export const BACKLOG_TIERS: ReadonlyArray<{ key: BacklogTierKey; name: string }> = [
  { key: 'top', name: 'Top' },
  { key: 'high', name: 'High' },
  { key: 'medium', name: 'Medium' },
  { key: 'low', name: 'Low' },
]

const SURFACE = 'var(--stratakit-mui-palette-background-paper)'

/** One accent ramp that fades toward the surface, so tiers never compete with the severity colors. */
export const BACKLOG_TIER_COLORS: Readonly<Record<BacklogTierKey, string>> = {
  top: 'var(--stratakit-color-bg-accent-base)',
  high: `color-mix(in oklab, var(--stratakit-color-bg-accent-base) 62%, ${SURFACE})`,
  medium: `color-mix(in oklab, var(--stratakit-color-bg-accent-base) 30%, ${SURFACE})`,
  low: 'var(--stratakit-color-bg-mono-muted)',
}

/** Sets `--backlog-tier` for a tier's color bar, and `--backlog-tier-meter` for its Value meters. */
export function getBacklogTierStyle(key: BacklogTierKey): CSSProperties {
  return {
    '--backlog-tier': BACKLOG_TIER_COLORS[key],
    // The Low tier's own color is too faint for a meter, so its meters take the neutral fill instead of the accent.
    ...(key === 'low' ? { '--backlog-tier-meter': 'var(--stratakit-color-bg-mono-base)' } : {}),
  } as CSSProperties
}

/**
 * The tier of a Value. It compares the Value as shown (one decimal), so a bug showing 80.0 is never left out of
 * "Value 80+". Rounding never reorders Values, so each tier is still a contiguous run of the ranking.
 */
export function getBacklogTier(value: number, thresholds: BacklogTierThresholds): BacklogTierKey {
  const shown = Number(formatBacklogValue(value))
  if (shown >= thresholds.top) {
    return 'top'
  }
  if (shown >= thresholds.high) {
    return 'high'
  }
  return shown >= thresholds.medium ? 'medium' : 'low'
}

/** "Value 80+", "Value 30–80", "Value 12–30", or "Value under 12". */
export function formatBacklogTierRange(key: BacklogTierKey, thresholds: BacklogTierThresholds): string {
  const [top, high, medium] = [thresholds.top, thresholds.high, thresholds.medium].map(formatValueTerm)
  switch (key) {
    case 'top':
      return `Value ${top}+`
    case 'high':
      return `Value ${high}–${top}`
    case 'medium':
      return `Value ${medium}–${high}`
    case 'low':
      return `Value under ${medium}`
  }
}

export type BacklogTierGroup = {
  key: BacklogTierKey
  name: string
  range: string
  bugs: RankedBacklogBug[]
  /** The sum of the Effort entered on the tier's bugs. */
  effortTotal: number
  /** Bugs with no Effort, which the total leaves out. */
  unestimatedCount: number
}

/** Splits ranked bugs into their tiers, keeping the ranked order within each; a tier with no bugs is left out. */
export function groupBacklogBugsByTier(bugs: readonly RankedBacklogBug[], thresholds: BacklogTierThresholds): BacklogTierGroup[] {
  const byTier = new Map<BacklogTierKey, RankedBacklogBug[]>()
  for (const bug of bugs) {
    const key = getBacklogTier(bug.value, thresholds)
    const tierBugs = byTier.get(key)
    if (tierBugs) {
      tierBugs.push(bug)
    } else {
      byTier.set(key, [bug])
    }
  }

  return BACKLOG_TIERS.flatMap(({ key, name }) => {
    const tierBugs = byTier.get(key)
    if (!tierBugs) {
      return []
    }

    let effortTotal = 0
    let unestimatedCount = 0
    for (const bug of tierBugs) {
      if (bug.effort !== undefined && Number.isFinite(bug.effort)) {
        effortTotal += bug.effort
      } else {
        unestimatedCount += 1
      }
    }

    return [{ key, name, range: formatBacklogTierRange(key, thresholds), bugs: tierBugs, effortTotal, unestimatedCount }]
  })
}
