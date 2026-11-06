import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, CircularProgress, IconButton, Typography } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgReport from '@stratakit/icons/report.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import { AdoHttpClient } from '../../../ado/httpClient'
import { loadTestPoints, type TestPoint } from '../../../ado/testPipelinesApi'
import { AppTooltip as Tooltip } from '../components/AppTooltip'
import { PageToolbar } from '../components/PageToolbar'
import { SyncStatus } from '../components/SyncStatus'
import { TestPassChart, type TestSeries } from '../components/TestPassChart'
import { TestsIntro } from '../components/TestsIntro'
import { TestsLoadingState } from '../components/TestsLoadingState'
import { TestsSettingsDialog } from '../components/TestsSettingsDialog'
import {
  DEFAULT_TEST_LOOKBACK_DAYS, loadTestLookbackDays, loadTestPipelines,
  saveTestLookbackDays, saveTestPipelines, testLookbackStart, testStageLabel, type TestPipeline,
  DEFAULT_TEST_PASS_RATE_FILTER, filterTestPointsByPassRate, loadTestPassRateFilter,
  saveTestPassRateFilter, type TestPassRateFilter,
  DEFAULT_TEST_DAILY_OPTIONS, groupTestPointsByDay, loadTestDailyOptions, saveTestDailyOptions, type TestDailyOptions,
} from '../utils/testPipelines'
import { testSeriesStyle } from '../utils/testHealth'
import { testPipelineErrorMessage } from '../utils/testPipelineErrors'

// StrataKit has no categorical palette, so the third series color is a violet tuned for each color scheme.
const pageSx = (theme: Theme) => ({
  flex: 1, minHeight: 0, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2,
  '--tests-series-violet': 'oklch(55% 0.16 305)',
  // applyStyles is typed as emotion's CSSObject, which sx doesn't accept as is.
  ...(theme.applyStyles('dark', { '--tests-series-violet': 'oklch(72% 0.13 305)' }) as object),
})

type TestsPageProps = { pat: string | null; defaultOrg: string; defaultProject: string }

export function TestsPage({ pat, defaultOrg, defaultProject }: TestsPageProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [stored] = useState(() => {
    try {
      return { pipelines: loadTestPipelines(), error: null }
    } catch (cause) {
      return { pipelines: [] as TestPipeline[], error: cause instanceof Error ? cause.message : String(cause) }
    }
  })
  const [pipelines, setPipelines] = useState(stored.pipelines)
  const [storedLookback] = useState(() => {
    try {
      return { days: loadTestLookbackDays(), error: null }
    } catch (cause) {
      return { days: DEFAULT_TEST_LOOKBACK_DAYS, error: cause instanceof Error ? cause.message : String(cause) }
    }
  })
  const [lookbackDays, setLookbackDays] = useState(storedLookback.days)
  const [lookbackStorageError, setLookbackStorageError] = useState(storedLookback.error)
  const [storedPassRateFilter] = useState(() => {
    try {
      return { filter: loadTestPassRateFilter(), error: null }
    } catch (cause) {
      return { filter: DEFAULT_TEST_PASS_RATE_FILTER, error: cause instanceof Error ? cause.message : String(cause) }
    }
  })
  const [passRateFilter, setPassRateFilter] = useState(storedPassRateFilter.filter)
  const [passRateFilterStorageError, setPassRateFilterStorageError] = useState(storedPassRateFilter.error)
  const [storedDailyOptions] = useState(() => {
    try {
      return { options: loadTestDailyOptions(), error: null }
    } catch (cause) {
      return { options: DEFAULT_TEST_DAILY_OPTIONS, error: cause instanceof Error ? cause.message : String(cause) }
    }
  })
  const [dailyOptions, setDailyOptions] = useState(storedDailyOptions.options)
  const [dailyStorageError, setDailyStorageError] = useState(storedDailyOptions.error)
  const [error, setError] = useState<string | null>(stored.error)
  const [series, setSeries] = useState<Array<{ pipeline: TestPipeline; points: TestPoint[] }>>([])
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const client = useMemo(() => pat ? new AdoHttpClient(pat) : null, [pat])
  const filteredSeries = useMemo<TestSeries[]>(() => {
    // Styles follow the pipelines' order, so a pipeline keeps its color when another fails to load.
    const order = new Map(pipelines.map((pipeline, index) => [pipeline.id, index]))
    return series.map((entry) => ({
      ...entry,
      ...testSeriesStyle(order.get(entry.pipeline.id) ?? 0),
      points: groupTestPointsByDay(filterTestPointsByPassRate(entry.points, passRateFilter), dailyOptions),
    }))
  }, [series, pipelines, passRateFilter, dailyOptions])

  const updateDailyOptions = (next: TestDailyOptions) => {
    try {
      saveTestDailyOptions(next)
      setDailyOptions(next)
      setDailyStorageError(null)
      return null
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setDailyStorageError(message)
      return message
    }
  }

  const updatePassRateFilter = (next: TestPassRateFilter) => {
    try {
      saveTestPassRateFilter(next)
      setPassRateFilter(next)
      setPassRateFilterStorageError(null)
      return null
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setPassRateFilterStorageError(message)
      return message
    }
  }

  const updatePipelines = (next: TestPipeline[]) => {
    try {
      saveTestPipelines(next)
      setPipelines(next)
      setError(null)
      return null
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      return message
    }
  }

  const updateLookbackDays = (days: number) => {
    try {
      saveTestLookbackDays(days)
      setLookbackDays(days)
      setLookbackStorageError(null)
      setError(null)
      return null
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
      return message
    }
  }

  useEffect(() => {
    if (!client || pipelines.length === 0) {
      setSeries([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const fetchedAt = Date.now()
    Promise.allSettled(pipelines.map(async (pipeline) => ({
      pipeline,
      points: await loadTestPoints(client, pipeline, lookbackDays, controller.signal),
    }))).then((results) => {
      if (controller.signal.aborted) return
      setSeries(results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []))
      setRange({ start: new Date(testLookbackStart(lookbackDays, fetchedAt)).getTime(), end: fetchedAt })
      setSyncedAt(Date.now())
      const failures = results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [`${pipelines[index].name}: ${testPipelineErrorMessage(result.reason)}`]
          : [])
      setError(failures.length ? failures.join(' · ') : null)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [client, pipelines, lookbackDays, refreshNonce])

  const canLoad = Boolean(pat) && pipelines.length > 0

  return (
    <>
      <PageToolbar iconHref={svgReport} title="Tests" isPageTitle wrap>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Test options">
          <span>
            <IconButton size="small" aria-label="Test options" onClick={() => setSettingsOpen(true)}>
              <Icon href={svgSettings} />
            </IconButton>
          </span>
        </Tooltip>
        <SyncStatus syncedAt={canLoad ? syncedAt : null} isLoading={canLoad && loading} />
        <Tooltip title="Refresh">
          <span>
            <IconButton
              size="small"
              aria-label="Refresh"
              aria-busy={loading || undefined}
              disabled={loading || !canLoad}
              onClick={() => setRefreshNonce((value) => value + 1)}
            >
              {loading && canLoad
                ? <CircularProgress size={16} aria-hidden="true" />
                : <Icon href={svgCloudSync} />}
            </IconButton>
          </span>
        </Tooltip>
      </PageToolbar>

      <Box component="main" sx={pageSx}>
        {canLoad && <TestsIntro lookbackDays={lookbackDays} daily={dailyOptions.enabled} />}
        {error && <Alert severity="error">{error}</Alert>}
        {lookbackStorageError && <Alert severity="error">{lookbackStorageError}</Alert>}
        {passRateFilterStorageError && <Alert severity="error">{passRateFilterStorageError}</Alert>}
        {dailyStorageError && <Alert severity="error">{dailyStorageError}</Alert>}
        {loading && <TestsLoadingState pipelineCount={pipelines.length} lookbackDays={lookbackDays} />}
        {!pat && <Alert severity="info">Add an Azure DevOps PAT with Test Management (Read) access to load test results.</Alert>}
        {pipelines.length === 0 && !error && (
          <Typography variant="body-md" color="text.secondary">
            Add a build or release pipeline in Test options to start tracking test pass rates.
          </Typography>
        )}
        {pat && pipelines.length > 0 && !loading && series.every(({ points }) => points.length === 0) && !error && (
          <Alert severity="info">No published test results were found for the selected stages in the last {lookbackDays} days.</Alert>
        )}
        {!loading && filteredSeries.some((entry, index) => entry.points.length === 0 && series[index].points.length > 0) && (
          <Alert severity="info">Some pipelines have no chart points above the {passRateFilter.threshold}% pass rate threshold. Lower the threshold or disable the filter in Test options to show more results.</Alert>
        )}
        {!loading && range && filteredSeries.some(({ points }) => points.length > 0) && (
          <Box sx={{ height: 480, flexShrink: 0 }}>
            <TestPassChart series={filteredSeries.filter(({ points }) => points.length > 0)} range={range} />
          </Box>
        )}
        {!loading && series.filter(({ points }) => points.length === 0).map(({ pipeline }) => (
          <Alert key={pipeline.id} severity="info">No published results for {pipeline.name} · {testStageLabel(pipeline.stageName)} in the last {lookbackDays} days.</Alert>
        ))}
      </Box>

      <TestsSettingsDialog
        open={settingsOpen} onClose={() => setSettingsOpen(false)} pat={pat}
        defaultOrg={defaultOrg} defaultProject={defaultProject}
        pipelines={pipelines} onChange={updatePipelines}
        lookbackDays={lookbackDays} onLookbackDaysChange={updateLookbackDays}
        passRateFilter={passRateFilter} onPassRateFilterChange={updatePassRateFilter}
        dailyOptions={dailyOptions} onDailyOptionsChange={updateDailyOptions}
      />
    </>
  )
}
