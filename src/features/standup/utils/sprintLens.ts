import svgCalendar from '@stratakit/icons/calendar.svg'
import type { IterationWindowInfo, TeamIterationOption, WorkItemSummary } from '../../../ado/queryEngine'
import type { BoardRowData } from '../components/KanbanBoardGrid'
import { formatSprintDateRange } from './sprintDates'

export const NO_SPRINT_ROW_KEY = '__no_sprint__'

export function getSprintRowKey(sprintName: string | undefined): string {
  const name = sprintName?.trim()
  return name ? `sprint:${name.toLowerCase()}` : NO_SPRINT_ROW_KEY
}

/** Pull requests without a work item have no sprint, so the Sprint view leaves them out. */
export function isSprintLensItem(item: WorkItemSummary): boolean {
  return item.kind !== 'pull-request'
}

export type SprintLensRowOptions = {
  currentIterationName: string | null
  iterationWindow?: IterationWindowInfo
  teamIterations?: readonly TeamIterationOption[]
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
 * and collapsed, and items without a sprint last.
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

  const rows: BoardRowData[] = sorted.map(([key, name]) => ({
    key,
    label: name,
    iconHref: svgCalendar,
    subtitle: getSprintDates(name, options),
    countsAllItems: true,
    defaultCollapsed: hasCurrent && key !== currentKey && laneCount > 1,
  }))

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
