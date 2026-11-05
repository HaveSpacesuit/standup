import { useCallback, useMemo, useState, type RefObject } from 'react'
import type { TeamIterationOption } from '../../../ado/types'
import { AttentionBar } from '../components/AttentionBar'
import { BacklogList } from '../components/BacklogList'
import { BacklogMap } from '../components/BacklogMap'
import { BacklogOptionsDialog } from '../components/BacklogOptionsDialog'
import { BacklogPlanBar } from '../components/BacklogPlanBar'
import { BacklogRibbon } from '../components/BacklogRibbon'
import type { BacklogTablePlan } from '../components/BacklogTable'
import { BacklogToolbar } from '../components/BacklogToolbar'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'
import type { TeamOption } from '../components/TeamToolbarControls'
import { useRememberedView } from '../hooks/useRememberedView'
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
import type { BacklogTierKey } from '../utils/backlogTiers'
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
  /** The team's Backlog options: the Value tier thresholds, whether Low starts collapsed, and when a New bug is old. */
  backlogOptions?: BacklogOptions
  onBacklogOptionsChange?: (next: BacklogOptions) => void
  /** Reopen the view used last, List or Map; otherwise the page opens on List. */
  rememberLastView?: boolean
}

const BACKLOG_VIEWS = ['list', 'map'] as const

const DEFAULT_BACKLOG_OPTIONS = createDefaultBacklogOptions()
const NO_ITERATIONS: readonly TeamIterationOption[] = []
const BUG_NOUN = ['bug', 'bugs'] as const

const initialCollapsedTiers = (startLowCollapsed: boolean): ReadonlySet<BacklogTierKey> =>
  new Set<BacklogTierKey>(startLowCollapsed ? ['low'] : [])

/**
 * Which tiers are collapsed. The page owns it, not the table, so it outlasts a refresh, which swaps the table for the
 * loading skeleton. Turning "Start with the Low tier collapsed" on or off applies to the Low tier straight away.
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
        planning={showPlan}
        onPlanningChange={setPlanning}
        canPlan={showSummary}
        view={view}
        onViewChange={setView}
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
        />
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
