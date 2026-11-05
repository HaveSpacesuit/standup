import { Box, Typography } from '@mui/material'
import { memo, useMemo, useState, type ReactNode } from 'react'
import type { IdentityRef } from '../../../ado/identity'
import { toIdentityKeys } from '../../../ado/identity'
import type {
  IterationWindowInfo,
  ResolvedWorkItemAssignee,
  TeamIterationOption,
  TeamMember,
  WorkItemSummary,
} from '../../../ado/queryEngine'
import { getBoardLayout } from '../utils/boardLayout'
import { getColumnFlows } from '../utils/columnFlow'
import { getCurrentSprintEffortTotals } from '../utils/sprintEffortTotals'
import { STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
import { KanbanBoardGrid, type BoardRowData } from './KanbanBoardGrid'
import { KanbanBoardLoadingState } from './KanbanBoardLoadingState'
import { AdoErrorNotice } from './AdoErrorNotice'
import type { CardChangeDetail, ChangeHighlightState } from '../hooks/useAdoHistoryHighlights'
import type { EffortFlowPoint } from '../hooks/useEffortFlowHistory'
import { sortWorkItemsBySprintAndId } from '../utils/workItemSorting'
import { getAssignmentMemberRows } from '../utils/assignmentMembers'
import { getVisibleBoardRows } from '../utils/boardRowVisibility'
import {
  getRemovedCardStatus,
  getSprintLensRowKey,
  getSprintLensRows,
  getSprintRemovals,
  isSprintLensItem,
  resolveSprintLensScope,
  SCOPE_REMOVED_ROW_KEY,
} from '../utils/sprintLens'
import type { SprintDeparture, SprintJourney } from '../utils/sprintJourney'
import { getReplayFlowPoints, getSprintReplayBoard } from '../utils/sprintReplay'
import type { SprintScopeState } from '../hooks/useSprintScopeChanges'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import { AttentionBar } from './AttentionBar'
import {
  getBoardAttention,
  getHighlightedItemIds,
  PEOPLE_ATTENTION_FACETS,
  SPRINT_ATTENTION_FACETS,
  type AttentionFacetKey,
} from './boardAttention'
import { StandupPresenterBar } from './StandupPresenterBar'
import { getStandupOrder, isStandupSpeakerRow, resolveStandupSpeakers, type StandupOrderMode } from './standupOrder'

const LOADING_LAYOUT = getBoardLayout(true)
const NO_JOURNEYS: Record<number, SprintJourney> = {}
const NO_HIGHLIGHTS: Record<number, ChangeHighlightState> = {}
const NO_QA_BUCKETS: QualityAssuranceBucket[] = []
const NO_QA_TESTERS: TeamMember[] = []

/** People lays the board out by developer; Sprint lays the same cards out by sprint. */
export type BoardLens = 'people' | 'sprint'

type KanbanBoardProps = {
  patConfigured: boolean
  isLoading: boolean
  membersError: string | null
  workItemsError: string | null
  assigneesError: string | null
  members: TeamMember[]
  selectedMemberFilter: string
  hideUsersWithNoActivity?: boolean
  hideUsersWithOnlyStaleDoneWork?: boolean
  workItems: WorkItemSummary[]
  currentIterationName: string | null
  changeHighlightsByItemId: Record<number, ChangeHighlightState>
  changeDetailsByItemId?: Record<number, CardChangeDetail>
  compactCards?: boolean
  rolledOverItemIds: Record<number, boolean>
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
  /** Walks the team lane by lane; see StandupPresenterBar. */
  standupActive?: boolean
  onStandupEnd?: () => void
  lens?: BoardLens
  /** Sprint lens only: each card's journey through the current sprint. */
  journeysByItemId?: Record<number, SprintJourney>
  /** Sprint lens only: sprint-start membership, which splits the current sprint into committed, added, and removed lanes. */
  sprintScope?: SprintScopeState
  /** Sprint lens only: when and from which column each removed card left the sprint. */
  departuresByItemId?: Record<number, SprintDeparture>
  /** Sprint lens only: dates for the sprint lanes. */
  iterationWindow?: IterationWindowInfo
  teamIterations?: TeamIterationOption[]
  /** Sprint lens only: each column's effort by day, for the flow headers. */
  effortFlowPoints?: EffortFlowPoint[]
  /**
   * Sprint lens only: replays the current sprint to the end of a past day, showing each card where it
   * stood then. Null or unset shows today.
   */
  replayAt?: number | null
  includeQaTestersInStandup?: boolean
  qaBuckets?: QualityAssuranceBucket[]
  /** The team's QA testers, resolved from QA options or inferred from QA activity. */
  qaTesters?: TeamMember[]
}

export const KanbanBoard = memo(function KanbanBoard({
  patConfigured,
  isLoading,
  membersError,
  workItemsError,
  assigneesError,
  members,
  selectedMemberFilter,
  hideUsersWithNoActivity = false,
  hideUsersWithOnlyStaleDoneWork = false,
  workItems,
  currentIterationName,
  changeHighlightsByItemId,
  changeDetailsByItemId,
  compactCards = false,
  rolledOverItemIds,
  workItemAssignees,
  standupActive = false,
  onStandupEnd,
  lens = 'people',
  journeysByItemId = NO_JOURNEYS,
  sprintScope,
  departuresByItemId,
  iterationWindow,
  teamIterations,
  effortFlowPoints,
  replayAt = null,
  includeQaTestersInStandup = false,
  qaBuckets = NO_QA_BUCKETS,
  qaTesters = NO_QA_TESTERS,
}: KanbanBoardProps) {
  const isSprintLens = lens === 'sprint'
  const replayingAt = isSprintLens ? replayAt : null
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({})
  const [attentionFacet, setAttentionFacet] = useState<AttentionFacetKey | null>(null)
  // Explicit choices only; lanes without one fall back to their defaultCollapsed.
  const [collapseOverrides, setCollapseOverrides] = useState<Record<string, boolean>>({})
  const [standupOrderMode, setStandupOrderMode] = useState<StandupOrderMode>('alphabetical')
  const [standupOrderKeys, setStandupOrderKeys] = useState<readonly string[] | null>(null)
  const [standupIndex, setStandupIndex] = useState(0)
  const [spokenKeys, setSpokenKeys] = useState<ReadonlySet<string>>(() => new Set())
  const qaStandupData = useMemo(() => {
    if (!standupActive || !includeQaTestersInStandup || isSprintLens) {
      return { rows: [] as BoardRowData[], itemsByRow: new Map<string, WorkItemSummary[]>() }
    }

    const testersByIdentity = new Map<string, TeamMember>()
    for (const member of qaTesters) {
      for (const key of toIdentityKeys(member)) testersByIdentity.set(key, member)
    }

    const itemsByRow = new Map<string, WorkItemSummary[]>()
    const membersByRow = new Map<string, TeamMember>()
    for (const item of qaBuckets.flatMap((bucket) => bucket.items)) {
      const member = toIdentityKeys(item.assignedTo)
        .map((key) => testersByIdentity.get(key))
        .find((candidate): candidate is TeamMember => candidate !== undefined)
      if (!member) continue

      const rowKey = `__qa_tester__:${toIdentityKeys(member)[0] ?? member.displayName.toLocaleLowerCase()}`
      membersByRow.set(rowKey, member)
      const items = itemsByRow.get(rowKey) ?? []
      items.push(item)
      itemsByRow.set(rowKey, items)
    }

    const rows = [...membersByRow].map(([key, member]): BoardRowData => ({
      key,
      label: `${member.displayName} · QA`,
      avatarUrl: member.imageUrl,
      avatarDescriptor: member.descriptor,
      memberIdentity: { displayName: member.displayName, uniqueName: member.uniqueName, imageUrl: member.imageUrl },
      isQaTester: true,
    }))
    return { rows, itemsByRow }
  }, [includeQaTestersInStandup, isSprintLens, qaBuckets, qaTesters, standupActive])

  const boardItems = useMemo(
    () => (isSprintLens ? workItems.filter(isSprintLensItem) : workItems),
    [isSprintLens, workItems],
  )

  const lensScope = useMemo(
    () => (isSprintLens && sprintScope?.status === 'ready'
      ? resolveSprintLensScope(boardItems, currentIterationName, sprintScope)
      : null),
    [boardItems, currentIterationName, isSprintLens, sprintScope],
  )

  // A past day redraws the current sprint from history; owners still come from the live board.
  const replayBoard = useMemo(
    () => (replayingAt === null
      ? null
      : getSprintReplayBoard({ items: boardItems, journeysByItemId, scope: lensScope, departuresByItemId, currentIterationName, at: replayingAt })),
    [boardItems, currentIterationName, departuresByItemId, journeysByItemId, lensScope, replayingAt],
  )
  const shownItems = replayBoard?.items ?? boardItems
  const shownScope = replayBoard ? replayBoard.scope : lensScope
  const shownJourneys = replayBoard?.journeysByItemId ?? journeysByItemId
  const shownHighlights = replayBoard ? NO_HIGHLIGHTS : changeHighlightsByItemId
  const shownChangeDetails = replayBoard ? undefined : changeDetailsByItemId

  const rows = useMemo<BoardRowData[]>(() => {
    if (isSprintLens) {
      return getSprintLensRows(shownItems, { currentIterationName, iterationWindow, teamIterations, scope: shownScope, rolledOverItemIds })
    }

    const hasUnassignedItems = boardItems.some((item) => {
      const assignee = workItemAssignees[item.id]
      return !assignee || assignee.kind === 'unassigned'
    })
    const hasUnavailableAssignees = boardItems.some(
      (item) => workItemAssignees[item.id]?.kind === 'history-unavailable',
    )

    const memberRows = getAssignmentMemberRows(members, selectedMemberFilter)

    return [
      ...memberRows,
      ...(hasUnassignedItems
        ? [{
            key: '__unassigned__',
            label: 'Unassigned',
            isUnassigned: true,
          }]
        : []),
      ...(hasUnavailableAssignees
        ? [{
            key: '__assignee_history_unavailable__',
            label: 'Assignee unavailable',
          }]
        : []),
      ...qaStandupData.rows,
    ]
  }, [boardItems, currentIterationName, isSprintLens, iterationWindow, members, qaStandupData.rows, rolledOverItemIds, selectedMemberFilter, shownItems, shownScope, teamIterations, workItemAssignees])

  const rowLookup = useMemo(() => {
    return rows.reduce<Record<string, BoardRowData>>((acc, row) => {
      acc[row.key] = row
      return acc
    }, {})
  }, [rows])

  // The Sprint lens has no person lanes, so each card carries its developer instead.
  const ownerByItemId = useMemo(() => {
    if (!isSprintLens) {
      return undefined
    }

    const membersByName = new Map(members.map((member) => [member.displayName.trim().toLowerCase(), member]))
    const owners = new Map<number, IdentityRef>()
    const removedAssignees = sprintScope?.status === 'ready' ? sprintScope.assignees : undefined
    const entries: Array<[WorkItemSummary, ResolvedWorkItemAssignee | undefined]> = [
      ...boardItems.map((item): [WorkItemSummary, ResolvedWorkItemAssignee | undefined] => [item, workItemAssignees[item.id]]),
      ...(lensScope?.removedItems ?? []).map((item): [WorkItemSummary, ResolvedWorkItemAssignee | undefined] => [item, removedAssignees?.[item.id]]),
    ]
    for (const [item, assignee] of entries) {
      if (assignee?.kind !== 'team-member' || owners.has(item.id)) {
        continue
      }

      const member = membersByName.get(assignee.label.trim().toLowerCase())
      owners.set(item.id, member
        ? { displayName: member.displayName, uniqueName: member.uniqueName, imageUrl: member.imageUrl }
        : { displayName: assignee.label })
    }
    return owners
  }, [boardItems, isSprintLens, lensScope, members, sprintScope, workItemAssignees])

  const removalsByItemId = useMemo(
    () => (shownScope
      ? getSprintRemovals(shownScope.removedItems, departuresByItemId, { currentIterationName, iterationWindow, teamIterations })
      : undefined),
    [currentIterationName, departuresByItemId, iterationWindow, shownScope, teamIterations],
  )

  const statusEffortTotals = useMemo(
    () => getCurrentSprintEffortTotals(shownItems, currentIterationName),
    [shownItems, currentIterationName],
  )

  const columnFlows = useMemo(() => {
    if (!isSprintLens || !effortFlowPoints) {
      return null
    }
    const items = currentIterationName ? shownItems.filter((item) => item.sprintName === currentIterationName) : shownItems
    return getColumnFlows({
      points: replayingAt === null ? effortFlowPoints : getReplayFlowPoints(effortFlowPoints, replayingAt),
      items,
      journeysByItemId: shownJourneys,
      now: replayingAt ?? Date.now(),
    })
  }, [currentIterationName, effortFlowPoints, isSprintLens, replayingAt, shownItems, shownJourneys])

  const statusItemCounts = useMemo(() => {
    const counts: Record<StatusColumn, number> = {
      Blocked: 0,
      New: 0,
      Active: 0,
      Review: 0,
      Done: 0,
    }

    for (const item of shownItems) {
      counts[item.status] += 1
    }

    return counts
  }, [shownItems])

  const layout = useMemo(() => getBoardLayout(statusItemCounts.Blocked > 0), [statusItemCounts.Blocked])

  const cardsByCell = useMemo(() => {
    const initial = rows.reduce<Record<string, WorkItemSummary[]>>((acc, row) => {
      for (const status of STATUS_COLUMNS) {
        acc[`${row.key}:${status}`] = []
      }
      return acc
    }, {})

    for (const item of shownItems) {
      let rowKey: string
      if (isSprintLens) {
        rowKey = getSprintLensRowKey(item, { currentIterationName, scope: shownScope })
      } else {
        const assignee = workItemAssignees[item.id]
        const assigneeKey = assignee?.kind === 'team-member'
          ? assignee.label.toLowerCase()
          : assignee?.kind === 'history-unavailable'
            ? '__assignee_history_unavailable__'
            : '__unassigned__'
        rowKey = rowLookup[assigneeKey] ? assigneeKey : '__unassigned__'
      }
      const cellKey = `${rowKey}:${item.status}`

      if (!initial[cellKey]) {
        initial[cellKey] = []
      }

      initial[cellKey].push(item)
    }

    for (const [rowKey, items] of qaStandupData.itemsByRow) {
      for (const item of items) {
        const cellKey = `${rowKey}:${item.status}`
        initial[cellKey] ??= []
        initial[cellKey].push(item)
      }
    }

    if (shownScope) {
      for (const item of shownScope.removedItems) {
        const status = getRemovedCardStatus(item, departuresByItemId?.[item.id])
        // The Blocked rail is too narrow for a card, and a blocked card was mid-work when it left.
        const column = status === 'Blocked' && layout.blockedRail ? 'Active' : status
        const cellKey = `${SCOPE_REMOVED_ROW_KEY}:${column}`
        if (!initial[cellKey]) {
          initial[cellKey] = []
        }
        initial[cellKey].push(item)
      }
    }

    for (const cellItems of Object.values(initial)) {
      cellItems.sort(sortWorkItemsBySprintAndId)
    }

    return initial
  }, [currentIterationName, departuresByItemId, isSprintLens, layout.blockedRail, qaStandupData.itemsByRow, rows, rowLookup, shownItems, shownScope, workItemAssignees])

  const visibleRows = useMemo(
    // Members options hide people, so they leave sprint lanes alone.
    () => isSprintLens ? rows : getVisibleBoardRows(rows, cardsByCell, changeHighlightsByItemId, {
      hideUsersWithNoActivity,
      hideUsersWithOnlyStaleDoneWork,
    }),
    [cardsByCell, changeHighlightsByItemId, hideUsersWithNoActivity, hideUsersWithOnlyStaleDoneWork, isSprintLens, rows],
  )

  // Removed cards no longer count toward the sprint, so they raise no attention.
  const liveRows = useMemo(() => visibleRows.filter((row) => !row.ghost && !row.isQaTester), [visibleRows])

  const attention = useMemo(
    () => getBoardAttention(
      liveRows,
      cardsByCell,
      shownHighlights,
      shownChangeDetails,
      ownerByItemId ? { rowMemberForItem: (item) => ownerByItemId.get(item.id), journeysByItemId: shownJourneys } : undefined,
    ),
    [cardsByCell, liveRows, ownerByItemId, shownChangeDetails, shownHighlights, shownJourneys],
  )

  // A past day's board is for looking back, so Needs attention steps aside.
  const highlightedItemIds = useMemo(
    () => (replayBoard ? null : getHighlightedItemIds(attention, attentionFacet)),
    [attention, attentionFacet, replayBoard],
  )

  const hasStandupSpeakers = visibleRows.some(isStandupSpeakerRow)
  // The order is fixed when standup starts, so refreshed data can't reshuffle people mid-meeting.
  if (standupActive && standupOrderKeys === null && hasStandupSpeakers) {
    setStandupOrderKeys(getStandupOrder(visibleRows, standupOrderMode, cardsByCell, attention.signalsByItemId))
    setStandupIndex(0)
    setSpokenKeys(new Set())
  } else if (!standupActive && standupOrderKeys !== null) {
    setStandupOrderKeys(null)
  }

  const standupSpeakers = useMemo(
    () => (standupActive ? resolveStandupSpeakers(standupOrderKeys ?? [], visibleRows) : []),
    [standupActive, standupOrderKeys, visibleRows],
  )
  const speakerIndex = Math.min(standupIndex, Math.max(standupSpeakers.length - 1, 0))
  const presentingRowKey = standupSpeakers[speakerIndex]?.key ?? null

  const statusMatchCounts = useMemo(() => {
    if (!highlightedItemIds) {
      return null
    }

    const counts: Record<StatusColumn, number> = { Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 }
    for (const row of liveRows) {
      for (const status of STATUS_COLUMNS) {
        for (const item of cardsByCell[`${row.key}:${status}`] ?? []) {
          if (highlightedItemIds.has(item.id)) {
            counts[status] += 1
          }
        }
      }
    }

    return counts
  }, [cardsByCell, highlightedItemIds, liveRows])

  const setCellExpanded = (cellKey: string, expanded: boolean) => {
    setExpandedCells((current) => ({
      ...current,
      [cellKey]: expanded,
    }))
  }

  const collapsedRowKeys = useMemo<ReadonlySet<string>>(
    () => new Set(visibleRows.filter((row) => collapseOverrides[row.key] ?? row.defaultCollapsed ?? false).map((row) => row.key)),
    [collapseOverrides, visibleRows],
  )

  const toggleRowCollapsed = (rowKey: string) => {
    setCollapseOverrides((current) => ({ ...current, [rowKey]: !collapsedRowKeys.has(rowKey) }))
  }

  const setAllRowsCollapsed = (collapsed: boolean) => {
    setCollapseOverrides(Object.fromEntries(visibleRows.map((row) => [row.key, collapsed])))
  }

  const goToSpeaker = (index: number) => {
    if (index === speakerIndex) {
      return
    }

    const leaving = standupSpeakers[speakerIndex]
    if (leaving) {
      setSpokenKeys((current) => new Set(current).add(leaving.key))
    }

    if (index >= standupSpeakers.length) {
      onStandupEnd?.()
      return
    }

    setStandupIndex(Math.max(0, index))
  }

  const changeStandupOrder = (mode: StandupOrderMode) => {
    setStandupOrderMode(mode)
    setStandupOrderKeys(hasStandupSpeakers ? getStandupOrder(visibleRows, mode, cardsByCell, attention.signalsByItemId) : null)
    setStandupIndex(0)
    setSpokenKeys(new Set())
  }

  let content: ReactNode

  if (!patConfigured) {
    content = (
      <Typography variant="body-sm" color="text.secondary">
        Open Settings and add your Azure DevOps PAT to load board data.
      </Typography>
    )
  } else if (isLoading) {
    content = (
      <KanbanBoardLoadingState layout={LOADING_LAYOUT} statusColumns={STATUS_COLUMNS} />
    )
  } else if (membersError && !isSprintLens) {
    content = <AdoErrorNotice title="Unable to load team members" message={membersError} />
  } else if (workItemsError) {
    content = <AdoErrorNotice title="Unable to load work items" message={workItemsError} />
  } else if (assigneesError && !isSprintLens) {
    content = <AdoErrorNotice title="Unable to resolve work item assignees" message={assigneesError} />
  } else if (boardItems.length === 0 && qaStandupData.itemsByRow.size === 0) {
    content = (
      <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
        No cards match the current filters. Try adjusting the quick filter or member selection.
      </Typography>
    )
  } else if (replayBoard && rows.length === 0) {
    content = (
      <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
        No cards on the board have history for this day.
      </Typography>
    )
  } else {
    content = !isSprintLens && rows.length > 0 && visibleRows.length === 0 ? (
      <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
        All rows are hidden by the Members options. Try adjusting them in Development options.
      </Typography>
    ) : (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {replayBoard ? null : (
          <AttentionBar
            facetCounts={attention.facetCounts}
            totalCards={attention.totalCards}
            activeFacet={attentionFacet}
            highlightedCount={highlightedItemIds?.size ?? 0}
            onChange={setAttentionFacet}
            facets={isSprintLens ? SPRINT_ATTENTION_FACETS : PEOPLE_ATTENTION_FACETS}
          />
        )}
        <Box sx={{ flex: '1 1 auto', minHeight: 0 }}>
          <KanbanBoardGrid
            layout={layout}
            rows={visibleRows}
            cardsByCell={cardsByCell}
            expandedCells={expandedCells}
            currentIterationName={currentIterationName}
            statusItemCounts={statusItemCounts}
            statusEffortTotals={statusEffortTotals}
            onSetCellExpanded={setCellExpanded}
            changeHighlightsByItemId={shownHighlights}
            changeDetailsByItemId={shownChangeDetails}
            compactCards={compactCards}
            rolledOverItemIds={rolledOverItemIds}
            highlightedItemIds={highlightedItemIds}
            statusMatchCounts={statusMatchCounts}
            signalsByItemId={replayBoard ? undefined : attention.signalsByItemId}
            collapsedRowKeys={collapsedRowKeys}
            // Standup decides which lane is open, so manual collapsing pauses until it ends.
            onToggleRowCollapsed={presentingRowKey ? undefined : toggleRowCollapsed}
            onSetAllRowsCollapsed={presentingRowKey ? undefined : setAllRowsCollapsed}
            presentingRowKey={presentingRowKey}
            cornerLabel={isSprintLens ? (lensScope ? 'Scope' : 'Sprint') : undefined}
            ownerByItemId={ownerByItemId}
            removalsByItemId={removalsByItemId}
            journeysByItemId={isSprintLens ? shownJourneys : undefined}
            columnFlows={columnFlows}
            cardsAsOf={replayingAt ?? undefined}
          />
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {standupActive ? (
        <StandupPresenterBar
          speakers={standupSpeakers}
          currentIndex={speakerIndex}
          spokenKeys={spokenKeys}
          orderMode={standupOrderMode}
          onOrderModeChange={changeStandupOrder}
          onGoTo={goToSpeaker}
          onEnd={() => onStandupEnd?.()}
        />
      ) : null}
      <Box sx={{ flex: '1 1 auto', minHeight: 0 }}>{content}</Box>
    </Box>
  )
})
