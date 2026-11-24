import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, Tab, Tabs, TextField, Typography,
  useMediaQuery,
} from '@mui/material'
import { AdoHttpClient } from '../../../ado/httpClient'
import { listTestPipelineDefinitions, listTestStages, type Definition, type StageOption } from '../../../ado/testPipelinesApi'
import {
  TEST_SHORT_NAME_MAX_LENGTH, testLookbackStart, testStageLabel, validateTestHealthOptions, validateTestPassRateFilter,
  type TestHealthOptions, type TestPassRateFilter, type TestPipeline, type TestPipelineKind, type TestSettings,
} from '../utils/testPipelines'
import { defaultTestPipelineShortName } from '../utils/testHealth'
import { testPipelineErrorMessage } from '../utils/testPipelineErrors'

type Props = {
  open: boolean
  onClose: () => void
  pat: string | null
  defaultOrg: string
  defaultProject: string
  pipelines: TestPipeline[]
  onSave: (settings: TestSettings) => string | null
  lookbackDays: number
  passRateFilter: TestPassRateFilter
  healthOptions: TestHealthOptions
}

const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur()
}

export function TestsSettingsDialog({
  open, onClose, pat, defaultOrg, defaultProject, pipelines: savedPipelines, onSave, lookbackDays, passRateFilter, healthOptions,
}: Props) {
  const isMobile = useMediaQuery('(max-width:599.95px)')
  const contentRef = useRef<HTMLDivElement>(null)
  const [validationAttempt, setValidationAttempt] = useState(0)
  useEffect(() => {
    if (validationAttempt > 0) contentRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [validationAttempt])
  const [pipelines, setPipelines] = useState(savedPipelines)
  const [filterEnabled, setFilterEnabled] = useState(passRateFilter.enabled)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [orgName, setOrgName] = useState(defaultOrg)
  const [projectName, setProjectName] = useState(defaultProject)
  const [kind, setKind] = useState<TestPipelineKind>('build')
  const [selectedDefinition, setSelectedDefinition] = useState<Definition | null>(null)
  const [selectedStage, setSelectedStage] = useState<StageOption | null>(null)
  const [definitionSearch, setDefinitionSearch] = useState('')
  const [definitions, setDefinitions] = useState<Definition[]>([])
  const [stages, setStages] = useState<StageOption[]>([])
  const [loadingDefinitions, setLoadingDefinitions] = useState(false)
  const [loadingStages, setLoadingStages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookbackInput, setLookbackInput] = useState(String(lookbackDays))
  const [lookbackError, setLookbackError] = useState<string | null>(null)
  const [thresholdInput, setThresholdInput] = useState(String(passRateFilter.threshold))
  const [thresholdError, setThresholdError] = useState<string | null>(null)
  const [staleInput, setStaleInput] = useState(String(healthOptions.staleDays))
  const [staleError, setStaleError] = useState<string | null>(null)
  const [fewerInput, setFewerInput] = useState(String(healthOptions.fewerPercent))
  const [fewerError, setFewerError] = useState<string | null>(null)
  const client = useMemo(() => pat ? new AdoHttpClient(pat) : null, [pat])

  useEffect(() => {
    if (open) {
      setActiveTab(0)
      setPipelines(savedPipelines)
      setFilterEnabled(passRateFilter.enabled)
      setSaveError(null)
      setValidationAttempt(0)
      setOrgName(defaultOrg)
      setProjectName(defaultProject)
      setSelectedDefinition(null)
      setSelectedStage(null)
      setDefinitionSearch('')
      setStaleInput(String(healthOptions.staleDays))
      setFewerInput(String(healthOptions.fewerPercent))
      setStaleError(null)
      setFewerError(null)
      setLookbackInput(String(lookbackDays))
      setLookbackError(null)
      setThresholdInput(String(passRateFilter.threshold))
      setThresholdError(null)
    }
    // New drafts use the applied settings each time the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const checkHealthOption = (field: keyof TestHealthOptions, input: string, setFieldError: (message: string | null) => void) => {
    const next = { ...healthOptions, [field]: input.trim() ? Number(input) : Number.NaN }
    try {
      validateTestHealthOptions(next)
      setFieldError(null)
      return true
    } catch (cause) {
      setFieldError(cause instanceof Error ? cause.message : String(cause))
      return false
    }
  }

  const updateShortName = (pipeline: TestPipeline, input: string) => {
    const shortName = input || undefined
    updatePipelinesDraft(pipelines.map((entry) => entry.id === pipeline.id ? { ...entry, shortName } : entry))
  }

  const checkPassRateFilter = () => {
    try {
      if (filterEnabled && !thresholdInput.trim()) {
        throw new Error('Enter a pass rate threshold between 0 and 100 inclusive.')
      }
      const next = { enabled: filterEnabled, threshold: filterEnabled ? Number(thresholdInput) : passRateFilter.threshold }
      validateTestPassRateFilter(next)
      setThresholdError(null)
      return true
    } catch (cause) {
      setThresholdError(cause instanceof Error ? cause.message : String(cause))
      return false
    }
  }

  const checkLookback = () => {
    const days = Number(lookbackInput)
    try {
      testLookbackStart(days)
      setLookbackError(null)
      return true
    } catch (cause) {
      setLookbackError(cause instanceof Error ? cause.message : String(cause))
      return false
    }
  }

  const updatePipelinesDraft = (next: TestPipeline[]) => {
    setPipelines(next)
    setError(null)
  }

  const handleSave = () => {
    const validLookback = checkLookback()
    const validFilter = checkPassRateFilter()
    const validStale = checkHealthOption('staleDays', staleInput, setStaleError)
    const validFewer = checkHealthOption('fewerPercent', fewerInput, setFewerError)
    if (!validLookback || !validFilter || !validStale || !validFewer) {
      setActiveTab(0)
      setValidationAttempt((attempt) => attempt + 1)
      return
    }
    const nextPipelines = pipelines.map((entry) => ({ ...entry, shortName: entry.shortName?.trim() || undefined }))
    const nextHealth = { staleDays: Number(staleInput), fewerPercent: Number(fewerInput) }
    const nextFilter = { enabled: filterEnabled, threshold: filterEnabled ? Number(thresholdInput) : passRateFilter.threshold }
    const failure = onSave({
      pipelines: nextPipelines, lookbackDays: Number(lookbackInput), passRateFilter: nextFilter, healthOptions: nextHealth,
    })
    if (failure) {
      setSaveError(failure)
      return
    }
    onClose()
  }

  useEffect(() => {
    setDefinitions([])
    setSelectedDefinition(null)
    setSelectedStage(null)
    setStages([])
    if (!open || !client || !orgName.trim() || !projectName.trim()) {
      setLoadingDefinitions(false)
      return
    }
    const controller = new AbortController()
    setLoadingDefinitions(true)
    setError(null)
    const timer = setTimeout(() => {
      listTestPipelineDefinitions(client, orgName.trim(), projectName.trim(), kind, controller.signal, definitionSearch)
        .then(setDefinitions)
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(testPipelineErrorMessage(cause))
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingDefinitions(false)
        })
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, client, orgName, projectName, kind, definitionSearch])

  useEffect(() => {
    if (!open || !client || !selectedDefinition) {
      return
    }
    const controller = new AbortController()
    setStages([])
    setSelectedStage(null)
    setLoadingStages(true)
    setError(null)
    listTestStages(client, { orgName: orgName.trim(), projectName: projectName.trim(), kind, definitionId: selectedDefinition.id }, controller.signal)
      .then(setStages)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(testPipelineErrorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingStages(false)
      })
    return () => controller.abort()
  }, [open, client, orgName, projectName, kind, selectedDefinition])

  const addPipeline = () => {
    if (!selectedDefinition || !selectedStage) {
      return
    }
    const pipeline: TestPipeline = {
      id: crypto.randomUUID(), orgName: orgName.trim(), projectName: projectName.trim(),
      kind, definitionId: selectedDefinition.id, name: selectedDefinition.name, stageName: selectedStage.name,
      stageDefinitionId: selectedStage.definitionId,
    }
    if (pipelines.some((entry) => entry.orgName === pipeline.orgName
      && entry.projectName === pipeline.projectName && entry.kind === kind
      && entry.definitionId === selectedDefinition.id
      && (selectedStage.definitionId
        ? entry.stageDefinitionId === selectedStage.definitionId
        : entry.stageName === selectedStage.name))) {
      setError('This pipeline and stage are already configured.')
      return
    }
    updatePipelinesDraft([...pipelines, pipeline])
    setSelectedDefinition(null)
    setSelectedStage(null)
    setStages([])
    setDefinitionSearch('')
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Test options</DialogTitle>
      <DialogContent ref={contentRef} sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1, sm: 2 },
        pt: 1,
        minHeight: { xs: 0, sm: 420 },
      }}>
        <Tabs
          orientation={isMobile ? 'horizontal' : 'vertical'}
          variant={isMobile ? 'scrollable' : 'standard'}
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Test options"
          value={activeTab}
          onChange={(_event, value: number) => setActiveTab(value)}
          sx={{
            width: { xs: '100%', sm: 'auto' },
            borderRight: { xs: 0, sm: 1 },
            borderBottom: { xs: 1, sm: 0 },
            borderColor: 'divider',
            minWidth: { xs: 0, sm: 160 },
            flexShrink: 0,
            '& .MuiTab-root': { whiteSpace: 'nowrap' },
          }}
        >
          <Tab id="tests-options-tab" aria-controls="tests-options-panel" label="Options" sx={{ alignItems: 'flex-start' }} />
          <Tab id="tests-pipelines-tab" aria-controls="tests-pipelines-panel" label="Pipelines" sx={{ alignItems: 'flex-start' }} />
        </Tabs>
        <Box sx={{ flex: 1, minWidth: 0, maxHeight: 480, overflowY: 'auto', pr: 0.5 }}>
        {activeTab === 0 && (
        <Stack role="tabpanel" id="tests-options-panel" aria-labelledby="tests-options-tab" spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Lookback (days)"
            type="number"
            value={lookbackInput}
            onChange={(event) => {
              setLookbackInput(event.target.value)
              setLookbackError(null)
            }}
            onBlur={checkLookback}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            error={Boolean(lookbackError)}
            helperText={lookbackError ?? 'Query test results from this many days ago through today.'}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
          />
          <FormControlLabel
            control={<Checkbox checked={filterEnabled} onChange={(_event, checked) => {
              setFilterEnabled(checked)
              setThresholdError(null)
            }} />}
            label="Exclude results at or below a pass rate"
          />
          <TextField
            label="Pass rate threshold (%)"
            type="number"
            disabled={!filterEnabled}
            value={thresholdInput}
            onChange={(event) => {
              setThresholdInput(event.target.value)
              setThresholdError(null)
            }}
            onBlur={checkPassRateFilter}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            error={Boolean(thresholdError)}
            helperText={thresholdError ?? 'Exclude chart points with a pass rate less than or equal to this percentage (0–100).'}
            slotProps={{ htmlInput: { min: 0, max: 100, step: 'any' } }}
          />
          <Typography variant="body-md" render={<h3 />} sx={{ fontWeight: 700, mt: 0, mb: -0.5, pt: 1 }}>Pipeline health</Typography>
          <TextField
            label="Flag no recent runs after (working days)"
            type="number"
            value={staleInput}
            onChange={(event) => {
              setStaleInput(event.target.value)
              setStaleError(null)
            }}
            onBlur={() => checkHealthOption('staleDays', staleInput, setStaleError)}
            onKeyDown={blurOnEnter}
            error={Boolean(staleError)}
            helperText={staleError ?? 'A pipeline with no results for this many working days shows No recent runs (1–30).'}
            slotProps={{ htmlInput: { min: 1, max: 30, step: 1 } }}
          />
          <TextField
            label="Flag fewer tests below (% of usual)"
            type="number"
            value={fewerInput}
            onChange={(event) => {
              setFewerInput(event.target.value)
              setFewerError(null)
            }}
            onBlur={() => checkHealthOption('fewerPercent', fewerInput, setFewerError)}
            onKeyDown={blurOnEnter}
            error={Boolean(fewerError)}
            helperText={fewerError ?? "A run that executed fewer than this share of the pipeline's median test count shows Fewer tests."}
            slotProps={{ htmlInput: { min: 1, max: 100, step: 'any' } }}
          />
        </Stack>
        )}
        {activeTab === 1 && (
        <Stack role="tabpanel" id="tests-pipelines-panel" aria-labelledby="tests-pipelines-tab" spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body-sm" color="text.secondary">
            Choose a pipeline and the stage that publishes its e2e test results.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {!pat && <Alert severity="warning">Add a PAT with Test Management (Read), Build (Read), and Release (Read) access in app Settings.</Alert>}
          {pipelines.map((entry) => {
            const shortNameId = `test-pipeline-short-name-${entry.id}`
            return (
              <Box key={entry.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1, borderBottom: 1, borderColor: 'divider', pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography variant="body-sm" sx={{ flex: 1, minWidth: 0 }}>
                    {entry.name} · {testStageLabel(entry.stageName)} ({entry.kind}, {entry.orgName}/{entry.projectName})
                  </Typography>
                  <Button color="error" size="small" onClick={() => updatePipelinesDraft(pipelines.filter((item) => item.id !== entry.id))}>Remove</Button>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body-sm" color="text.secondary" render={<label htmlFor={shortNameId} />}>Short name</Typography>
                  <TextField
                    id={shortNameId}
                    size="small"
                    value={entry.shortName ?? ''}
                    placeholder={defaultTestPipelineShortName(entry.name)}
                    onChange={(event) => updateShortName(entry, event.target.value)}
                    onKeyDown={blurOnEnter}
                    slotProps={{ htmlInput: { maxLength: TEST_SHORT_NAME_MAX_LENGTH, 'aria-label': `Short name for ${entry.name} · ${testStageLabel(entry.stageName)}` } }}
                    sx={{ width: 150, flexShrink: 0 }}
                  />
                </Box>
              </Box>
            )
          })}
          <TextField label="Organization" value={orgName} onChange={(event) => setOrgName(event.target.value)} />
          <TextField label="Project" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          <FormControl fullWidth>
            <InputLabel id="test-kind-label">Pipeline type</InputLabel>
            <Select labelId="test-kind-label" label="Pipeline type" value={kind} onChange={(event) => {
              setKind(event.target.value as TestPipelineKind)
              setDefinitionSearch('')
            }}>
              <MenuItem value="build">Build / YAML pipeline</MenuItem>
              <MenuItem value="release">Classic release pipeline</MenuItem>
            </Select>
          </FormControl>
          <Autocomplete
            options={definitions}
            value={selectedDefinition}
            onChange={(_event, value) => {
              setSelectedDefinition(value)
              setSelectedStage(null)
              setStages([])
            }}
            onInputChange={(_event, value, reason) => {
              if (reason === 'input' || reason === 'clear') {
                setDefinitionSearch(value)
                setSelectedDefinition(null)
                setSelectedStage(null)
                setStages([])
              }
            }}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            filterOptions={(options) => options}
            loading={loadingDefinitions}
            disabled={!client || !orgName.trim() || !projectName.trim()}
            renderInput={(params) => <TextField {...params} label="Pipeline" placeholder="Type to search pipelines" />}
          />
          {loadingDefinitions && <Typography variant="body-sm">Loading pipelines… <CircularProgress size={16} /></Typography>}
          {!loadingDefinitions && definitions.length === 100 && (
            <Typography variant="body-sm" color="text.secondary">Showing the first 100 matches. Type a name to search more pipelines.</Typography>
          )}
          {!loadingDefinitions && client && definitions.length === 0 && orgName.trim() && projectName.trim() && !error
            && <Typography variant="body-sm" color="text.secondary">No pipelines found in this project.</Typography>}
          <Autocomplete
            options={stages}
            value={selectedStage}
            onChange={(_event, value) => setSelectedStage(value)}
            getOptionLabel={(stage) =>
              `${testStageLabel(stage.name)}${stage.resultCount !== null ? ` · ${stage.resultCount} tests in latest run` : ''}`}
            isOptionEqualToValue={(option, value) =>
              option.definitionId !== undefined && value.definitionId !== undefined
                ? option.definitionId === value.definitionId
                : option.name === value.name}
            disabled={!selectedDefinition || loadingStages || stages.length === 0}
            renderInput={(params) => <TextField {...params} label="Test stage" placeholder="Type to filter stages" />}
          />
          {loadingStages && <Typography variant="body-sm">Loading stages… <CircularProgress size={16} /></Typography>}
          {!loadingStages && selectedDefinition && stages.length === 0 && !error
            && <Alert severity="info">No stages found. Run this pipeline and publish test results to Azure DevOps first.</Alert>}
          <Button variant="outlined" disabled={!selectedDefinition || !selectedStage || !pat} onClick={addPipeline}>Add pipeline</Button>
        </Stack>
        )}
        </Box>
      </DialogContent>
      {saveError ? <Alert severity="error" role="alert">{saveError}</Alert> : null}
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  )
}
