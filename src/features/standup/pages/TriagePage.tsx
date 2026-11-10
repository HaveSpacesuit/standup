import { useMemo, useState, type RefObject } from 'react'
import { Alert, Box, Button, CircularProgress, IconButton, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCategory from '@stratakit/icons/category.svg'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import type { TeamIterationOption, TriageResult } from '../../../ado/types'
import { createBacklogSprintResolver } from '../utils/backlogSprint'
import { getActiveTriageOptions, hasTriageRules, type TriageOptions } from '../utils/triageOptions'
import { describeEmptyTriage, filterTriageItems, formatTriageCount } from '../utils/triageDisplay'
import { AppTooltip } from '../components/AppTooltip'
import { AdoErrorNotice } from '../components/AdoErrorNotice'
import { PageToolbar } from '../components/PageToolbar'
import { QuickFilterField } from '../components/QuickFilterField'
import { SyncStatus } from '../components/SyncStatus'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'
import { TeamToolbarControls, type TeamOption } from '../components/TeamToolbarControls'
import { TriageEmptyState } from '../components/TriageEmptyState'
import { TriageLoadingState } from '../components/TriageLoadingState'
import { TriageOptionsDialog } from '../components/TriageOptionsDialog'
import { TriageTable } from '../components/TriageTable'

type Props = {
  patConfigured: boolean
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (id: string) => void
  teamManagementUrl: string
  result: TriageResult
  isLoading: boolean
  error: string | null
  syncedAt: number | null
  onRefresh: () => void
  options: TriageOptions
  settingsError: string | null
  onOptionsChange: (options: TriageOptions) => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  iterations: TeamIterationOption[]
  iterationsLoading: boolean
  iterationsError: string | null
}

export function TriagePage(props: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const { result, options, isLoading, error, settingsError, iterations } = props
  // Sprints are placed against the team's iterations, like Backlog; until they load, the path's last segment is shown.
  const resolveSprint = useMemo(() => createBacklogSprintResolver(iterations), [iterations])
  const items = useMemo(() => filterTriageItems(result.items, filter, resolveSprint), [result.items, filter, resolveSprint])
  const canLoad = props.patConfigured && props.teamOptions.length > 0
  const rulesEnabled = hasTriageRules(options)
  const showCount = canLoad && rulesEnabled && !isLoading && !error && !settingsError

  const renderContent = () => {
    if (!props.teamOptions.length) return <TeamConfigurationEmptyState pageLabel="Triage" />
    if (!props.patConfigured) return <Typography sx={{ p: 2 }}>Configure an Azure DevOps PAT to load Triage.</Typography>
    if (settingsError) return <Alert severity="error">{settingsError}</Alert>
    if (!rulesEnabled) {
      return (
        <TriageEmptyState
          heading="No Triage rules"
          message="Add a Triage tag or turn on new bugs to fill the queue."
          action={<Button variant="outlined" onClick={() => setSettingsOpen(true)} disabled={!props.selectedTeamId}>Open Triage options</Button>}
        />
      )
    }
    if (error) {
      return (
        <Box component="main" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          <Box sx={{ flex: 1 }}><AdoErrorNotice title="Unable to load Triage" message={error} /></Box>
          <Button onClick={props.onRefresh}>Retry</Button>
        </Box>
      )
    }
    if (isLoading) return <TriageLoadingState />
    return (
      <>
        {result.warnings.map((warning) => <Alert key={warning} severity="warning">{warning}</Alert>)}
        {items.length ? <TriageTable items={items} resolveSprint={resolveSprint} />
          : result.items.length ? (
            <Box component="main" sx={{ flex: 1, minHeight: 0, bgcolor: 'background.paper' }}>
              <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
                No items match the quick filter. Clear it to see the triage queue.
              </Typography>
            </Box>
          ) : <TriageEmptyState heading="Nothing to triage" message={describeEmptyTriage(getActiveTriageOptions(options))} />}
      </>
    )
  }

  return (
    <>
      <PageToolbar iconHref={svgCategory} title="Triage" isPageTitle wrap>
        <Typography variant="body-sm" color="text.secondary" aria-live="polite">
          {showCount ? formatTriageCount(items.length, result.items.length) : ''}
        </Typography>
        <QuickFilterField
          label="Quick filter triage items" value={filter} onChange={setFilter} onClear={() => setFilter('')}
          inputRef={props.quickFilterInputRef} disabled={!canLoad}
        />
        <TeamToolbarControls
          teamOptions={props.teamOptions} selectedTeamId={props.selectedTeamId}
          onTeamChange={props.onTeamChange} teamManagementUrl={props.teamManagementUrl}
        >
          <AppTooltip title="Triage options">
            <span><IconButton aria-label="Triage options" onClick={() => setSettingsOpen(true)} disabled={!props.selectedTeamId}>
              <Icon href={svgSettings} />
            </IconButton></span>
          </AppTooltip>
          <SyncStatus syncedAt={rulesEnabled && !settingsError ? props.syncedAt : null} isLoading={isLoading} />
          <AppTooltip title="Refresh">
            <span><IconButton aria-label="Refresh" onClick={props.onRefresh} disabled={!canLoad || isLoading} aria-busy={isLoading || undefined}>
              {isLoading ? <CircularProgress size={16} aria-hidden="true" /> : <Icon href={svgCloudSync} />}
            </IconButton></span>
          </AppTooltip>
        </TeamToolbarControls>
      </PageToolbar>
      {settingsOpen ? <TriageOptionsDialog
        key={props.selectedTeamId}
        options={options} onSave={props.onOptionsChange} onClose={() => setSettingsOpen(false)}
        iterations={props.iterations} iterationsLoading={props.iterationsLoading} iterationsError={props.iterationsError}
      /> : null}
      {renderContent()}
    </>
  )
}
