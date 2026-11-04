import { parseDateOnly } from './dateOnly'

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isValidDate(date: Date | null): date is Date {
  return date !== null && !Number.isNaN(date.getTime())
}

const LONG_DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const SHORT_DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

/** "Oct 27, 2026 – Nov 10, 2026", or "Oct 27 – Nov 10" when `short`; falls back to whichever end is known. */
export function formatSprintDateRange(startDate?: string, finishDate?: string, { short = false } = {}): string {
  const formatter = short ? SHORT_DATE : LONG_DATE
  const start = parseDateOnly(startDate)
  const finish = parseDateOnly(finishDate)
  const hasStart = isValidDate(start)
  const hasFinish = isValidDate(finish)

  if (hasStart && hasFinish) {
    return `${formatter.format(start)} – ${formatter.format(finish)}`
  }

  if (hasStart) {
    return `Starts ${formatter.format(start)}`
  }

  if (hasFinish) {
    return `Ends ${formatter.format(finish)}`
  }

  return 'Dates unavailable'
}

export function formatSprintDate(date: Date): string {
  return SHORT_DATE.format(date)
}

const DAYS_PER_MONTH = 365.25 / 12

/**
 * A count of days, coarser as it grows so long waits stay readable: "13d", then "2w"–"8w",
 * "2mo"–"11mo", and "1y" on. Each unit rounds down.
 */
export function formatDayCount(days: number): string {
  if (days < 14) {
    return `${days}d`
  }
  if (days < 61) {
    return `${Math.floor(days / 7)}w`
  }
  if (days < 365) {
    return `${Math.floor(days / DAYS_PER_MONTH)}mo`
  }
  return `${Math.floor(days / 365)}y`
}

/** Weekdays from `from` through `to`, both inclusive; 0 when `to` is before `from`. */
export function countWorkingDays(from: Date, to: Date): number {
  let workingDays = 0
  const last = startOfDay(to)
  for (const day = startOfDay(from); day <= last; day.setDate(day.getDate() + 1)) {
    if (day.getDay() !== 0 && day.getDay() !== 6) {
      workingDays++
    }
  }
  return workingDays
}

export type SprintProgress =
  | { status: 'unavailable' }
  | { status: 'upcoming'; startsOn: Date }
  | { status: 'ended' }
  /** `day` and `daysLeft` both count today, so on a weekday `day + daysLeft = totalDays + 1`. */
  | { status: 'active'; day: number; totalDays: number; daysLeft: number }

export function getSprintProgress(startDate?: string, finishDate?: string, today = new Date()): SprintProgress {
  const start = parseDateOnly(startDate)
  const finish = parseDateOnly(finishDate)
  if (!isValidDate(start) || !isValidDate(finish) || finish < start) {
    return { status: 'unavailable' }
  }

  const todayStart = startOfDay(today)
  if (todayStart < startOfDay(start)) {
    return { status: 'upcoming', startsOn: start }
  }

  if (todayStart > startOfDay(finish)) {
    return { status: 'ended' }
  }

  const totalDays = Math.max(countWorkingDays(start, finish), 1)
  return {
    status: 'active',
    day: Math.min(Math.max(countWorkingDays(start, todayStart), 1), totalDays),
    totalDays,
    daysLeft: countWorkingDays(todayStart, finish),
  }
}
