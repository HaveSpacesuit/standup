import { useEffect, useMemo, useState, type RefObject } from 'react'
import { Alert, Box, Button, CircularProgress, IconButton, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCategory from '@stratakit/icons/category.svg'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgInbox from '@stratakit/icons/inbox.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import svgStatusSuccess from '@stratakit/icons/status-success.svg'
import svgTable from '@stratakit/icons/table.svg'
import svgWindowPopout from '@stratakit/icons/window-popout.svg'
import type { TeamIterationOption, TriageResult } from '../../../ado/types'
import { useRememberedView } from '../hooks/useRememberedView'
import type { TriageSimilarSources } from '../hooks/useTriageSimilarSources'
import { createBacklogSprintResolver } from '../utils/backlogSprint'
import { getTriageQueryOptions, hasTriageRules, type TriageOptions } from '../utils/triageOptions'
import { describeEmptyTriage, filterTriageItems, formatTriageCount } from '../utils/triageDisplay'
import { addTriageNotDuplicate, loadTriageNotDuplicates } from '../utils/triageNotDuplicates'
import { collectTriageMatchCandidates, findTriageMatches, triagePairKey } from '../utils/triageSimilar'
import { recordTriageVisit } from '../utils/triageVisits'
import { AppTooltip } from '../components/AppTooltip'
import { AdoErrorNotice } from '../components/AdoErrorNotice'
import { visuallyHiddenSx } from '../components/developmentCardDisplay'
import { PageToolbar } from '../components/PageToolbar'
import { QuickFilterField } from '../components/QuickFilterField'
import { SyncStatus } from '../components/SyncStatus'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'
import { TeamToolbarControls, type TeamOption } from '../components/TeamToolbarControls'
import { TriageEmptyState } from '../components/TriageEmptyState'
import { TriageInbox } from '../components/TriageInbox'
import { TriageLoadingState } from '../components/TriageLoadingState'
import { TriageOptionsDialog } from '../components/TriageOptionsDialog'
import { TriageCompareDialog } from '../components/TriageSimilar'
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
  /** The open and recently closed bugs the queue's titles are compared with, besides each other. */
  similar: TriageSimilarSources
  onRefresh: () => void
  options: TriageOptions
  settingsError: string | null
  onOptionsChange: (options: TriageOptions) => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  iterations: TeamIterationOption[]
  iterationsLoading: boolean
  iterationsError: string | null
  /** Whether to reopen the view used last time rather than the Table. */
  rememberLastView: boolean
}

const TRIAGE_VIEWS = ['table', 'inbox'] as const
type TriageView = (typeof TRIAGE_VIEWS)[number]

/**
 * Notes the visit as the page opens, and again whenever it syncs and as it closes, and returns the earlier visit the
 * Inbox's "New since your last visit" counts from. The page is keyed by team, so a team change is a new visit.
 */
function useTriageVisit(teamId: string, syncedAt: number | null): number | null {
  const [lastVisit] = useState(() => (teamId ? recordTriageVisit(teamId) : null))
  useEffect(() => {
    if (!teamId) return undefined
    if (syncedAt !== null) recordTriageVisit(teamId)
    return () => {
      recordTriageVisit(teamId)
    }
  }, [teamId, syncedAt])
  return lastVisit
}

export function TriagePage(props: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [view, setView] = useRememberedView<TriageView>('triage', TRIAGE_VIEWS, props.rememberLastView)
  const lastVisit = useTriageVisit(props.selectedTeamId, props.syncedAt)
  // The page is keyed by team, so this holds the team's pairs.
  const [notDuplicates, setNotDuplicates] = useState(() => (props.selectedTeamId ? loadTriageNotDuplicates(props.selectedTeamId) : []))
  const [compareId, setCompareId] = useState<number | null>(null)
  const { result, options, isLoading, error, settingsError, iterations, similar } = props
  // Sprints are placed against the team's iterations, like Backlog; until they load, the path's last segment is shown.
  const resolveSprint = useMemo(() => createBacklogSprintResolver(iterations), [iterations])
  // From the whole queue, so an item's match holds still while the quick filter changes.
  const matches = useMemo(
    () => findTriageMatches(
      result.items,
      collectTriageMatchCandidates(result.items, similar.openBugs, similar.closedBugs),
      new Set(notDuplicates),
    ),
    [result.items, similar.openBugs, similar.closedBugs, notDuplicates],
  )
  const items = useMemo(
    () => filterTriageItems(result.items, filter, resolveSprint, options.readinessChecks, matches),
    [result.items, filter, resolveSprint, options.readinessChecks, matches],
  )
  const compareItem = compareId === null ? undefined : result.items.find((item) => item.id === compareId)
  const compareMatch = compareId === null ? undefined : matches.get(compareId)
  // From the whole queue, not the filtered rows, so the columns hold still while typing in the quick filter.
  const showAssignee = result.items.some((item) => item.assignedTo)
  const showParent = result.items.some((item) => item.parent)
  const canLoad = props.patConfigured && props.teamOptions.length > 0
  const rulesEnabled = hasTriageRules(options)
  const showCount = canLoad && rulesEnabled && !isLoading && !error && !settingsError
  const canOpenQuery = showCount && Boolean(result.queryUrl)

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
        {[...result.warnings, ...similar.warnings].map((warning) => <Alert key={warning} severity="warning">{warning}</Alert>)}
        {items.length ? view === 'inbox' ? (
          <TriageInbox
            items={items} resolveSprint={resolveSprint} ageFlagDays={options.ageFlagDays} lastVisit={lastVisit}
            readinessChecks={options.readinessChecks} excludedIterationPaths={options.excludedIterationPaths}
            waitingTags={options.waitingTags} matches={matches} onCompare={setCompareId}
          />
        ) : (
          <TriageTable
            items={items} resolveSprint={resolveSprint} ageFlagDays={options.ageFlagDays}
            showAssignee={showAssignee} showParent={showParent}
            readinessChecks={options.readinessChecks} excludedIterationPaths={options.excludedIterationPaths}
            waitingTags={options.waitingTags} matches={matches} onCompare={setCompareId}
          />
        ) : result.items.length ? (
          <Box component="main" sx={{ flex: 1, minHeight: 0, bgcolor: 'background.paper' }}>
            <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
              No items match the quick filter. Clear it to see the triage queue.
            </Typography>
          </Box>
        ) : (
          <TriageEmptyState
            heading="Triage is clear"
            message={props.syncedAt === null
              ? 'Nothing needs triage.'
              : `Nothing needs triage as of ${new Date(props.syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`}
            detail={describeEmptyTriage(getTriageQueryOptions(options))}
            iconHref={svgStatusSuccess}
            iconColor="var(--stratakit-color-icon-positive-base)"
          />
        )}
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
        <AppTooltip title="Open the Triage rules as an Azure DevOps query, for bulk edits" describeChild>
          <span>
            {canOpenQuery && result.queryUrl ? (
              <Button
                size="small" variant="outlined" href={result.queryUrl} target="_blank" rel="noopener noreferrer"
                startIcon={<Icon href={svgWindowPopout} alt="" />}
              >
                Open in ADO
                <Box component="span" sx={visuallyHiddenSx}> (opens in a new tab)</Box>
              </Button>
            ) : (
              <Button size="small" variant="outlined" disabled startIcon={<Icon href={svgWindowPopout} alt="" />}>Open in ADO</Button>
            )}
          </span>
        </AppTooltip>
        <TeamToolbarControls
          teamOptions={props.teamOptions} selectedTeamId={props.selectedTeamId}
          onTeamChange={props.onTeamChange} teamManagementUrl={props.teamManagementUrl}
          beforeChildren={(
            <>
              <Typography variant="body-sm" sx={{ fontWeight: 700, whiteSpace: 'nowrap', '@container (max-width: 960px)': { display: 'none' } }}>
                View
              </Typography>
              <ToggleButtonGroup
                size="small" exclusive value={view} aria-label="Triage view"
                onChange={(_event, value: TriageView | null) => {
                  if (value) setView(value)
                }}
              >
                <ToggleButton value="table" render={<Button size="small" startIcon={<Icon href={svgTable} />} />}>Table</ToggleButton>
                <ToggleButton value="inbox" render={<Button size="small" startIcon={<Icon href={svgInbox} />} />}>Inbox</ToggleButton>
              </ToggleButtonGroup>
            </>
          )}
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
      {compareItem && compareMatch ? (
        <TriageCompareDialog
          item={compareItem} match={compareMatch} resolveSprint={resolveSprint} onClose={() => setCompareId(null)}
          onNotDuplicate={() => {
            setNotDuplicates((pairs) => addTriageNotDuplicate(props.selectedTeamId, pairs, triagePairKey(compareItem.id, compareMatch.candidate.id)))
            setCompareId(null)
          }}
        />
      ) : null}
      {renderContent()}
    </>
  )
}
