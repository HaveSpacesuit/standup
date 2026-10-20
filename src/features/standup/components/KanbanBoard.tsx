import { Box, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useMemo, useState, type ReactNode } from 'react'
import type { ResolvedWorkItemAssignee, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import {
  getStatusColumnBackground,
  STATUS_COLUMNS,
  type StatusColumn,
} from '../utils/statusColumnStyles'
import { KanbanBoardGrid, type BoardRowData } from './KanbanBoardGrid'
import { KanbanBoardLoadingState } from './KanbanBoardLoadingState'
import { AdoErrorNotice } from './AdoErrorNotice'
import type { ChangeHighlightState } from '../hooks/useAdoHistoryHighlights'
import { sortWorkItemsBySprintAndId } from '../utils/workItemSorting'
import { getAssignmentMemberRows } from '../utils/assignmentMembers'

const BOARD_GRID_TEMPLATE = '175px repeat(5, minmax(200px, 1fr))'
const COLLAPSED_CELL_CARD_LIMIT = 3

type KanbanBoardProps = {
  patConfigured: boolean
  isLoading: boolean
  colorScheme: 'light' | 'dark'
  membersError: string | null
  workItemsError: string | null
  assigneesError: string | null
  members: TeamMember[]
  selectedMemberFilter: string
  workItems: WorkItemSummary[]
  currentIterationName: string | null
  changeHighlightsByItemId: Record<number, ChangeHighlightState>
  rolledOverItemIds: Record<number, boolean>
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
}

export function KanbanBoard({
  patConfigured,
  isLoading,
  colorScheme,
  membersError,
  workItemsError,
  assigneesError,
  members,
  selectedMemberFilter,
  workItems,
  currentIterationName,
  changeHighlightsByItemId,
  rolledOverItemIds,
  workItemAssignees,
}: KanbanBoardProps) {
  const theme = useTheme()
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({})
  const renderStatusColumnBackground = (status: StatusColumn, columnIndex: number) =>
    getStatusColumnBackground(status, columnIndex, theme.palette, colorScheme)

  const rows = useMemo<BoardRowData[]>(() => {
    const hasUnassignedItems = workItems.some((item) => {
      const assignee = workItemAssignees[item.id]
      return !assignee || assignee.kind === 'unassigned'
    })

    const memberRows = getAssignmentMemberRows(members, selectedMemberFilter)

    return hasUnassignedItems
      ? [
          ...memberRows,
          {
            key: '__unassigned__',
            label: 'Unassigned',
            isUnassigned: true,
          },
        ]
      : memberRows
  }, [members, selectedMemberFilter, workItems, workItemAssignees])

  const rowLookup = useMemo(() => {
    return rows.reduce<Record<string, BoardRowData>>((acc, row) => {
      acc[row.key] = row
      return acc
    }, {})
  }, [rows])

  const statusEffortTotals = useMemo(() => {
    const totals: Record<StatusColumn, number> = {
      Blocked: 0,
      New: 0,
      Active: 0,
      Review: 0,
      Done: 0,
    }

    for (const item of workItems) {
      if (currentIterationName && item.sprintName !== currentIterationName) {
        continue
      }

      if (typeof item.effort !== 'number') {
        continue
      }

      totals[item.status] += item.effort
    }

    return totals
  }, [currentIterationName, workItems])

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

  const cardsByCell = useMemo(() => {
    const initial = rows.reduce<Record<string, WorkItemSummary[]>>((acc, row) => {
      for (const status of STATUS_COLUMNS) {
        acc[`${row.key}:${status}`] = []
      }
      return acc
    }, {})

    for (const item of workItems) {
      const assignee = workItemAssignees[item.id]
      const assigneeKey = assignee?.kind === 'team-member' ? assignee.label.toLowerCase() : '__unassigned__'
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

  const setCellExpanded = (cellKey: string, expanded: boolean) => {
    setExpandedCells((current) => ({
      ...current,
      [cellKey]: expanded,
    }))
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
      <KanbanBoardLoadingState
        boardGridTemplate={BOARD_GRID_TEMPLATE}
        statusColumns={STATUS_COLUMNS}
        getStatusColumnBackground={renderStatusColumnBackground}
      />
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
    content = (
      <KanbanBoardGrid
        boardGridTemplate={BOARD_GRID_TEMPLATE}
        collapsedCellCardLimit={COLLAPSED_CELL_CARD_LIMIT}
        rows={rows}
        cardsByCell={cardsByCell}
        expandedCells={expandedCells}
        currentIterationName={currentIterationName}
        statusItemCounts={statusItemCounts}
        statusEffortTotals={statusEffortTotals}
        renderStatusColumnBackground={renderStatusColumnBackground}
        onSetCellExpanded={setCellExpanded}
        changeHighlightsByItemId={changeHighlightsByItemId}
        rolledOverItemIds={rolledOverItemIds}
      />
    )
  }

  return <Box sx={{ height: '100%' }}>{content}</Box>
}
