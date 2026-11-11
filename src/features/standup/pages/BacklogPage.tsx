import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Box } from '@mui/material'
import type { TeamIterationOption } from '../../../ado/types'
import { AttentionBar } from '../components/AttentionBar'
import { BacklogList } from '../components/BacklogList'
import { BacklogMap } from '../components/BacklogMap'
import { BacklogOptionsDialog } from '../components/BacklogOptionsDialog'
import { BacklogPlanBar } from '../components/BacklogPlanBar'
import { BacklogPreviewPanel } from '../components/BacklogPreview'
import { BacklogRibbon } from '../components/BacklogRibbon'
import type { BacklogTablePlan } from '../components/BacklogTable'
import { BacklogToolbar } from '../components/BacklogToolbar'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'
import type { TeamOption } from '../components/TeamToolbarControls'
import { previewPanelId, type PreviewControls } from '../components/workItemPreviewDisplay'
import { usePreviewPanelWidth, usePreviewSelection } from '../hooks/usePreviewPanel'
import { useRememberedView } from '../hooks/useRememberedView'
import { useWorkItemPreview, type WorkItemPreviewSource } from '../hooks/useWorkItemPreview'
import {
  countBacklogFacets,
  getBacklogFacetMatches,
  getBacklogFacets,
  summarizeBacklog,
  type BacklogFacetKey,
} from '../utils/backlogAttention'
import { formatBacklogCount } from '../utils/backlogFilter'
import { createDefaultBacklogOptions, type BacklogOptions } from '../utils/backlogOptions'
import { NO_PLAN_PICKS, planBacklogSprint, togglePlanPick } from '../utils/backlogPlan'
import { groupBacklogBugsByTier, type BacklogTierKey } from '../utils/backlogTiers'
import type { RankedBacklogBug } from '../utils/backlogValue'

type BacklogPageProps = {
  patConfigured: boolean
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  onRefresh: () => void
  /** The ranked bugs that pass the quick filter. */
  bugs: RankedBacklogBug[]
  /** Every open bug, for the summary ribbon, which describes the whole backlog; defaults to `bugs`. */
  allBugs?: RankedBacklogBug[]
  /** How many open bugs there are before the quick filter, to tell "no match" from "no open bugs". */
  totalBugCount: number
  /** The team's sprints, for the ribbon's planned and new-this-sprint counts; none until they load. */
  teamIterations?: readonly TeamIterationOption[]
  isLoading: boolean
  error: string | null
  /** When the backlog last loaded fresh from Azure DevOps, for the "Synced 5m ago" label. */
  syncedAt?: number | null
  /** One-line rows; the team's compact density, shared with the Development and QA cards. */
  compactRows?: boolean
  onCompactRowsChange?: (compactRows: boolean) => void
  /** The team's Backlog options: the Value tier thresholds, whether Minimal starts collapsed, and when a New bug is old. */
  backlogOptions?: BacklogOptions
  onBacklogOptionsChange?: (next: BacklogOptions) => void
  /** Reopen the view used last, List or Map; otherwise the page opens on List. */
  rememberLastView?: boolean
  /** Where the preview panel reads a bug's details; without it the List's rows cannot be previewed. */
  preview?: WorkItemPreviewSource | null
}

const BACKLOG_VIEWS = ['list', 'map'] as const
const BACKLOG_PREVIEW_PANEL_ID = previewPanelId('backlog')
const previewLayoutSx = { flex: 1, minHeight: 0, display: 'flex' } as const

const DEFAULT_BACKLOG_OPTIONS = createDefaultBacklogOptions()
const NO_ITERATIONS: readonly TeamIterationOption[] = []
const BUG_NOUN = ['bug', 'bugs'] as const

const initialCollapsedTiers = (startLowCollapsed: boolean): ReadonlySet<BacklogTierKey> =>
  new Set<BacklogTierKey>(startLowCollapsed ? ['low'] : [])

/**
 * Which tiers are collapsed. The page owns it, not the table, so it outlasts a refresh, which swaps the table for the
 * loading skeleton. Turning "Start with the Minimal tier collapsed" on or off applies to the Minimal tier straight away.
 */
function useCollapsedTiers(startLowCollapsed: boolean) {
  const [collapsedTiers, setCollapsedTiers] = useState(() => initialCollapsedTiers(startLowCollapsed))
  const [appliedStartLowCollapsed, setAppliedStartLowCollapsed] = useState(startLowCollapsed)

  if (appliedStartLowCollapsed !== startLowCollapsed) {
    setAppliedStartLowCollapsed(startLowCollapsed)
    setCollapsedTiers((previous) => {
      const next = new Set(previous)
      if (startLowCollapsed) {
        next.add('low')
      } else {
        next.delete('low')
      }
      return next
    })
  }

  const toggleTier = useCallback((tier: BacklogTierKey) => {
    setCollapsedTiers((previous) => {
      const next = new Set(previous)
      if (!next.delete(tier)) {
        next.add(tier)
      }
      return next
    })
  }, [])

  return [collapsedTiers, toggleTier] as const
}

export function BacklogPage({
  patConfigured,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  quickFilterInput,
  onQuickFilterInputChange,
  onQuickFilterClear,
  quickFilterInputRef,
  onRefresh,
  bugs,
  allBugs = bugs,
  totalBugCount,
  teamIterations = NO_ITERATIONS,
  isLoading,
  error,
  syncedAt = null,
  compactRows = false,
  onCompactRowsChange = () => {},
  backlogOptions = DEFAULT_BACKLOG_OPTIONS,
  onBacklogOptionsChange = () => {},
  rememberLastView = false,
  preview: previewSource = null,
}: BacklogPageProps) {
  const [view, setView] = useRememberedView('backlog', BACKLOG_VIEWS, rememberLastView)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [collapsedTiers, toggleTier] = useCollapsedTiers(backlogOptions.startLowCollapsed)
  const [attentionFacet, setAttentionFacet] = useState<BacklogFacetKey | null>(null)
  const [planning, setPlanning] = useState(false)
  // Null follows the team's default budget, so changing it in the options applies until the budget is edited here.
  const [budgetOverride, setBudgetOverride] = useState<number | null>(null)
  const [planPicks, setPlanPicks] = useState(NO_PLAN_PICKS)
  // The map's selected bubble; kept here so it outlasts a refresh, which swaps the map for the loading skeleton.
  const [mapSelection, setMapSelection] = useState<string | null>(null)
  // Picks and a budget belong to one team's backlog, so switching teams starts the plan over.
  const [planTeamId, setPlanTeamId] = useState(selectedTeamId)
  if (planTeamId !== selectedTeamId) {
    setPlanTeamId(selectedTeamId)
    setPlanPicks(NO_PLAN_PICKS)
    setBudgetOverride(null)
    setMapSelection(null)
  }
  const { agingMonths, tierThresholds, defaultPlanBudget, skipPlannedBugs, skipUnestimatedBugs } = backlogOptions
  const hasConfiguredTeams = teamOptions.length > 0
  const hasList = patConfigured && hasConfiguredTeams && !isLoading && !error
  const showSummary = hasList && allBugs.length > 0
  const showPlan = planning && showSummary
  const budget = budgetOverride ?? defaultPlanBudget

  const summary = useMemo(
    () => summarizeBacklog(allBugs, tierThresholds, teamIterations),
    [allBugs, tierThresholds, teamIterations],
  )
  const facets = useMemo(() => getBacklogFacets(agingMonths), [agingMonths])
  // The chips count the bugs the quick filter leaves, like the highlight they turn on.
  const facetCounts = useMemo(() => countBacklogFacets(bugs, { agingMonths }), [bugs, agingMonths])
  const highlightedBugIds = useMemo(
    () => (attentionFacet ? getBacklogFacetMatches(bugs, attentionFacet, { agingMonths }) : null),
    [bugs, attentionFacet, agingMonths],
  )

  // The planner picks from what is listed: the quick filter's bugs, narrowed to the Needs attention facet when one is on.
  const plan = useMemo(() => {
    if (!showPlan) {
      return null
    }
    const candidates = highlightedBugIds ? bugs.filter((bug) => highlightedBugIds.has(bug.id)) : bugs
    return planBacklogSprint(candidates, {
      ...planPicks,
      budget,
      skipPlanned: skipPlannedBugs,
      skipUnestimated: skipUnestimatedBugs,
    })
  }, [showPlan, bugs, highlightedBugIds, planPicks, budget, skipPlannedBugs, skipUnestimatedBugs])
  const togglePick = useCallback((id: number, wasPicked: boolean) => {
    setPlanPicks((previous) => togglePlanPick(previous, id, wasPicked))
  }, [])
  const tablePlan = useMemo<BacklogTablePlan | null>(
    () => (plan ? { plan, picks: planPicks, onTogglePick: togglePick } : null),
    [plan, planPicks, togglePick],
  )
  const resetPlan = () => {
    setPlanPicks(NO_PLAN_PICKS)
    setBudgetOverride(null)
  }
  const canResetPlan = budgetOverride !== null || planPicks.forceIn.size > 0 || planPicks.forceOut.size > 0

  // Like Start standup and its presenter bar, the header button and the strip take turns, so focus moves to whichever
  // replaced the one just pressed.
  const planButtonRef = useRef<HTMLButtonElement>(null)
  const budgetInputRef = useRef<HTMLInputElement>(null)
  const planFocusTarget = useRef<RefObject<HTMLElement | null> | null>(null)
  useEffect(() => {
    planFocusTarget.current?.current?.focus()
    planFocusTarget.current = null
  }, [planning])
  const openPlan = () => {
    planFocusTarget.current = budgetInputRef
    setPlanning(true)
  }
  const closePlan = () => {
    planFocusTarget.current = planButtonRef
    setPlanning(false)
  }

  // Only the List previews bugs; the Map has a side panel of its own.
  const previewing = previewSource !== null && view === 'list'
  const byId = useMemo(() => new Map(allBugs.map((bug) => [bug.id, bug])), [allBugs])
  // The arrows follow the rows as listed: by rank, skipping the bugs of collapsed tiers.
  const previewIds = useMemo(() => {
    if (!previewing || !hasList) return []
    return groupBacklogBugsByTier(bugs, tierThresholds)
      .filter((group) => !collapsedTiers.has(group.key))
      .flatMap((group) => group.bugs.map((bug) => bug.id))
  }, [previewing, hasList, bugs, tierThresholds, collapsedTiers])
  // Scoped to the team: the page is not remounted per team, and the last team's bug would show as no longer listed.
  const selection = usePreviewSelection({ ids: previewIds, getUrl: (id) => byId.get(id)?.workItemUrl, scope: selectedTeamId })
  const [panelWidth, resizePanel] = usePreviewPanelWidth()
  const { selectedId, select, toggle, close: closePreview } = selection
  const previewBug = selectedId === null ? undefined : byId.get(selectedId)
  const previewLoad = useWorkItemPreview(previewing ? previewSource : null, previewBug ? previewBug.id : null, selection.nextId)
  const previewControls = useMemo<PreviewControls | undefined>(
    () => previewing ? { selectedId, panelId: BACKLOG_PREVIEW_PANEL_ID, onSelect: select, onToggle: toggle } : undefined,
    [previewing, selectedId, select, toggle],
  )
  const changeView = (next: typeof view) => {
    // Closed rather than left open behind the Map, where Esc and O would still act on it.
    if (next === 'map') closePreview()
    setView(next)
  }

  return (
    <>
      <BacklogToolbar
        patConfigured={patConfigured}
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
        quickFilterInput={quickFilterInput}
        onQuickFilterInputChange={onQuickFilterInputChange}
        onQuickFilterClear={onQuickFilterClear}
        quickFilterInputRef={quickFilterInputRef}
        onRefresh={onRefresh}
        onOpenSettings={() => setSettingsOpen(true)}
        isLoading={isLoading}
        countLabel={hasList ? formatBacklogCount(bugs.length, totalBugCount) : null}
        syncedAt={syncedAt}
        planning={planning}
        onPlan={openPlan}
        planButtonRef={planButtonRef}
        canPlan={showSummary}
        view={view}
        onViewChange={changeView}
      />

      {showSummary ? (
        <>
          <BacklogRibbon summary={summary} tierThresholds={tierThresholds} />
          <AttentionBar
            facetCounts={facetCounts}
            totalItems={bugs.length}
            activeFacet={attentionFacet}
            highlightedCount={highlightedBugIds?.size ?? 0}
            onChange={setAttentionFacet}
            facets={facets}
            itemNoun={BUG_NOUN}
          />
          {plan ? (
            <BacklogPlanBar
              plan={plan}
              onBudgetChange={setBudgetOverride}
              skipPlanned={skipPlannedBugs}
              onSkipPlannedChange={(skip) => onBacklogOptionsChange({ ...backlogOptions, skipPlannedBugs: skip })}
              skipUnestimated={skipUnestimatedBugs}
              onSkipUnestimatedChange={(skip) => onBacklogOptionsChange({ ...backlogOptions, skipUnestimatedBugs: skip })}
              canReset={canResetPlan}
              onReset={resetPlan}
              onClose={closePlan}
              budgetInputRef={budgetInputRef}
            />
          ) : null}
        </>
      ) : null}

      {!hasConfiguredTeams ? (
        <TeamConfigurationEmptyState pageLabel="Backlog" />
      ) : view === 'map' && showSummary ? (
        <BacklogMap
          allBugs={allBugs}
          bugs={bugs}
          tierThresholds={tierThresholds}
          highlightedBugIds={highlightedBugIds}
          pickedIds={plan?.pickedIds ?? null}
          selectedKey={mapSelection}
          onSelectedKeyChange={setMapSelection}
        />
      ) : (
        <Box data-preview-layout sx={previewLayoutSx}>
          <BacklogList
            isLoading={isLoading}
            error={error}
            bugs={bugs}
            totalBugCount={totalBugCount}
            compact={compactRows}
            tierThresholds={tierThresholds}
            collapsedTiers={collapsedTiers}
            onToggleTier={toggleTier}
            highlightedBugIds={highlightedBugIds}
            plan={tablePlan}
            view={view}
            preview={previewControls}
          />
          {previewSource && previewing && hasList && selectedId !== null ? (
            <BacklogPreviewPanel
              panelId={BACKLOG_PREVIEW_PANEL_ID} panelRef={selection.panelRef} width={panelWidth} onResize={resizePanel}
              onClose={closePreview} id={selectedId} bug={previewBug} canMove={previewIds.length > 0}
              totalBugCount={allBugs.length} tierThresholds={tierThresholds} load={previewLoad} images={previewSource.images}
            />
          ) : null}
        </Box>
      )}

      {hasConfiguredTeams ? (
        <BacklogOptionsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          compactRows={compactRows}
          onCompactRowsChange={onCompactRowsChange}
          backlogOptions={backlogOptions}
          onBacklogOptionsChange={onBacklogOptionsChange}
        />
      ) : null}
    </>
  )
}
