import { useCallback, useMemo, useState, type RefObject } from 'react'
import type { TeamIterationOption } from '../../../ado/types'
import { AttentionBar } from '../components/AttentionBar'
import { BacklogList } from '../components/BacklogList'
import { BacklogOptionsDialog } from '../components/BacklogOptionsDialog'
import { BacklogRibbon } from '../components/BacklogRibbon'
import { BacklogToolbar } from '../components/BacklogToolbar'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'
import type { TeamOption } from '../components/TeamToolbarControls'
import {
  countBacklogFacets,
  getBacklogFacetMatches,
  getBacklogFacets,
  summarizeBacklog,
  type BacklogFacetKey,
} from '../utils/backlogAttention'
import { formatBacklogCount } from '../utils/backlogFilter'
import { createDefaultBacklogOptions, type BacklogOptions } from '../utils/backlogOptions'
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
}

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
}: BacklogPageProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [collapsedTiers, toggleTier] = useCollapsedTiers(backlogOptions.startLowCollapsed)
  const [attentionFacet, setAttentionFacet] = useState<BacklogFacetKey | null>(null)
  const { agingMonths, tierThresholds } = backlogOptions
  const hasConfiguredTeams = teamOptions.length > 0
  const hasList = patConfigured && hasConfiguredTeams && !isLoading && !error
  const showSummary = hasList && allBugs.length > 0

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
        </>
      ) : null}

      {hasConfiguredTeams ? (
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
        />
      ) : (
        <TeamConfigurationEmptyState pageLabel="Backlog" />
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
