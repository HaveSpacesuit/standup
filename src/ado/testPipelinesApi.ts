import type { AdoRequestClient, AdoRequestOptions } from './httpClient'
import { mapWithConcurrency } from './concurrency'
import { ALL_TEST_STAGES, type TestPipeline, type TestPipelineKind } from '../features/standup/utils/testPipelines'
import { testLookbackStart } from '../features/standup/utils/testPipelines'

type List<T> = { value: T[] }
export type Definition = { id: number; name: string }
type Build = { id: number; finishTime?: string; status?: string }
type Release = { id: number; createdOn?: string }
type ReleaseDetail = { environments?: Array<{
  id: number; name: string; definitionEnvironmentId: number; status?: string
  deploySteps?: Array<{ lastModifiedOn?: string }>
}> }
type Timeline = { records?: Array<{ type: string; name: string }> }
type OutcomeCount = { count: number; outcome?: string }
type Metrics = {
  resultSummary?: {
    resultSummaryByRunState?: Record<string, {
      aggregatedResultDetailsByOutcome?: Record<string, OutcomeCount>
    }>
  }
}
type ReleaseResults = {
  resultsForGroup?: Array<{ resultsCountByOutcome?: Record<string, OutcomeCount> }>
}

export type TestPoint = { date: string; passed: number; total: number; runId: number }
export type StageOption = { name: string; definitionId?: number; resultCount: number | null }

const projectPath = (project: string) => `/${encodeURIComponent(project)}`

export class TestResultsNetworkError extends Error {
  constructor(cause: TypeError) {
    super('The Azure DevOps test-results service could not be reached from the browser.', { cause })
    this.name = 'TestResultsNetworkError'
  }
}

async function requestTestResults<T>(client: AdoRequestClient, options: AdoRequestOptions): Promise<T> {
  try {
    return await client.request<T>({ ...options, host: 'vstmr.dev.azure.com' })
  } catch (error) {
    if (error instanceof TypeError && !options.signal?.aborted) {
      throw new TestResultsNetworkError(error)
    }
    throw error
  }
}

export async function listTestPipelineDefinitions(
  client: AdoRequestClient,
  orgName: string,
  projectName: string,
  kind: TestPipelineKind,
  signal?: AbortSignal,
  searchText = '',
): Promise<Definition[]> {
  const path = kind === 'build' ? '_apis/build/definitions' : '_apis/release/definitions'
  const response = await client.request<List<Definition>>({
    orgName,
    path: `${projectPath(projectName)}/${path}`,
    host: kind === 'release' ? 'vsrm.dev.azure.com' : undefined,
    params: {
      '$top': 100,
      ...(searchText.trim()
        ? kind === 'build'
          ? { name: `*${searchText.trim()}*` }
          : { searchText: searchText.trim() }
        : {}),
    },
    signal,
  })
  return response.value.sort((a, b) => a.name.localeCompare(b.name))
}

async function listHistoryPages<T>(client: AdoRequestClient, options: AdoRequestOptions, label: string): Promise<T[]> {
  const items: T[] = []
  let continuationToken: string | null = null
  const visited = new Set<string>()
  do {
    const page: { data: List<T>; continuationToken: string | null } = await client.requestPage<List<T>>({
      ...options,
      params: { ...options.params, continuationToken: continuationToken ?? undefined },
    })
    items.push(...page.data.value)
    continuationToken = page.continuationToken
    if (continuationToken && visited.has(continuationToken)) {
      throw new Error(`Azure DevOps repeated the ${label} history continuation token.`)
    }
    if (continuationToken) visited.add(continuationToken)
  } while (continuationToken)
  return items
}

async function listBuilds(client: AdoRequestClient, pipeline: Pick<TestPipeline, 'orgName' | 'projectName' | 'definitionId'>, signal?: AbortSignal, since?: string): Promise<Build[]> {
  const options: AdoRequestOptions = {
    orgName: pipeline.orgName,
    path: `${projectPath(pipeline.projectName)}/_apis/build/builds`,
    params: {
      definitions: pipeline.definitionId, '$top': since ? 100 : 30,
      queryOrder: 'finishTimeDescending', statusFilter: 'completed', minTime: since,
    },
    signal,
  }
  return since
    ? listHistoryPages<Build>(client, options, 'build')
    : (await client.request<List<Build>>(options)).value
}

async function listReleases(client: AdoRequestClient, pipeline: Pick<TestPipeline, 'orgName' | 'projectName' | 'definitionId'>, since: string, signal?: AbortSignal): Promise<Release[]> {
  return listHistoryPages<Release>(client, {
    orgName: pipeline.orgName,
    host: 'vsrm.dev.azure.com',
    path: `${projectPath(pipeline.projectName)}/_apis/release/releases`,
    params: { definitionId: pipeline.definitionId, minCreatedTime: since, '$top': 100, queryOrder: 'descending' },
    signal,
  }, 'release')
}

async function getRelease(client: AdoRequestClient, orgName: string, projectName: string, releaseId: number, signal?: AbortSignal): Promise<ReleaseDetail> {
  return client.request<ReleaseDetail>({
    orgName,
    host: 'vsrm.dev.azure.com',
    path: `${projectPath(projectName)}/_apis/release/releases/${releaseId}`,
    signal,
  })
}

export async function listTestStages(
  client: AdoRequestClient,
  pipeline: Pick<TestPipeline, 'orgName' | 'projectName' | 'kind' | 'definitionId'>,
  signal?: AbortSignal,
): Promise<StageOption[]> {
  if (pipeline.kind === 'release') {
    const definition = await client.request<{ environments: Array<{ id: number; name: string }> }>({
      orgName: pipeline.orgName,
      host: 'vsrm.dev.azure.com',
      path: `${projectPath(pipeline.projectName)}/_apis/release/definitions/${pipeline.definitionId}`,
      signal,
    })
    return definition.environments.map((environment) => ({ name: environment.name, definitionId: environment.id, resultCount: null }))
  }

  const builds = await listBuilds(client, pipeline, signal)
  const stageNames = new Set<string>()
  for (const build of builds.slice(0, 3)) {
    const timeline = await client.request<Timeline>({
      orgName: pipeline.orgName,
      path: `${projectPath(pipeline.projectName)}/_apis/build/builds/${build.id}/timeline`,
      signal,
    })
    for (const record of timeline.records ?? []) {
      if (record.type === 'Stage') {
        stageNames.add(record.name)
      }
    }
  }
  const stageOptions = await Promise.all([...stageNames].map(async (name) => {
    const latest = builds[0]
    if (!latest) {
      return { name, resultCount: null }
    }
    const metrics = await getBuildMetrics(client, pipeline.orgName, pipeline.projectName, latest.id, name, signal)
    return { name, resultCount: metrics?.total ?? null }
  }))
  return [{ name: ALL_TEST_STAGES, resultCount: null }, ...stageOptions]
}

function outcomeCounts(outcomes: Record<string, OutcomeCount>): { passed: number; total: number } {
  return Object.entries(outcomes).reduce((counts, [key, value]) => {
    if (!Number.isSafeInteger(value.count) || value.count < 0) {
      throw new Error('Azure DevOps returned an invalid test result count.')
    }
    const outcome = (value.outcome ?? key).toLowerCase()
    if (!['notimpacted', 'notexecuted', 'notapplicable', 'skipped'].includes(outcome)) {
      counts.total += value.count
      if (outcome === 'passed') counts.passed += value.count
    }
    return counts
  }, { passed: 0, total: 0 })
}

async function getBuildMetrics(
  client: AdoRequestClient, orgName: string, projectName: string, buildId: number, stageName: string, signal?: AbortSignal,
): Promise<{ passed: number; total: number } | null> {
  const metrics = await requestTestResults<Metrics>(client, {
    orgName,
    path: `${projectPath(projectName)}/_apis/testresults/metrics`,
    params: { pipelineId: buildId, stageName: stageName === ALL_TEST_STAGES ? undefined : stageName, metricNames: 'ResultSummary', 'api-version': '7.1-preview.1' },
    signal,
  })
  const states = metrics.resultSummary?.resultSummaryByRunState
  if (!states) return null
  const counts = Object.entries(states).reduce((sum, [state, value]) => {
    if (state.toLowerCase() !== 'completed' && state.toLowerCase() !== 'needinvestigation') return sum
    const outcome = outcomeCounts(value.aggregatedResultDetailsByOutcome ?? {})
    return { passed: sum.passed + outcome.passed, total: sum.total + outcome.total }
  }, { passed: 0, total: 0 })
  return counts.total > 0 ? counts : null
}

export async function loadTestPoints(client: AdoRequestClient, pipeline: TestPipeline, lookbackDays: number, signal?: AbortSignal): Promise<TestPoint[]> {
  const since = testLookbackStart(lookbackDays)
  if (pipeline.kind === 'build') {
    const builds = await listBuilds(client, pipeline, signal, since)
    const results = await mapWithConcurrency(builds.filter((build) => build.finishTime && build.finishTime >= since), 5, async (build) => {
      const counts = await getBuildMetrics(client, pipeline.orgName, pipeline.projectName, build.id, pipeline.stageName, signal)
      return counts ? { date: build.finishTime!, runId: build.id, ...counts } : null
    })
    return results.filter((point): point is TestPoint => point !== null).sort((a, b) => a.date.localeCompare(b.date))
  }

  const releases = await listReleases(client, pipeline, since, signal)
  const results = await mapWithConcurrency(releases, 5, async (release) => {
    const detail = await getRelease(client, pipeline.orgName, pipeline.projectName, release.id, signal)
    const environment = detail.environments?.find((entry) =>
      pipeline.stageDefinitionId
        ? entry.definitionEnvironmentId === pipeline.stageDefinitionId
        : entry.name === pipeline.stageName)
    if (!environment) {
      return null
    }
    if (environment.status && ['notStarted', 'inProgress', 'scheduled', 'queued'].includes(environment.status)) {
      return null
    }
    const response = await requestTestResults<ReleaseResults>(client, {
      orgName: pipeline.orgName,
      path: `${projectPath(pipeline.projectName)}/_apis/testresults/resultdetailsbyrelease`,
      params: { releaseId: release.id, releaseEnvId: environment.id, 'api-version': '7.1-preview.1' },
      signal,
    })
    const groups = response.resultsForGroup ?? []
    const counts = groups.map((group) => outcomeCounts(group.resultsCountByOutcome ?? {}))
    const total = counts.reduce((sum, value) => sum + value.total, 0)
    const date = environment.deploySteps?.map((step) => step.lastModifiedOn).filter((value): value is string => Boolean(value)).sort().at(-1)
      ?? release.createdOn
    return date && date >= since && total ? {
      date, runId: release.id,
      passed: counts.reduce((sum, value) => sum + value.passed, 0),
      total,
    } : null
  })
  return results.filter((point): point is TestPoint => point !== null).sort((a, b) => a.date.localeCompare(b.date))
}
