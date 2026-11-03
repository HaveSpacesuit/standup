import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { EffortFlowPoint } from '../hooks/useEffortFlowHistory'
import { parseDateOnly } from './dateOnly'
import type { SprintDeparture, SprintJourney } from './sprintJourney'
import { getSprintRowKey, type SprintLensScope } from './sprintLens'
import { STATUS_COLUMNS } from './statusColumnStyles'

/** One working day of the sprint, which the Sprint view can be replayed to. */
export type SprintReplayDay = {
  /** The working day of the sprint, counting from 1. */
  day: number
  date: Date
  /** The end of the day: the board is shown as it stood then. */
  at: number
}

export type SprintReplayTimeline = {
  /** Every working day of the sprint, including the ones still to come. */
  days: SprintReplayDay[]
  /** The latest day with history: today, or the sprint's last day once it has ended. */
  todayIndex: number
}

function endOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1
}

/** The sprint's working days, from the effort flow's points; null until at least one day has passed. */
export function getSprintReplayTimeline(points: readonly EffortFlowPoint[]): SprintReplayTimeline | null {
  const days: SprintReplayDay[] = []
  let todayIndex = -1
  for (const point of points) {
    const date = parseDateOnly(point.date)
    if (!date) {
      return null
    }

    days.push({ day: days.length + 1, date, at: endOfDay(date) })
    if (STATUS_COLUMNS.some((status) => point[status] !== null)) {
      todayIndex = days.length - 1
    }
  }

  return todayIndex < 0 ? null : { days, todayIndex }
}

/** The flow points as they were known at `at`: later days become blank. */
export function getReplayFlowPoints(points: readonly EffortFlowPoint[], at: number): EffortFlowPoint[] {
  return points.map((point) => {
    const date = parseDateOnly(point.date)
    return date && endOfDay(date) <= at
      ? point
      : { date: point.date, Blocked: null, New: null, Active: null, Review: null, Done: null }
  })
}

/** The card's journey as it stood at `at`, or null when it hadn't joined the sprint yet. */
export function journeyAsOf(journey: SprintJourney, at: number): SprintJourney | null {
  if (journey.addedAt !== null && at < journey.addedAt) {
    return null
  }

  const steps = journey.steps.filter((step, index) => index === 0 || step.at <= at)
  return steps.length === journey.steps.length ? journey : { ...journey, steps }
}

export type SprintReplayBoard = {
  items: WorkItemSummary[]
  journeysByItemId: Record<number, SprintJourney>
  scope: SprintLensScope | null
}

type SprintReplayBoardOptions = {
  items: readonly WorkItemSummary[]
  journeysByItemId: Record<number, SprintJourney>
  scope: SprintLensScope | null
  departuresByItemId?: Record<number, SprintDeparture>
  currentIterationName: string | null
  at: number
}

/**
 * The current sprint as it stood at `at`: each card in the column it was in then, cards added later
 * left out, and cards removed later back in their lane. Other sprints are left out, and so are cards
 * without history, since there is no telling where they stood.
 */
export function getSprintReplayBoard({
  items,
  journeysByItemId,
  scope,
  departuresByItemId,
  currentIterationName,
  at,
}: SprintReplayBoardOptions): SprintReplayBoard {
  const replayItems: WorkItemSummary[] = []
  const replayJourneys: Record<number, SprintJourney> = {}
  const place = (item: WorkItemSummary, journey: SprintJourney, sprintName = item.sprintName) => {
    const asOf = journeyAsOf(journey, at)
    if (!asOf) {
      return
    }

    replayItems.push({ ...item, sprintName, status: asOf.steps[asOf.steps.length - 1].status })
    replayJourneys[item.id] = asOf
  }

  if (currentIterationName) {
    const currentKey = getSprintRowKey(currentIterationName)
    for (const item of items) {
      const journey = journeysByItemId[item.id]
      if (journey && getSprintRowKey(item.sprintName) === currentKey) {
        place(item, journey)
      }
    }
  }

  if (!scope) {
    return { items: replayItems, journeysByItemId: replayJourneys, scope: null }
  }

  const removedItems: WorkItemSummary[] = []
  for (const item of scope.removedItems) {
    const departure = departuresByItemId?.[item.id]
    if (currentIterationName && departure?.journey && departure.leftAt !== null && departure.leftAt > at) {
      place(item, departure.journey, currentIterationName)
    } else {
      removedItems.push(item)
    }
  }

  return { items: replayItems, journeysByItemId: replayJourneys, scope: { ...scope, removedItems } }
}

const REPLAY_DATE = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

/** "Wed, Oct 29". */
export function formatReplayDate(day: SprintReplayDay): string {
  return REPLAY_DATE.format(day.date)
}
