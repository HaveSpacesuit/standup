import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine, CurrentIterationInfo, ResolvedWorkItemAssignee, SprintScopeChanges, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import type { TagRule } from '../../../ado/workItemStatus'
import { mapWithConcurrency } from '../../../ado/concurrency'
import { applyTagRulesToItem, matchesQuickFilter, matchesTeamMemberFilter, normalizeQuickFilterText } from '../utils/boardFilters'
import { parseDateOnly } from '../utils/dateOnly'

export type SprintScopeState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; startItemIds: ReadonlySet<number>; removedItems: WorkItemSummary[] }

type UseSprintScopeChangesArgs = {
  adoQueryEngine: AdoQueryEngine | null
  team: TeamProfile
  currentIteration: CurrentIterationInfo | null
  includeWorkItemTypes: string[]
  tagRules: TagRule[]
  members: TeamMember[]
  quickFilterInput: string
  selectedMemberFilter: string
  reloadNonce: number
}

type LoadedScope = {
  key: string
  changes: SprintScopeChanges | null
  assignees: Record<number, ResolvedWorkItemAssignee>
}

/** Loads sprint membership as of sprint start (WIQL ASOF) so the forecast can count removed effort,
 * then applies the board's tag, quick-filter, and member filters to the removed items. */
export function useSprintScopeChanges({
  adoQueryEngine,
  team,
  currentIteration,
  includeWorkItemTypes,
  tagRules,
  members,
  quickFilterInput,
  selectedMemberFilter,
  reloadNonce,
}: UseSprintScopeChangesArgs): SprintScopeState {
  const [loaded, setLoaded] = useState<LoadedScope | null>(null)
  const sprintStart = parseDateOnly(currentIteration?.startDate)?.toISOString()
  const iterationPath = currentIteration?.fullName
  const typesKey = includeWorkItemTypes.join('|')
  const key = JSON.stringify([team.id, team.orgName, team.projectName, team.areaPath, iterationPath, sprintStart, typesKey, reloadNonce, members.map((member) => member.uniqueName ?? member.displayName)])

  useEffect(() => {
    if (!adoQueryEngine || !iterationPath || !sprintStart) {
      return
    }

    const abortController = new AbortController()
    const memberLookup = members.reduce<Record<string, string>>((lookup, member) => {
      if (member.uniqueName) {
        lookup[member.uniqueName.toLowerCase()] = member.displayName
      }
      lookup[member.displayName.toLowerCase()] = member.displayName
      return lookup
    }, {})

    adoQueryEngine.getSprintScopeChanges(team, iterationPath, sprintStart, abortController.signal, {
      includeWorkItemTypes: typesKey ? typesKey.split('|') : [],
    })
      .then(async (changes) => {
        const resolved = await mapWithConcurrency(changes.removedItems, 6, async (item) => ({
          id: item.id,
          assignee: await adoQueryEngine.resolveWorkItemAssignee(team, memberLookup, item, abortController.signal),
        }))
        if (!abortController.signal.aborted) {
          setLoaded({ key, changes, assignees: Object.fromEntries(resolved.map((entry) => [entry.id, entry.assignee])) })
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setLoaded({ key, changes: null, assignees: {} })
        }
      })

    return () => {
      abortController.abort()
    }
    // `key` captures every input that changes the query or assignee resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoQueryEngine, key])

  return useMemo<SprintScopeState>(() => {
    if (!adoQueryEngine || !iterationPath || !sprintStart || loaded?.key !== key) {
      return { status: 'loading' }
    }
    if (!loaded.changes) {
      return { status: 'unavailable' }
    }
    const filterText = normalizeQuickFilterText(quickFilterInput)
    const removedItems = loaded.changes.removedItems
      .map((item) => applyTagRulesToItem(item, tagRules))
      .filter((item): item is WorkItemSummary => item !== null)
      .filter((item) => matchesQuickFilter(item, filterText, loaded.assignees[item.id])
        && matchesTeamMemberFilter(loaded.assignees[item.id], selectedMemberFilter))
    return { status: 'ready', startItemIds: new Set(loaded.changes.startItemIds), removedItems }
  }, [adoQueryEngine, iterationPath, sprintStart, loaded, key, quickFilterInput, tagRules, selectedMemberFilter])
}
