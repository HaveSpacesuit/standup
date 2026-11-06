import { useEffect, useState } from 'react'
import type { AdoRequestClient } from '../../../ado/httpClient'
import { loadFailingTests, type FailingTest, type FailingTests } from '../../../ado/testPipelinesApi'
import type { TestRun } from '../utils/testHealth'
import { testPipelineErrorMessage } from '../utils/testPipelineErrors'
import { testPipelineSource, type TestPipeline } from '../utils/testPipelines'

/** `isNew` is null when there's no previous run to compare with, or its list couldn't be read in full. */
export type LabeledFailingTest = FailingTest & { isNew: boolean | null }

export type FailingTestsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; tests: LabeledFailingTest[]; truncated: boolean }

/** Completed lists, by pipeline source and run; a run's results don't change once it reports them. */
export type FailingTestsCache = Map<string, FailingTests>

const IDLE: FailingTestsState = { status: 'idle' }
const LOADING: FailingTestsState = { status: 'loading' }

/**
 * Reads the selected run's failing tests, only while a run with failures is selected, and labels each as new or
 * failing again against the run before it. Switching runs cancels the request in flight.
 */
export function useFailingTests(
  client: AdoRequestClient | null,
  pipeline: TestPipeline | null,
  run: TestRun | null,
  previous: TestRun | null,
  cache: FailingTestsCache,
): FailingTestsState {
  const source = pipeline ? JSON.stringify(testPipelineSource(pipeline)) : null
  const key = client && source && run && run.failed > 0
    ? `${source}:${run.runId}:${previous ? `${previous.runId}:${previous.failed}` : '-'}`
    : null
  const [result, setResult] = useState<{ key: string; state: FailingTestsState } | null>(null)

  useEffect(() => {
    if (!key || !client || !pipeline || !run) return
    const controller = new AbortController()
    const load = async (point: TestRun) => {
      const cacheKey = `${source}:${point.runId}`
      const cached = cache.get(cacheKey)
      if (cached) return cached
      const loaded = await loadFailingTests(client, pipeline, point, controller.signal)
      cache.set(cacheKey, loaded)
      return loaded
    }
    const label = async () => {
      const current = await load(run)
      let newKeys: Set<string> | null = null
      if (previous && previous.failed === 0) {
        newKeys = new Set(current.tests.map((test) => test.key))
      } else if (previous) {
        try {
          const before = await load(previous)
          if (!before.truncated) {
            const failedBefore = new Set(before.tests.map((test) => test.key))
            newKeys = new Set(current.tests.filter((test) => !failedBefore.has(test.key)).map((test) => test.key))
          }
        } catch (error) {
          // Without the previous run's list, the tests still show, just unlabeled.
          if (controller.signal.aborted) throw error
        }
      }
      const tests = current.tests.map((test): LabeledFailingTest => ({ ...test, isNew: newKeys ? newKeys.has(test.key) : null }))
      tests.sort((left, right) => Number(right.isNew === true) - Number(left.isNew === true))
      return { status: 'loaded', tests, truncated: current.truncated } as const
    }
    label().then(
      (state) => {
        if (!controller.signal.aborted) setResult({ key, state })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, state: { status: 'error', message: testPipelineErrorMessage(error) } })
      },
    )
    return () => controller.abort()
    // The key covers the pipeline's source and both runs; the objects change identity on every health pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client, cache])

  if (!key) return IDLE
  return result?.key === key ? result.state : LOADING
}
