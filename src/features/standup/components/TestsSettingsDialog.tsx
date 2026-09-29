import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography,
} from '@mui/material'
import { AdoHttpClient } from '../../../ado/httpClient'
import { listTestPipelineDefinitions, listTestStages, type Definition, type StageOption } from '../../../ado/testPipelinesApi'
import { testLookbackStart, testStageLabel, type TestPipeline, type TestPipelineKind } from '../utils/testPipelines'
import { testPipelineErrorMessage } from '../utils/testPipelineErrors'

type Props = {
  open: boolean
  onClose: () => void
  pat: string | null
  defaultOrg: string
  defaultProject: string
  pipelines: TestPipeline[]
  onChange: (pipelines: TestPipeline[]) => string | null
  lookbackDays: number
  onLookbackDaysChange: (days: number) => string | null
}

export function TestsSettingsDialog({
  open, onClose, pat, defaultOrg, defaultProject, pipelines, onChange, lookbackDays, onLookbackDaysChange,
}: Props) {
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
  const client = useMemo(() => pat ? new AdoHttpClient(pat) : null, [pat])

  useEffect(() => {
    if (open) {
      setLookbackInput(String(lookbackDays))
      setLookbackError(null)
    }
  }, [open, lookbackDays])

  const saveLookback = () => {
    const days = Number(lookbackInput)
    try {
      testLookbackStart(days)
      setLookbackError(onLookbackDaysChange(days))
    } catch (cause) {
      setLookbackError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const savePipelines = (next: TestPipeline[]): boolean => {
    const failure = onChange(next)
    setError(failure)
    return failure === null
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
    if (!savePipelines([...pipelines, pipeline])) return
    setSelectedDefinition(null)
    setSelectedStage(null)
    setStages([])
    setDefinitionSearch('')
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Tests settings</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body-sm" color="text.secondary">
            Choose a pipeline and the stage that publishes its e2e test results.
          </Typography>
          <TextField
            label="Lookback (days)"
            type="number"
            value={lookbackInput}
            onChange={(event) => {
              setLookbackInput(event.target.value)
              setLookbackError(null)
            }}
            onBlur={saveLookback}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            error={Boolean(lookbackError)}
            helperText={lookbackError ?? 'Query test results from this many days ago through today.'}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
          />
          {error && <Alert severity="error">{error}</Alert>}
          {!pat && <Alert severity="warning">Add a PAT with Test Management (Read), Build (Read), and Release (Read) access in app Settings.</Alert>}
          {pipelines.map((entry) => (
            <Box key={entry.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: 1, borderColor: 'divider', pb: 1 }}>
              <Typography variant="body-sm">
                {entry.name} · {testStageLabel(entry.stageName)} ({entry.kind}, {entry.orgName}/{entry.projectName})
              </Typography>
              <Button color="error" size="small" onClick={() => savePipelines(pipelines.filter((item) => item.id !== entry.id))}>Remove</Button>
            </Box>
          ))}
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
          <Button variant="contained" disabled={!selectedDefinition || !selectedStage || !pat} onClick={addPipeline}>Add pipeline</Button>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  )
}
