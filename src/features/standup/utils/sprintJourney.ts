import svgAdd from '@stratakit/icons/add.svg'
import svgClock from '@stratakit/icons/clock.svg'
import svgStatusSuccess from '@stratakit/icons/status-success.svg'
import svgUndo from '@stratakit/icons/undo.svg'
import { countWorkingDays, formatSprintDate } from './sprintDates'
import { STATUS_COLUMNS, type StatusColumn } from './statusColumnStyles'

const DAY_MS = 24 * 60 * 60 * 1000

/** One stretch of a card's sprint, starting when it entered `status`. */
export type JourneyStep = { status: StatusColumn; at: number }

export type SprintJourney = {
  /** Chronological status changes from when the card joined the sprint through now; never empty. */
  steps: JourneyStep[]
  /** When the card joined the sprint after it started; null when it was there from the start. */
  addedAt: number | null
  sprintStart: number
  /** When the card actually entered its first step's status, which can be before the sprint started. */
  firstStepSince: number
}

export type JourneyTimelineEntry = {
  timestamp: number
  status: StatusColumn
  iterationPath?: string
}

export type BuildSprintJourneyOptions = {
  sprintStart: number
  now: number
  /** The current sprint's iteration path, used to find when the card was moved into it. */
  iterationPath?: string
  /** Whether the card was in the sprint at its start, when known. */
  committed?: boolean
  currentStatus: StatusColumn
}

/** Forward progress through the board; Blocked sits outside it, so moves to or from it are never backward. */
const PROGRESS: Partial<Record<StatusColumn, number>> = { New: 0, Active: 1, Review: 2, Done: 3 }

export function isBackwardMove(from: StatusColumn, to: StatusColumn): boolean {
  const fromRank = PROGRESS[from]
  const toRank = PROGRESS[to]
  return fromRank !== undefined && toRank !== undefined && toRank < fromRank
}

function resolveAddedAt(
  timeline: readonly JourneyTimelineEntry[],
  sprintStart: number,
  iterationPath: string | undefined,
  committed: boolean | undefined,
): number | null {
  if (committed === true) {
    return null
  }

  const path = iterationPath?.trim().toLowerCase()
  if (path) {
    let movedIn: number | null = null
    let previousPath: string | undefined
    for (const entry of timeline) {
      const entryPath = entry.iterationPath?.trim().toLowerCase()
      if (entry.timestamp > sprintStart && entryPath === path && previousPath !== path) {
        movedIn = entry.timestamp
      }
      previousPath = entryPath
    }
    if (movedIn !== null) {
      return movedIn
    }
  }

  const createdAt = timeline[0]?.timestamp
  if (createdAt !== undefined && createdAt > sprintStart) {
    return createdAt
  }

  return committed === false ? sprintStart : null
}

function entryAsOf(timeline: readonly JourneyTimelineEntry[], at: number): JourneyTimelineEntry | null {
  let candidate: JourneyTimelineEntry | null = null
  for (const entry of timeline) {
    if (entry.timestamp > at) {
      break
    }
    candidate = entry
  }
  return candidate
}

/** Replays a card's timeline into the statuses it has held since it joined the current sprint. */
export function buildSprintJourney(
  timeline: readonly JourneyTimelineEntry[],
  { sprintStart, now, iterationPath, committed, currentStatus }: BuildSprintJourneyOptions,
): SprintJourney {
  const addedAt = resolveAddedAt(timeline, sprintStart, iterationPath, committed)
  const from = addedAt ?? sprintStart
  const initial = entryAsOf(timeline, from) ?? timeline[0]
  const steps: JourneyStep[] = [{ status: initial?.status ?? currentStatus, at: from }]

  for (const entry of timeline) {
    if (entry.timestamp <= from || entry.timestamp > now) {
      continue
    }
    if (entry.status !== steps[steps.length - 1].status) {
      steps.push({ status: entry.status, at: entry.timestamp })
    }
  }

  if (steps[steps.length - 1].status !== currentStatus) {
    steps.push({ status: currentStatus, at: now })
  }

  // Walk back to when the first step's status began, so "in Active" counts days before the sprint too.
  let firstStepSince = from
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const entry = timeline[index]
    if (entry.timestamp > from) {
      continue
    }
    if (entry.status !== steps[0].status) {
      break
    }
    firstStepSince = entry.timestamp
  }

  return { steps, addedAt, sprintStart, firstStepSince }
}

export type SprintDeparture = {
  /** When the card left the sprint; null when its history doesn't show the move. */
  leftAt: number | null
  /** The column the card was in when it left, or its current column when that is unknown. */
  status: StatusColumn
}

/** When a card that started the sprint was moved out of it, and the column it left from. */
export function getSprintDeparture(
  timeline: readonly JourneyTimelineEntry[],
  { sprintStart, iterationPath, currentStatus }: { sprintStart: number; iterationPath?: string; currentStatus: StatusColumn },
): SprintDeparture {
  const path = iterationPath?.trim().toLowerCase()
  const departure: SprintDeparture = { leftAt: null, status: currentStatus }
  if (!path) {
    return departure
  }

  let previous: JourneyTimelineEntry | undefined
  for (const entry of timeline) {
    if (
      previous
      && entry.timestamp > sprintStart
      && previous.iterationPath?.trim().toLowerCase() === path
      && entry.iterationPath?.trim().toLowerCase() !== path
    ) {
      departure.leftAt = entry.timestamp
      departure.status = previous.status
    }
    previous = entry
  }

  return departure
}

export function hasMovedBack(journey: SprintJourney): boolean {
  return journey.steps.some((step, index) => index > 0 && isBackwardMove(journey.steps[index - 1].status, step.status))
}

/** The card's latest move, when it was backward. */
export function getLastBackMove(journey: SprintJourney): { from: StatusColumn; to: StatusColumn; at: number } | null {
  const { steps } = journey
  if (steps.length < 2) {
    return null
  }

  const previous = steps[steps.length - 2]
  const last = steps[steps.length - 1]
  return isBackwardMove(previous.status, last.status) ? { from: previous.status, to: last.status, at: last.at } : null
}

/** The column a card was in at `at`, or null before it joined the sprint. */
export function journeyStatusAt(journey: SprintJourney, at: number): StatusColumn | null {
  if (journey.addedAt !== null && at < journey.addedAt) {
    return null
  }

  let status: StatusColumn = journey.steps[0].status
  for (const step of journey.steps) {
    if (step.at > at) {
      break
    }
    status = step.status
  }
  return status
}

function startOfDay(at: number): number {
  const date = new Date(at)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Calendar days from `from` to `to`, matching how the board counts idle days. */
export function calendarDaysBetween(from: number, to: number): number {
  return Math.max(Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS), 0)
}

const WEEKDAY_DATE = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

function formatDay(at: number): string {
  return formatSprintDate(new Date(at))
}

export type JourneyCaptionTone = 'positive' | 'attention' | 'neutral' | 'info'

export type JourneyCaption = {
  text: string
  tooltip: string
  tone: JourneyCaptionTone
  iconHref: string
}

/**
 * One short line telling where the card is in its sprint journey. `skipBack` leaves out the
 * "Back from" wording when the card's next step already says it was sent back.
 */
export function getJourneyCaption(journey: SprintJourney, now: number, { skipBack = false } = {}): JourneyCaption {
  const { steps, addedAt, sprintStart } = journey
  const last = steps[steps.length - 1]
  const since = steps.length === 1 ? journey.firstStepSince : last.at
  const days = calendarDaysBetween(since, now)

  if (last.status === 'Done') {
    if (steps.length === 1 && addedAt === null && since <= sprintStart) {
      return { text: 'Done at start', tooltip: 'Already Done when the sprint started', tone: 'positive', iconHref: svgStatusSuccess }
    }
    return {
      text: `Done ${formatDay(since)}`,
      tooltip: `Moved to Done on ${WEEKDAY_DATE.format(new Date(since))}`,
      tone: 'positive',
      iconHref: svgStatusSuccess,
    }
  }

  const back = skipBack ? null : getLastBackMove(journey)
  if (back) {
    return {
      text: `Back from ${back.from} · ${days === 0 ? 'today' : `${days}d`}`,
      tooltip: `Moved back from ${back.from} to ${back.to} on ${WEEKDAY_DATE.format(new Date(back.at))}`,
      tone: 'attention',
      iconHref: svgUndo,
    }
  }

  if (steps.length === 1 && addedAt !== null && calendarDaysBetween(addedAt, now) === 0) {
    return { text: 'Added today', tooltip: 'Added to the sprint today', tone: 'info', iconHref: svgAdd }
  }

  if (days === 0) {
    if (steps.length === 1) {
      return { text: `${last.status} at start`, tooltip: 'In this column since the sprint started', tone: 'neutral', iconHref: svgClock }
    }
    return { text: `Into ${last.status} today`, tooltip: `Moved to ${last.status} today`, tone: 'info', iconHref: svgClock }
  }

  return {
    text: `${days}d in ${last.status}`,
    tooltip: `In ${last.status} since ${WEEKDAY_DATE.format(new Date(since))}`,
    tone: days >= 5 && last.status !== 'New' ? 'attention' : 'neutral',
    iconHref: svgClock,
  }
}

export type JourneyTrail = {
  /** Weight of the dotted stretch before the card joined the sprint; 0 when it was there from the start. */
  lead: number
  segments: Array<{ status: StatusColumn; weight: number }>
  label: string
}

/** Working days since the sprint started, so weekends don't stretch the trail. */
function sprintDayIndex(sprintStart: number, at: number): number {
  return Math.max(countWorkingDays(new Date(sprintStart), new Date(at)) - 1, 0)
}

/** A thin bar of the columns the card has passed through this sprint, each stretch sized by its working days. */
export function getJourneyTrail(journey: SprintJourney, now: number): JourneyTrail {
  const { steps, addedAt, sprintStart } = journey
  const days = steps.map((step) => sprintDayIndex(sprintStart, step.at))
  const today = sprintDayIndex(sprintStart, now)
  const segments = steps.map((step, index) => ({
    status: step.status,
    weight: Math.max((index + 1 < steps.length ? days[index + 1] : today) - days[index], 0.4),
  }))
  const story = steps.map((step) => `${step.status} from ${formatDay(step.at)}`).join(', then ')

  return {
    lead: addedAt === null ? 0 : days[0],
    segments,
    label: `Journey: ${addedAt === null ? '' : `added ${formatDay(addedAt)}, `}${story}`,
  }
}

export type JourneyGhost = { status: StatusColumn; label: string }

/**
 * Where to draw a hovered card's faint "it was here" marker: where it started the sprint, or failing
 * that, the column it reached farthest from where it sits now.
 */
export function getJourneyGhost(journey: SprintJourney): JourneyGhost | null {
  const { steps, addedAt, sprintStart } = journey
  const current = steps[steps.length - 1].status
  if (steps[0].status !== current) {
    return {
      status: steps[0].status,
      label: addedAt === null ? `Started here · ${formatDay(sprintStart)}` : `Added here · ${formatDay(addedAt)}`,
    }
  }

  const currentIndex = STATUS_COLUMNS.indexOf(current)
  let farthest: number | null = null
  for (let index = 0; index < steps.length; index += 1) {
    const distance = Math.abs(STATUS_COLUMNS.indexOf(steps[index].status) - currentIndex)
    if (distance > 0 && (farthest === null || distance > Math.abs(STATUS_COLUMNS.indexOf(steps[farthest].status) - currentIndex))) {
      farthest = index
    }
  }
  if (farthest === null) {
    return null
  }

  const step = steps[farthest]
  const from = formatDay(step.at)
  const to = formatDay(steps[farthest + 1]?.at ?? step.at)
  return { status: step.status, label: `In ${step.status} · ${from === to ? from : `${from}–${to}`}` }
}
