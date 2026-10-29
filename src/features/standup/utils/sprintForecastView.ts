import type { ReadySprintForecast, SprintForecastSnapshot } from './sprintForecast'

/** Top-to-bottom order of the stacked bars; it follows the flow of work. */
export const FORECAST_SEGMENTS = [
  { key: 'notStarted', label: 'Not started', detail: 'Blocked, New' },
  { key: 'inProgress', label: 'In progress', detail: 'Active, Review' },
  { key: 'complete', label: 'Complete', detail: 'Done' },
] as const

export type ForecastSegmentKey = (typeof FORECAST_SEGMENTS)[number]['key']

export type ForecastSegmentView = {
  effort: number
  /** Whole percent of the column total; a column's percents always add up to 100. */
  percent: number
  /** Fraction (0-1) of the column total, for drawing. */
  share: number
}

export type ForecastColumnView = {
  key: 'start' | 'current' | 'projected'
  label: string
  detail: string
  total: number
  segments: Record<ForecastSegmentKey, ForecastSegmentView>
}

/** Rounds to integers that add up to `target`, giving the spare units to the largest fractions. */
export function roundToSum(values: number[], target: number): number[] {
  const result = values.map(Math.floor)
  let spare = target - result.reduce((sum, value) => sum + value, 0)
  const byFraction = values
    .map((value, index) => ({ index, fraction: value - result[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const { index } of byFraction) {
    if (spare <= 0) break
    result[index] += 1
    spare -= 1
  }
  return result
}

function describeColumn(
  key: ForecastColumnView['key'],
  label: string,
  detail: string,
  snapshot: SprintForecastSnapshot,
  isEstimate: boolean,
): ForecastColumnView {
  const efforts = FORECAST_SEGMENTS.map(({ key: segment }) => snapshot[segment])
  const hasEffort = snapshot.total > 0
  const shares = efforts.map((effort) => (hasEffort ? effort / snapshot.total : 0))
  const percents = hasEffort ? roundToSum(shares.map((share) => share * 100), 100) : shares
  // Whole numbers keep an estimate from implying precision, and still add up to the total.
  const shown = isEstimate ? roundToSum(efforts, Math.round(snapshot.total)) : efforts

  const segments = {} as Record<ForecastSegmentKey, ForecastSegmentView>
  FORECAST_SEGMENTS.forEach(({ key: segment }, index) => {
    segments[segment] = { effort: shown[index], percent: percents[index], share: shares[index] }
  })
  return { key, label, detail, total: snapshot.total, segments }
}

export function describeForecastColumns(forecast: ReadySprintForecast): ForecastColumnView[] {
  return [
    describeColumn('start', 'Start', 'as committed', forecast.start, false),
    describeColumn('current', 'Now', 'today', forecast.current, false),
    describeColumn('projected', 'Projected end', 'at current pace', forecast.projected, true),
  ]
}
