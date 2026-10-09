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
