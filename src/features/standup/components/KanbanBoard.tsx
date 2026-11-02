import { Box, Typography } from '@mui/material'
import { memo, useMemo, useState, type ReactNode } from 'react'
import type { ResolvedWorkItemAssignee, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import { getBoardLayout } from '../utils/boardLayout'
import { getCurrentSprintEffortTotals } from '../utils/sprintEffortTotals'
import { STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
import { KanbanBoardGrid, type BoardRowData } from './KanbanBoardGrid'
import { KanbanBoardLoadingState } from './KanbanBoardLoadingState'
import { AdoErrorNotice } from './AdoErrorNotice'
import type { CardChangeDetail, ChangeHighlightState } from '../hooks/useAdoHistoryHighlights'
import { sortWorkItemsBySprintAndId } from '../utils/workItemSorting'
import { getAssignmentMemberRows } from '../utils/assignmentMembers'
import { getVisibleBoardRows } from '../utils/boardRowVisibility'
import { AttentionBar } from './AttentionBar'
import { getBoardAttention, getHighlightedItemIds, type AttentionFacetKey } from './boardAttention'
import { StandupPresenterBar } from './StandupPresenterBar'
import { getStandupOrder, isStandupSpeakerRow, resolveStandupSpeakers, type StandupOrderMode } from './standupOrder'

const LOADING_LAYOUT = getBoardLayout(true)

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
}: KanbanBoardProps) {
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({})
  const [attentionFacet, setAttentionFacet] = useState<AttentionFacetKey | null>(null)
  const [collapsedRowKeys, setCollapsedRowKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [standupOrderMode, setStandupOrderMode] = useState<StandupOrderMode>('alphabetical')
  const [standupOrderKeys, setStandupOrderKeys] = useState<readonly string[] | null>(null)
  const [standupIndex, setStandupIndex] = useState(0)
  const [spokenKeys, setSpokenKeys] = useState<ReadonlySet<string>>(() => new Set())

  const rows = useMemo<BoardRowData[]>(() => {
    const hasUnassignedItems = workItems.some((item) => {
      const assignee = workItemAssignees[item.id]
      return !assignee || assignee.kind === 'unassigned'
    })
    const hasUnavailableAssignees = workItems.some(
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
    ]
  }, [members, selectedMemberFilter, workItems, workItemAssignees])

  const rowLookup = useMemo(() => {
    return rows.reduce<Record<string, BoardRowData>>((acc, row) => {
      acc[row.key] = row
      return acc
    }, {})
  }, [rows])

  const statusEffortTotals = useMemo(
    () => getCurrentSprintEffortTotals(workItems, currentIterationName),
    [currentIterationName, workItems],
  )

  const statusItemCounts = useMemo(() => {
    const counts: Record<StatusColumn, number> = {
      Blocked: 0,
      New: 0,
      Active: 0,
      Review: 0,
      Done: 0,
    }

    for (const item of workItems) {
      counts[item.status] += 1
    }

    return counts
  }, [workItems])

  const layout = useMemo(() => getBoardLayout(statusItemCounts.Blocked > 0), [statusItemCounts.Blocked])

  const cardsByCell = useMemo(() => {
    const initial = rows.reduce<Record<string, WorkItemSummary[]>>((acc, row) => {
      for (const status of STATUS_COLUMNS) {
        acc[`${row.key}:${status}`] = []
      }
      return acc
    }, {})

    for (const item of workItems) {
      const assignee = workItemAssignees[item.id]
      const assigneeKey = assignee?.kind === 'team-member'
        ? assignee.label.toLowerCase()
        : assignee?.kind === 'history-unavailable'
          ? '__assignee_history_unavailable__'
          : '__unassigned__'
      const resolvedRow = rowLookup[assigneeKey]
      const rowKey = resolvedRow ? resolvedRow.key : '__unassigned__'
      const cellKey = `${rowKey}:${item.status}`

      if (!initial[cellKey]) {
        initial[cellKey] = []
      }

      initial[cellKey].push(item)
    }

    for (const cellItems of Object.values(initial)) {
      cellItems.sort(sortWorkItemsBySprintAndId)
    }

    return initial
  }, [rows, rowLookup, workItems, workItemAssignees])

  const visibleRows = useMemo(
    () => getVisibleBoardRows(rows, cardsByCell, changeHighlightsByItemId, {
      hideUsersWithNoActivity,
      hideUsersWithOnlyStaleDoneWork,
    }),
    [cardsByCell, changeHighlightsByItemId, hideUsersWithNoActivity, hideUsersWithOnlyStaleDoneWork, rows],
  )

  const attention = useMemo(
    () => getBoardAttention(visibleRows, cardsByCell, changeHighlightsByItemId, changeDetailsByItemId),
    [cardsByCell, changeDetailsByItemId, changeHighlightsByItemId, visibleRows],
  )

  const highlightedItemIds = useMemo(() => getHighlightedItemIds(attention, attentionFacet), [attention, attentionFacet])

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
    for (const row of visibleRows) {
      for (const status of STATUS_COLUMNS) {
        for (const item of cardsByCell[`${row.key}:${status}`] ?? []) {
          if (highlightedItemIds.has(item.id)) {
            counts[status] += 1
          }
        }
      }
    }

    return counts
  }, [cardsByCell, highlightedItemIds, visibleRows])

  const setCellExpanded = (cellKey: string, expanded: boolean) => {
    setExpandedCells((current) => ({
      ...current,
      [cellKey]: expanded,
    }))
  }

  const toggleRowCollapsed = (rowKey: string) => {
    setCollapsedRowKeys((current) => {
      const next = new Set(current)
      if (!next.delete(rowKey)) {
        next.add(rowKey)
      }
      return next
    })
  }

  const setAllRowsCollapsed = (collapsed: boolean) => {
    setCollapsedRowKeys(collapsed ? new Set(visibleRows.map((row) => row.key)) : new Set())
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
  } else if (membersError) {
    content = <AdoErrorNotice title="Unable to load team members" message={membersError} />
  } else if (workItemsError) {
    content = <AdoErrorNotice title="Unable to load work items" message={workItemsError} />
  } else if (assigneesError) {
    content = <AdoErrorNotice title="Unable to resolve work item assignees" message={assigneesError} />
  } else if (workItems.length === 0) {
    content = (
      <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
        No cards match the current filters. Try adjusting the quick filter or member selection.
      </Typography>
    )
  } else {
    content = rows.length > 0 && visibleRows.length === 0 ? (
      <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
        All rows are hidden by the Members options. Try adjusting them in Development options.
      </Typography>
    ) : (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <AttentionBar
          facetCounts={attention.facetCounts}
          totalCards={attention.totalCards}
          activeFacet={attentionFacet}
          highlightedCount={highlightedItemIds?.size ?? 0}
          onChange={setAttentionFacet}
        />
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
            changeHighlightsByItemId={changeHighlightsByItemId}
            changeDetailsByItemId={changeDetailsByItemId}
            compactCards={compactCards}
            rolledOverItemIds={rolledOverItemIds}
            highlightedItemIds={highlightedItemIds}
            statusMatchCounts={statusMatchCounts}
            signalsByItemId={attention.signalsByItemId}
            collapsedRowKeys={collapsedRowKeys}
            // Standup decides which lane is open, so manual collapsing pauses until it ends.
            onToggleRowCollapsed={presentingRowKey ? undefined : toggleRowCollapsed}
            onSetAllRowsCollapsed={presentingRowKey ? undefined : setAllRowsCollapsed}
            presentingRowKey={presentingRowKey}
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
