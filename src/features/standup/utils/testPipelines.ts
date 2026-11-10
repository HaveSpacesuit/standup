
export type TestPipelineKind = 'build' | 'release'
export const ALL_TEST_STAGES = '__all__'

export function testStageLabel(stageName: string): string {
  return stageName === ALL_TEST_STAGES ? 'Entire pipeline' : stageName
}

export type TestPipeline = {
  id: string
  orgName: string
  projectName: string
  kind: TestPipelineKind
  definitionId: number
  name: string
  stageName: string
  stageDefinitionId?: number
  /** Replaces the name's parenthetical on tiles, rows, and tooltips. */
  shortName?: string
}

/** The fields that decide which results load, so editing a short name doesn't refetch. */
export function testPipelineSource(pipeline: TestPipeline): TestPipeline {
  const { id, orgName, projectName, kind, definitionId, name, stageName, stageDefinitionId } = pipeline
  return { id, orgName, projectName, kind, definitionId, name, stageName, stageDefinitionId }
}

export const TEST_SHORT_NAME_MAX_LENGTH = 24

const STORAGE_KEY = 'standup:test-pipelines'
const LOOKBACK_STORAGE_KEY = 'standup:test-lookback-days'
const PASS_RATE_FILTER_STORAGE_KEY = 'standup:test-pass-rate-filter'
const HEALTH_STORAGE_KEY = 'standup:test-health-options'

/** When a pipeline counts as stale, and how few tests make a run "fewer tests". */
export type TestHealthOptions = { staleDays: number; fewerPercent: number }
export const DEFAULT_TEST_HEALTH_OPTIONS: TestHealthOptions = { staleDays: 2, fewerPercent: 80 }

export function validateTestHealthOptions(options: TestHealthOptions): void {
  if (!Number.isSafeInteger(options.staleDays) || options.staleDays < 1 || options.staleDays > 30) {
    throw new Error('Flag pipelines after a whole number of working days from 1 to 30.')
  }
  if (!Number.isFinite(options.fewerPercent) || options.fewerPercent <= 0 || options.fewerPercent > 100) {
    throw new Error('The fewer tests threshold must be more than 0% and at most 100%.')
  }
}

export function loadTestHealthOptions(): TestHealthOptions {
  const stored = localStorage.getItem(HEALTH_STORAGE_KEY)
  if (stored === null) return { ...DEFAULT_TEST_HEALTH_OPTIONS }
  const parsed: unknown = JSON.parse(stored)
  if (!parsed || typeof parsed !== 'object' || !('staleDays' in parsed) || !('fewerPercent' in parsed)
    || typeof parsed.staleDays !== 'number' || typeof parsed.fewerPercent !== 'number') {
    throw new Error('Saved Tests health options are invalid. Correct or remove them from browser storage.')
  }
  const options = { staleDays: parsed.staleDays, fewerPercent: parsed.fewerPercent }
  validateTestHealthOptions(options)
  return options
}

export function saveTestHealthOptions(options: TestHealthOptions): void {
  validateTestHealthOptions(options)
  localStorage.setItem(HEALTH_STORAGE_KEY, JSON.stringify(options))
}

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

export const DEFAULT_TEST_LOOKBACK_DAYS = 60
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
      || (entry.shortName !== undefined && (typeof entry.shortName !== 'string' || entry.shortName.length > TEST_SHORT_NAME_MAX_LENGTH))
    ) {
      throw new Error('Saved Tests pipelines are invalid.')
    }
    return entry as TestPipeline
  })
}

export function saveTestPipelines(pipelines: TestPipeline[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pipelines))
}
