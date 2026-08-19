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
import type { ChangeHighlightState } from '../hooks/useAdoHistoryHighlights'

const BOARD_GRID_TEMPLATE = '220px repeat(5, minmax(200px, 1fr))'
const COLLAPSED_CELL_CARD_LIMIT = 3

type KanbanBoardProps = {
  patConfigured: boolean
  isLoading: boolean
  colorScheme: 'light' | 'dark'
  membersError: string | null
  workItemsError: string | null
  assigneesError: string | null
  members: TeamMember[]
  workItems: WorkItemSummary[]
  currentIterationName: string | null
  changeHighlightsByItemId: Record<number, ChangeHighlightState>
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
}

function sortMembers(members: TeamMember[]): TeamMember[] {
  const getFirstName = (displayName: string) => displayName.trim().split(/\s+/)[0] ?? ''

  return [...members].sort((a, b) => {
    const firstNameCompare = getFirstName(a.displayName).localeCompare(getFirstName(b.displayName))
    if (firstNameCompare !== 0) {
      return firstNameCompare
    }

    return a.displayName.localeCompare(b.displayName)
  })
}

function getRecentActivitySortValue(item: WorkItemSummary): number {
  if (!item.recentActivityAt) {
    return Number.NEGATIVE_INFINITY
  }

  const parsed = Date.parse(item.recentActivityAt)
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

export function KanbanBoard({
  patConfigured,
  isLoading,
  colorScheme,
  membersError,
  workItemsError,
  assigneesError,
  members,
  workItems,
  currentIterationName,
  changeHighlightsByItemId,
  workItemAssignees,
}: KanbanBoardProps) {
  const theme = useTheme()
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({})
  const renderStatusColumnBackground = (status: StatusColumn, columnIndex: number) =>
    getStatusColumnBackground(status, columnIndex, theme.palette, colorScheme)
  const sortedMembers = useMemo(() => sortMembers(members), [members])

  const rows = useMemo<BoardRowData[]>(() => {
    const membersWithItems = new Set(
      workItems
        .map((item) => workItemAssignees[item.id])
        .filter((assignee): assignee is ResolvedWorkItemAssignee => Boolean(assignee))
        .filter((assignee) => assignee.kind === 'team-member')
        .map((assignee) => assignee.label.toLowerCase()),
    )

    const hasUnassignedItems = workItems.some((item) => {
      const assignee = workItemAssignees[item.id]
      return !assignee || assignee.kind === 'unassigned'
    })

    const memberRows = sortedMembers
      .filter((member) => membersWithItems.has(member.displayName.toLowerCase()))
      .map((member) => ({
        key: member.displayName.toLowerCase(),
        label: member.displayName,
        avatarUrl: member.imageUrl,
        isUnassigned: false,
      }))

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
  }, [sortedMembers, workItems, workItemAssignees])

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
      cellItems.sort((left, right) => getRecentActivitySortValue(right) - getRecentActivitySortValue(left))
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
        Add AZDO_PAT in .env.local to load board data.
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
    content = (
      <Typography variant="body-sm" color="error.main">
        {membersError}
      </Typography>
    )
  } else if (workItemsError) {
    content = (
      <Typography variant="body-sm" color="error.main">
        {workItemsError}
      </Typography>
    )
  } else if (assigneesError) {
    content = (
      <Typography variant="body-sm" color="error.main">
        {assigneesError}
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
      />
    )
  }

  return <Box sx={{ height: '100%' }}>{content}</Box>
}
