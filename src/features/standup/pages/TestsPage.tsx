import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, CircularProgress, IconButton, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgChartLine from '@stratakit/icons/chart-line.svg'
import svgReport from '@stratakit/icons/report.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgTableRows from '@stratakit/icons/table-rows-comfortable.svg'
import { AdoHttpClient } from '../../../ado/httpClient'
import { loadTestPoints, type TestPoint } from '../../../ado/testPipelinesApi'
import type { TeamIterationOption } from '../../../ado/types'
import { AppTooltip as Tooltip } from '../components/AppTooltip'
import { PageToolbar } from '../components/PageToolbar'
import { SyncStatus } from '../components/SyncStatus'
import { TestHealthStrip } from '../components/TestHealthStrip'
import { TestPassChart, type TestChartFocus, type TestSeries } from '../components/TestPassChart'
import { TestRowsChart } from '../components/TestRowsChart'
import { TestsIntro } from '../components/TestsIntro'
import { TestsLoadingState } from '../components/TestsLoadingState'
import { TestsSettingsDialog } from '../components/TestsSettingsDialog'
import { TipLines } from '../components/TipLines'
import { useRememberedView } from '../hooks/useRememberedView'
import {
  DEFAULT_TEST_LOOKBACK_DAYS, loadTestLookbackDays, loadTestPipelines,
  saveTestLookbackDays, saveTestPipelines, testLookbackStart, testPipelineSource, testStageLabel, type TestPipeline,
  DEFAULT_TEST_PASS_RATE_FILTER, filterTestPointsByPassRate, loadTestPassRateFilter,
  saveTestPassRateFilter, type TestPassRateFilter,
  DEFAULT_TEST_DAILY_OPTIONS, groupTestPointsByDay, loadTestDailyOptions, saveTestDailyOptions, type TestDailyOptions,
  DEFAULT_TEST_HEALTH_OPTIONS, loadTestHealthOptions, saveTestHealthOptions, type TestHealthOptions,
} from '../utils/testPipelines'
import {
  createTestTimeAxis, pluralizeTests, TEST_HEALTH_STATUS_LABELS, testPipelineHealth, testPipelineShortName, testSeriesStyle,
  type TestHealthEntry,
} from '../utils/testHealth'
import { testPipelineErrorMessage } from '../utils/testPipelineErrors'
import { testSprintBands } from '../utils/testSprints'

// StrataKit has no categorical palette, so the third series color is a violet tuned for each color scheme.
const pageSx = (theme: Theme) => ({
  flex: 1, minHeight: 0, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2,
  '--tests-series-violet': 'oklch(55% 0.16 305)',
  // applyStyles is typed as emotion's CSSObject, which sx doesn't accept as is.
  ...(theme.applyStyles('dark', { '--tests-series-violet': 'oklch(72% 0.13 305)' }) as object),
})

type TestsPageProps = {
  pat: string | null
  defaultOrg: string
  defaultProject: string
  /** The selected team's sprints; projects share sprint dates, so these label every pipeline's timeline. */
  teamIterations?: TeamIterationOption[]
  rememberLastView?: boolean
}

const TEST_VIEWS = ['rows', 'overlay'] as const
type TestsView = (typeof TEST_VIEWS)[number]

export function TestsPage({ pat, defaultOrg, defaultProject, teamIterations = [], rememberLastView = false }: TestsPageProps) {
  const [view, setView] = useRememberedView('tests', TEST_VIEWS, rememberLastView)
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
  const [storedHealthOptions] = useState(() => {
    try {
      return { options: loadTestHealthOptions(), error: null }
    } catch (cause) {
      return { options: DEFAULT_TEST_HEALTH_OPTIONS, error: cause instanceof Error ? cause.message : String(cause) }
    }
  })
  const [healthOptions, setHealthOptions] = useState(storedHealthOptions.options)
  const [healthStorageError, setHealthStorageError] = useState(storedHealthOptions.error)
  const [error, setError] = useState<string | null>(stored.error)
  const [series, setSeries] = useState<Array<{ pipeline: TestPipeline; points: TestPoint[] }>>([])
  const [range, setRange] = useState<{ start: number; end: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncedAt, setSyncedAt] = useState<number | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [focusId, setFocusId] = useState<string | null>(null)
  const client = useMemo(() => pat ? new AdoHttpClient(pat) : null, [pat])
  // Only the fields that pick results; renaming a pipeline's short name doesn't refetch.
  const sourceKey = JSON.stringify(pipelines.map(testPipelineSource))
  const sources = useMemo(() => JSON.parse(sourceKey) as TestPipeline[], [sourceKey])
  const filteredSeries = useMemo(() => {
    // Styles follow the pipelines' order, so a pipeline keeps its color when another fails to load.
    const order = new Map(pipelines.map((pipeline, index) => [pipeline.id, index]))
    return series.map((entry) => ({
      pipeline: pipelines.find((pipeline) => pipeline.id === entry.pipeline.id) ?? entry.pipeline,
      ...testSeriesStyle(order.get(entry.pipeline.id) ?? 0),
      points: filterTestPointsByPassRate(entry.points, passRateFilter),
    }))
  }, [series, pipelines, passRateFilter])
  const chartSeries = useMemo<TestSeries[]>(() => filteredSeries.flatMap((entry) => {
    const points = groupTestPointsByDay(entry.points, dailyOptions)
    return points.length > 0 ? [{ ...entry, points }] : []
  }), [filteredSeries, dailyOptions])
  const axis = useMemo(() => range ? createTestTimeAxis(range) : null, [range])
  const sprints = useMemo(() => axis ? testSprintBands(teamIterations, axis) : [], [axis, teamIterations])
  // Health compares each run with the pipeline's own runs, so it uses every run, not the daily lowest.
  const healthEntries = useMemo<TestHealthEntry[]>(() => axis ? filteredSeries.flatMap(({ pipeline, points, color, shape }) => {
    const health = testPipelineHealth(points, axis, healthOptions)
    return health ? [{ pipeline, color, shape, health }] : []
  }) : [], [axis, filteredSeries, healthOptions])
  const focusedEntry = healthEntries.find((entry) => entry.pipeline.id === focusId) ?? null
  const chartFocus = useMemo<TestChartFocus | null>(() => focusedEntry
    ? { id: focusedEntry.pipeline.id, highPosition: focusedEntry.health.usualHighPosition, lowPosition: focusedEntry.health.usualLowPosition }
    : null, [focusedEntry])

  useEffect(() => {
    if (!focusedEntry || settingsOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setFocusId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusedEntry, settingsOpen])

  const updateHealthOptions = (next: TestHealthOptions) => {
    try {
      saveTestHealthOptions(next)
      setHealthOptions(next)
      setHealthStorageError(null)
      return null
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setHealthStorageError(message)
      return message
    }
  }

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
    if (!client || sources.length === 0) {
      setSeries([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const fetchedAt = Date.now()
    Promise.allSettled(sources.map(async (pipeline) => ({
      pipeline,
      points: await loadTestPoints(client, pipeline, lookbackDays, controller.signal),
    }))).then((results) => {
      if (controller.signal.aborted) return
      setSeries(results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []))
      setRange({ start: new Date(testLookbackStart(lookbackDays, fetchedAt)).getTime(), end: fetchedAt })
      setSyncedAt(Date.now())
      const failures = results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [`${sources[index].name}: ${testPipelineErrorMessage(result.reason)}`]
          : [])
      setError(failures.length ? failures.join(' · ') : null)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [client, sources, lookbackDays, refreshNonce])

  const canLoad = Boolean(pat) && pipelines.length > 0
  const healthSummary = healthEntries.map(({ pipeline, health }) =>
    `${testPipelineShortName(pipeline)} · ${testStageLabel(pipeline.stageName)}: ${TEST_HEALTH_STATUS_LABELS[health.status]}`)

  return (
    <>
      <PageToolbar iconHref={svgReport} title="Tests" isPageTitle wrap>
        {!loading && healthEntries.length > 0 && (
          <Tooltip title={<TipLines lines={healthSummary} />}>
            <Typography variant="body-sm" color="text.secondary" tabIndex={0} sx={{ whiteSpace: 'nowrap', ml: 0.5 }}>
              {pluralizeTests(healthEntries.length, 'pipeline')}
            </Typography>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        {canLoad && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Typography variant="body-sm" sx={{ fontWeight: 700, whiteSpace: 'nowrap', '@container (max-width: 960px)': { display: 'none' } }}>
              View
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_event, value: TestsView | null) => {
                if (value) setView(value)
              }}
              aria-label="Tests view"
            >
              <ToggleButton value="rows" render={<Button size="small" startIcon={<Icon href={svgTableRows} />} />}>
                Rows
              </ToggleButton>
              <ToggleButton value="overlay" render={<Button size="small" startIcon={<Icon href={svgChartLine} />} />}>
                Overlay
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}
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
        {canLoad && <TestsIntro lookbackDays={lookbackDays} daily={dailyOptions.enabled} view={view} />}
        {error && <Alert severity="error">{error}</Alert>}
        {lookbackStorageError && <Alert severity="error">{lookbackStorageError}</Alert>}
        {passRateFilterStorageError && <Alert severity="error">{passRateFilterStorageError}</Alert>}
        {dailyStorageError && <Alert severity="error">{dailyStorageError}</Alert>}
        {healthStorageError && <Alert severity="error">{healthStorageError}</Alert>}
        {loading && <TestsLoadingState pipelineCount={pipelines.length} lookbackDays={lookbackDays} view={view} />}
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
        {!loading && axis && healthEntries.length > 0 && (
          <TestHealthStrip
            entries={healthEntries}
            axis={axis}
            options={healthOptions}
            lookbackDays={lookbackDays}
            focusId={focusedEntry?.pipeline.id ?? null}
            onToggleFocus={(id) => setFocusId((current) => current === id ? null : id)}
          />
        )}
        {!loading && view === 'rows' && axis && healthEntries.length > 0 && (
          <TestRowsChart
            entries={healthEntries}
            axis={axis}
            sprints={sprints}
            lookbackDays={lookbackDays}
            focusId={focusedEntry?.pipeline.id ?? null}
            onToggleFocus={(id) => setFocusId((current) => current === id ? null : id)}
          />
        )}
        {!loading && view === 'overlay' && range && chartSeries.length > 0 && (
          <Box sx={{ height: 480, flexShrink: 0 }}>
            <TestPassChart series={chartSeries} range={range} focus={chartFocus} />
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
        healthOptions={healthOptions} onHealthOptionsChange={updateHealthOptions}
      />
    </>
  )
}
