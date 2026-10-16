import type { TestPoint } from '../../../ado/testPipelinesApi'

export type TestPipelineKind = 'build' | 'release'
export const ALL_TEST_STAGES = '__all__'

export function testStageLabel(stageName: string): string {
  return stageName === ALL_TEST_STAGES ? 'Entire pipeline' : stageName
}

export const PASS_RATE_TICKS = [0, 50, 75, 90, 95, 98, 100]

// Log-scales the failure rate so differences near 100% are visible.
export const passRatePosition = (percent: number) => Math.log10(1 + 100 - percent)

export type TestPipeline = {
  id: string
  orgName: string
  projectName: string
  kind: TestPipelineKind
  definitionId: number
  name: string
  stageName: string
  stageDefinitionId?: number
}

const STORAGE_KEY = 'standup:test-pipelines'
const LOOKBACK_STORAGE_KEY = 'standup:test-lookback-days'
const PASS_RATE_FILTER_STORAGE_KEY = 'standup:test-pass-rate-filter'
export type TestPassRateFilter = { enabled: boolean; threshold: number }
export const DEFAULT_TEST_PASS_RATE_FILTER: TestPassRateFilter = { enabled: false, threshold: 0 }

export function validateTestPassRateFilter(filter: TestPassRateFilter): void {
  if (typeof filter.enabled !== 'boolean' || !Number.isFinite(filter.threshold) || filter.threshold < 0 || filter.threshold > 100) {
    throw new Error('Test pass rate threshold must be a number between 0 and 100 inclusive.')
  }
}

export function loadTestPassRateFilter(): TestPassRateFilter {
  const stored = localStorage.getItem(PASS_RATE_FILTER_STORAGE_KEY)
  if (stored === null) return { ...DEFAULT_TEST_PASS_RATE_FILTER }
  const parsed: unknown = JSON.parse(stored)
  if (!parsed || typeof parsed !== 'object' || !('enabled' in parsed) || !('threshold' in parsed)
    || typeof parsed.enabled !== 'boolean' || typeof parsed.threshold !== 'number') {
    throw new Error('Saved Tests pass rate filter is invalid. Correct or remove it from browser storage.')
  }
  const filter = { enabled: parsed.enabled, threshold: parsed.threshold }
  validateTestPassRateFilter(filter)
  return filter
}

export function saveTestPassRateFilter(filter: TestPassRateFilter): void {
  validateTestPassRateFilter(filter)
  localStorage.setItem(PASS_RATE_FILTER_STORAGE_KEY, JSON.stringify(filter))
}

export function filterTestPointsByPassRate<T extends { passed: number; total: number }>(
  points: T[],
  filter: TestPassRateFilter,
): T[] {
  validateTestPassRateFilter(filter)
  return filter.enabled ? points.filter((point) => (point.passed / point.total) * 100 > filter.threshold) : points
}

export type TestDailyMode = 'lowest' | 'average' | 'highest'
export type TestDailyOptions = { enabled: boolean; mode: TestDailyMode }
export const DEFAULT_TEST_DAILY_OPTIONS: TestDailyOptions = { enabled: false, mode: 'highest' }
const DAILY_STORAGE_KEY = 'standup:test-daily-options'

function isTestDailyMode(value: unknown): value is TestDailyMode {
  return value === 'lowest' || value === 'average' || value === 'highest'
}

export function loadTestDailyOptions(): TestDailyOptions {
  const stored = localStorage.getItem(DAILY_STORAGE_KEY)
  if (stored === null) return { ...DEFAULT_TEST_DAILY_OPTIONS }
  const parsed: unknown = JSON.parse(stored)
  if (!parsed || typeof parsed !== 'object' || !('enabled' in parsed) || typeof parsed.enabled !== 'boolean'
    || !('mode' in parsed) || !isTestDailyMode(parsed.mode)) {
    throw new Error('Saved Tests daily options are invalid. Correct or remove them from browser storage.')
  }
  return { enabled: parsed.enabled, mode: parsed.mode }
}

export function saveTestDailyOptions(options: TestDailyOptions): void {
  if (typeof options.enabled !== 'boolean' || !isTestDailyMode(options.mode)) {
    throw new Error('Choose lowest, average, or highest for daily test results.')
  }
  localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(options))
}

export type TestChartPoint = TestPoint | { date: string; passRate: number; runCount: number; runId?: undefined }

export function testPointPassRate(point: TestChartPoint): number {
  return 'passRate' in point ? point.passRate : (point.passed / point.total) * 100
}

export function groupTestPointsByDay(points: TestPoint[], options: TestDailyOptions): TestChartPoint[] {
  if (!options.enabled) return points
  const days = new Map<string, TestPoint[]>()
  for (const point of points) {
    const date = new Date(point.date)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    const group = days.get(key)
    if (group) group.push(point)
    else days.set(key, [point])
  }
  return [...days.values()].map((group): TestChartPoint => {
    const sorted = [...group].sort((left, right) => Date.parse(left.date) - Date.parse(right.date) || left.runId - right.runId)
    if (options.mode === 'average' && sorted.length > 1) {
      return {
        date: sorted[0].date,
        passRate: sorted.reduce((sum, point) => sum + testPointPassRate(point) / sorted.length, 0),
        runCount: sorted.length,
      }
    }
    return sorted.reduce((selected, point) => {
      const difference = testPointPassRate(point) - testPointPassRate(selected)
      return (options.mode === 'lowest' ? difference < 0 : difference > 0) ? point : selected
    })
  }).sort((left, right) => Date.parse(left.date) - Date.parse(right.date))
}

export const DEFAULT_TEST_LOOKBACK_DAYS = 90
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export function testLookbackStart(days: number, now = Date.now()): string {
  if (!Number.isSafeInteger(days) || days < 1) {
    throw new Error('Test lookback must be a positive whole number of days.')
  }
  const date = new Date(now - days * MILLISECONDS_PER_DAY)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Test lookback is too large.')
  }
  return date.toISOString()
}

export function loadTestLookbackDays(): number {
  const stored = localStorage.getItem(LOOKBACK_STORAGE_KEY)
  if (stored === null) return DEFAULT_TEST_LOOKBACK_DAYS
  const days = Number(stored)
  testLookbackStart(days)
  return days
}

export function saveTestLookbackDays(days: number): void {
  testLookbackStart(days)
  localStorage.setItem(LOOKBACK_STORAGE_KEY, String(days))
}

export function loadTestPipelines(): TestPipeline[] {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    return []
  }

  const parsed: unknown = JSON.parse(stored)
  if (!Array.isArray(parsed)) {
    throw new Error('Saved Tests pipelines are invalid. Correct or remove them from browser storage.')
  }

  return parsed.map((value: unknown) => {
    if (!value || typeof value !== 'object') {
      throw new Error('Saved Tests pipelines are invalid.')
    }
    const entry = value as Record<string, unknown>
    if (
      typeof entry.id !== 'string' || !entry.id
      || typeof entry.orgName !== 'string' || !entry.orgName
      || typeof entry.projectName !== 'string' || !entry.projectName
      || (entry.kind !== 'build' && entry.kind !== 'release')
      || !Number.isSafeInteger(entry.definitionId) || (entry.definitionId as number) <= 0
      || typeof entry.name !== 'string' || !entry.name
      || typeof entry.stageName !== 'string' || !entry.stageName
      || (entry.stageDefinitionId !== undefined && (!Number.isSafeInteger(entry.stageDefinitionId) || (entry.stageDefinitionId as number) <= 0))
    ) {
      throw new Error('Saved Tests pipelines are invalid.')
    }
    return entry as TestPipeline
  })
}

export function saveTestPipelines(pipelines: TestPipeline[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pipelines))
}
