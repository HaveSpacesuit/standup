import type { TeamIterationOption } from '../../../ado/types'
import { parseDateOnly } from './dateOnly'
import { getSprintProgress } from './sprintDates'
import { testAxisDate, testDayIndex, type TestTimeAxis } from './testHealth'

/** A sprint's days on a Tests chart: `start` through `end - 1`, clipped to the axis. */
export type TestSprintBand = {
  name: string
  start: number
  end: number
  /** The sprint began before the axis does, so it has no visible start boundary. */
  clipped: boolean
  current: boolean
  /** The name, plus "· Day N of M" for the current sprint. */
  label: string
}

/** The selected team's sprints that overlap the axis, in date order; sprints without both dates are skipped. */
export function testSprintBands(iterations: readonly TeamIterationOption[], axis: TestTimeAxis): TestSprintBand[] {
  const today = testAxisDate(axis, axis.todayIndex)
  return iterations
    .flatMap((iteration): TestSprintBand[] => {
      const startDate = parseDateOnly(iteration.startDate)
      const finishDate = parseDateOnly(iteration.finishDate)
      if (!startDate || !finishDate || Number.isNaN(startDate.getTime()) || Number.isNaN(finishDate.getTime()) || finishDate < startDate) {
        return []
      }
      const start = testDayIndex(axis, startDate.getTime())
      const end = testDayIndex(axis, finishDate.getTime()) + 1
      if (end <= 0 || start >= axis.dayCount) {
        return []
      }
      const progress = getSprintProgress(iteration.startDate, iteration.finishDate, today)
      return [{
        name: iteration.name,
        start: Math.max(0, start),
        end: Math.min(axis.dayCount, end),
        clipped: start < 0,
        current: progress.status === 'active',
        label: progress.status === 'active' ? `${iteration.name} · Day ${progress.day} of ${progress.totalDays}` : iteration.name,
      }]
    })
    .sort((left, right) => left.start - right.start)
}
