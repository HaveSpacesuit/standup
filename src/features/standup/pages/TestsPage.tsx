import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, IconButton, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgReport from '@stratakit/icons/report.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import { AdoHttpClient } from '../../../ado/httpClient'
import { loadTestPoints } from '../../../ado/testPipelinesApi'
import { PageToolbar } from '../components/PageToolbar'
import { TestPassChart, type TestSeries } from '../components/TestPassChart'
import { TestsLoadingState } from '../components/TestsLoadingState'
import { TestsSettingsDialog } from '../components/TestsSettingsDialog'
import {
  DEFAULT_TEST_LOOKBACK_DAYS, loadTestLookbackDays, loadTestPipelines,
  saveTestLookbackDays, saveTestPipelines, testStageLabel, type TestPipeline,
} from '../utils/testPipelines'
import { testPipelineErrorMessage } from '../utils/testPipelineErrors'

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
  const [error, setError] = useState<string | null>(stored.error)
  const [series, setSeries] = useState<TestSeries[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const client = useMemo(() => pat ? new AdoHttpClient(pat) : null, [pat])

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
    Promise.allSettled(pipelines.map(async (pipeline) => ({
      pipeline,
      points: await loadTestPoints(client, pipeline, lookbackDays, controller.signal),
    }))).then((results) => {
      if (controller.signal.aborted) return
      setSeries(results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []))
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

  return (
    <>
      <PageToolbar iconHref={svgReport} title="Tests">
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" label="Tests settings" onClick={() => setSettingsOpen(true)}>
          <Icon href={svgSettings} />
        </IconButton>
        <IconButton size="small" aria-label="Refresh tests" disabled={loading || !pat || pipelines.length === 0} onClick={() => setRefreshNonce((value) => value + 1)}>
          <Icon href={svgCloudSync} />
        </IconButton>
      </PageToolbar>

      <Box component="main" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography render={<h1 />} variant="headline-sm">E2E test pass rates</Typography>
        <Typography variant="body-sm" color="text.secondary">
          Passed / executed test results (excluding skipped and NotImpacted), per completed build or release stage. Each point is one run; the vertical scale expands differences near 100%.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {lookbackStorageError && <Alert severity="error">{lookbackStorageError}</Alert>}
        {loading && <TestsLoadingState pipelineCount={pipelines.length} lookbackDays={lookbackDays} />}
        {!pat && <Alert severity="info">Add an Azure DevOps PAT with Test Management (Read) access to load test results.</Alert>}
        {pipelines.length === 0 && !error && (
          <Typography variant="body-md" color="text.secondary">
            Add a build or release pipeline in Tests settings to start tracking test pass rates.
          </Typography>
        )}
        {pat && pipelines.length > 0 && !loading && series.every(({ points }) => points.length === 0) && !error && (
          <Alert severity="info">No published test results were found for the selected stages in the last {lookbackDays} days.</Alert>
        )}
        {!loading && series.some(({ points }) => points.length > 0) && (
          <Box sx={{ height: 480, flexShrink: 0 }}>
            <TestPassChart series={series.filter(({ points }) => points.length > 0)} />
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
      />
    </>
  )
}
