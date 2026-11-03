import svgAdd from '@stratakit/icons/add.svg'
import svgArrowRight from '@stratakit/icons/arrow-right.svg'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgFlag from '@stratakit/icons/flag.svg'
import svgHistory from '@stratakit/icons/history.svg'
import svgMinus from '@stratakit/icons/minus.svg'
import type { IterationWindowInfo, TeamIterationOption, WorkItemSummary } from '../../../ado/queryEngine'
import type { BoardRowData, LaneNote } from '../components/KanbanBoardGrid'
import { parseDateOnly } from './dateOnly'
import { formatSprintDate, formatSprintDateRange } from './sprintDates'
import { formatEffortPoints } from './sprintEffortTotals'
import type { SprintDeparture } from './sprintJourney'
import type { StatusColumn } from './statusColumnStyles'

export const NO_SPRINT_ROW_KEY = '__no_sprint__'
export const SCOPE_COMMITTED_ROW_KEY = 'scope:committed'
export const SCOPE_ADDED_ROW_KEY = 'scope:added'
export const SCOPE_REMOVED_ROW_KEY = 'scope:removed'

export function getSprintRowKey(sprintName: string | undefined): string {
  const name = sprintName?.trim()
  return name ? `sprint:${name.toLowerCase()}` : NO_SPRINT_ROW_KEY
}

/** Pull requests without a work item have no sprint, so the Sprint view leaves them out. */
export function isSprintLensItem(item: WorkItemSummary): boolean {
  return item.kind !== 'pull-request'
}

/** The current sprint's membership at its start, and the items moved out of it since. */
export type SprintLensScope = {
  startItemIds: ReadonlySet<number>
  removedItems: readonly WorkItemSummary[]
}

/** Where a card removed from the sprint went, for its outline card. */
export type SprintRemoval = {
  /** The team sprint it was moved to; null when it left for a path outside the team's sprints. */
  to: string | null
  /** When it left, when its history shows the move. */
  at: number | null
}

export type SprintLensRowOptions = {
  currentIterationName: string | null
  iterationWindow?: IterationWindowInfo
  teamIterations?: readonly TeamIterationOption[]
  /** Splits the current sprint into Committed at start, Added during sprint, and Removed from sprint lanes. */
  scope?: SprintLensScope | null
  rolledOverItemIds?: Record<number, boolean>
}

function isCurrentSprintItem(item: WorkItemSummary, currentIterationName: string | null): boolean {
  return currentIterationName !== null && getSprintRowKey(item.sprintName) === getSprintRowKey(currentIterationName)
}

/**
 * The scope to split the current sprint by: only once sprint-start membership has loaded and the
 * current sprint is on the board, so filtering it out keeps plain sprint lanes.
 */
export function resolveSprintLensScope(
  items: readonly WorkItemSummary[],
  currentIterationName: string | null,
  scope: SprintLensScope | null | undefined,
): SprintLensScope | null {
  if (!scope || !items.some((item) => isSprintLensItem(item) && isCurrentSprintItem(item, currentIterationName))) {
    return null
  }

  return scope
}

/** The lane a live card sits in. */
export function getSprintLensRowKey(item: WorkItemSummary, { currentIterationName, scope }: Pick<SprintLensRowOptions, 'currentIterationName' | 'scope'>): string {
  if (scope && isCurrentSprintItem(item, currentIterationName)) {
    return scope.startItemIds.has(item.id) ? SCOPE_COMMITTED_ROW_KEY : SCOPE_ADDED_ROW_KEY
  }

  return getSprintRowKey(item.sprintName)
}

/** The column a removed card is drawn in: the one it left from, falling back to where it is now. */
export function getRemovedCardStatus(item: WorkItemSummary, departure: SprintDeparture | undefined): StatusColumn {
  return departure?.status ?? item.status
}

function getKnownSprintName(item: WorkItemSummary, { iterationWindow, teamIterations }: SprintLensRowOptions): string | null {
  const path = item.iterationPath?.trim().toLowerCase()
  const name = item.sprintName?.trim().toLowerCase()
  const known = [
    ...[iterationWindow?.current, iterationWindow?.next].flatMap((iteration) => (iteration ? [{ name: iteration.name, path: iteration.fullName }] : [])),
    ...(teamIterations ?? []).map((iteration) => ({ name: iteration.name, path: iteration.path })),
  ]
  // A path outside the team's sprints, such as the project root, resolves to a misleading last segment.
  const match = known.find((candidate) => (path ? candidate.path?.trim().toLowerCase() === path : candidate.name.toLowerCase() === name))
  return match?.name ?? null
}

export function getSprintRemovals(
  removedItems: readonly WorkItemSummary[],
  departuresByItemId: Record<number, SprintDeparture> | undefined,
  options: SprintLensRowOptions,
): Map<number, SprintRemoval> {
  return new Map(removedItems.map((item) => [
    item.id,
    { to: getKnownSprintName(item, options), at: departuresByItemId?.[item.id]?.leftAt ?? null },
  ]))
}

function getPreviousSprintName(teamIterations: readonly TeamIterationOption[] | undefined, currentIterationName: string | null): string | null {
  const current = currentIterationName?.trim().toLowerCase()
  const finish = (iteration: TeamIterationOption) => parseDateOnly(iteration.finishDate)?.getTime() ?? 0
  const previous = (teamIterations ?? [])
    .filter((iteration) => iteration.timeFrame === 'past' && iteration.name.trim().toLowerCase() !== current)
    .sort((left, right) => finish(right) - finish(left))[0]
  return previous?.name ?? null
}

function sumEffort(items: readonly WorkItemSummary[]): number {
  return items.reduce((sum, item) => sum + (typeof item.effort === 'number' ? item.effort : 0), 0)
}

function getScopeRows(items: readonly WorkItemSummary[], scope: SprintLensScope, options: SprintLensRowOptions): BoardRowData[] {
  const current = items.filter((item) => isSprintLensItem(item) && isCurrentSprintItem(item, options.currentIterationName))
  const committed = current.filter((item) => scope.startItemIds.has(item.id))
  const added = current.filter((item) => !scope.startItemIds.has(item.id))
  const removedEffort = sumEffort(scope.removedItems)

  const committedNotes: LaneNote[] = []
  const rolledOver = committed.filter((item) => options.rolledOverItemIds?.[item.id]).length
  if (rolledOver > 0) {
    const previous = getPreviousSprintName(options.teamIterations, options.currentIterationName)
    committedNotes.push({
      key: 'rolled-over',
      label: previous ? `${rolledOver} from ${previous}` : `${rolledOver} rolled over`,
      tone: 'info',
      iconHref: svgHistory,
      description: `Rolled over from ${previous ?? 'the previous sprint'}`,
    })
  }

  const addedNotes: LaneNote[] = []
  const addedEffort = sumEffort(added)
  if (addedEffort > 0) {
    // What was planned: the committed cards plus the ones since moved out.
    const planned = sumEffort(committed) + removedEffort
    addedNotes.push({
      key: 'scope-growth',
      label: planned > 0 ? `Scope +${Math.round((addedEffort / planned) * 100)}%` : `+${formatEffortPoints(addedEffort)}`,
      tone: 'attention',
      iconHref: svgAdd,
      description: planned > 0
        ? `${formatEffortPoints(addedEffort)} added to the ${formatEffortPoints(planned)} planned`
        : `${formatEffortPoints(addedEffort)} added after planning`,
    })
  }

  const destinations = new Map<string, number>()
  for (const item of scope.removedItems) {
    const to = getKnownSprintName(item, options) ?? ''
    destinations.set(to, (destinations.get(to) ?? 0) + 1)
  }
  const removedNotes: LaneNote[] = [...destinations].map(([to, count]) => ({
    key: `moved-to:${to}`,
    label: to ? `${count} to ${to}` : `${count} moved out`,
    tone: 'neutral',
    iconHref: svgArrowRight,
    description: to ? `Moved to ${to}` : 'Moved out of the team\u2019s sprints',
  }))

  const startDate = parseDateOnly(options.iterationWindow?.current?.startDate)
  return [
    {
      key: SCOPE_COMMITTED_ROW_KEY,
      label: 'Committed at start',
      iconHref: svgFlag,
      subtitle: startDate ? `Planned ${formatSprintDate(startDate)}` : 'Planned for the sprint',
      countsAllItems: true,
      notes: committedNotes,
    },
    {
      key: SCOPE_ADDED_ROW_KEY,
      label: 'Added during sprint',
      iconHref: svgAdd,
      subtitle: 'Scope added after planning',
      countsAllItems: true,
      notes: addedNotes,
    },
    {
      key: SCOPE_REMOVED_ROW_KEY,
      label: 'Removed from sprint',
      iconHref: svgMinus,
      subtitle: 'Shown where they left',
      countsAllItems: true,
      defaultCollapsed: true,
      ghost: true,
      notes: removedNotes,
    },
  ]
}

function getSprintDates(name: string, { iterationWindow, teamIterations }: SprintLensRowOptions): string | undefined {
  const key = name.toLowerCase()
  const iteration = [iterationWindow?.current, iterationWindow?.next].find((candidate) => candidate?.name.toLowerCase() === key)
    ?? teamIterations?.find((candidate) => candidate.name.toLowerCase() === key)
  if (!iteration?.startDate && !iteration?.finishDate) {
    return undefined
  }

  return formatSprintDateRange(iteration.startDate, iteration.finishDate, { short: true })
}

/**
 * One lane per sprint on the board: the current sprint first and open, any other sprint after it
 * and collapsed, and items without a sprint last. With `scope`, the current sprint becomes three
 * lanes: what was committed at its start, what was added since, and what was moved out.
 */
export function getSprintLensRows(items: readonly WorkItemSummary[], options: SprintLensRowOptions): BoardRowData[] {
  const sprintNames = new Map<string, string>()
  let hasNoSprint = false
  for (const item of items) {
    if (!isSprintLensItem(item)) {
      continue
    }

    const key = getSprintRowKey(item.sprintName)
    if (key === NO_SPRINT_ROW_KEY) {
      hasNoSprint = true
    } else if (!sprintNames.has(key)) {
      sprintNames.set(key, item.sprintName!.trim())
    }
  }

  const currentKey = options.currentIterationName ? getSprintRowKey(options.currentIterationName) : null
  const hasCurrent = currentKey !== null && sprintNames.has(currentKey)
  const laneCount = sprintNames.size + (hasNoSprint ? 1 : 0)
  const sorted = [...sprintNames.entries()].sort(([leftKey, left], [rightKey, right]) => {
    if (leftKey === currentKey) {
      return -1
    }
    if (rightKey === currentKey) {
      return 1
    }
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  })

  const rows: BoardRowData[] = sorted.flatMap(([key, name]) => (key === currentKey && options.scope
    ? getScopeRows(items, options.scope, options)
    : [{
        key,
        label: name,
        iconHref: svgCalendar,
        subtitle: getSprintDates(name, options),
        countsAllItems: true,
        defaultCollapsed: hasCurrent && key !== currentKey && laneCount > 1,
      }]))

  if (hasNoSprint) {
    rows.push({
      key: NO_SPRINT_ROW_KEY,
      label: 'No sprint',
      iconHref: svgCalendar,
      countsAllItems: true,
      defaultCollapsed: hasCurrent,
    })
  }

  return rows
}
