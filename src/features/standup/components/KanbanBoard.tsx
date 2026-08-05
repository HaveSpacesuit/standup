import { Avatar, Badge, Button, CircularProgress, Tooltip, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import type { Theme } from '@mui/material/styles'
import { useTheme } from '@mui/material/styles'
import { useMemo, useState, type ReactNode } from 'react'
import type { ResolvedWorkItemAssignee, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import { WorkItemCard } from './WorkItemCard'

const STATUS_COLUMNS = ['Blocked', 'New', 'Active', 'Review', 'Done'] as const
const BOARD_GRID_TEMPLATE = '220px repeat(5, minmax(200px, 1fr))'
const COLLAPSED_CELL_CARD_LIMIT = 3
type StatusColumn = (typeof STATUS_COLUMNS)[number]

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
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
}

type RowData = {
  key: string
  label: string
  avatarUrl?: string
  isUnassigned?: boolean
}

type StatusBadgeColor = 'error' | 'info' | 'primary' | 'warning' | 'success'

function getStatusBadgeColor(status: StatusColumn): StatusBadgeColor {
  switch (status) {
    case 'Blocked':
      return 'error'
    case 'New':
      return 'info'
    case 'Active':
      return 'primary'
    case 'Review':
      return 'warning'
    case 'Done':
      return 'success'
  }
}

function getStatusColumnColor(status: WorkItemSummary['status'], palette: Theme['palette']): string {
  switch (status) {
    case 'Blocked':
      return palette.error.main as string
    case 'New':
      return palette.info.main as string
    case 'Active':
      return palette.primary.main as string
    case 'Review':
      return palette.warning.main as string
    case 'Done':
      return palette.success.main as string
  }
}

function getStatusTint(colorScheme: 'light' | 'dark'): number {
  return colorScheme === 'light' ? 14 : 22
}

function getTintedStatusColor(
  status: WorkItemSummary['status'],
  palette: Theme['palette'],
  colorScheme: 'light' | 'dark',
): string {
  const statusColor = getStatusColumnColor(status, palette)
  const tint = getStatusTint(colorScheme)
  return `color-mix(in srgb, ${statusColor} ${tint}%, var(--stratakit-mui-palette-background-paper))`
}

function getStatusColumnBackground(
  status: WorkItemSummary['status'],
  columnIndex: number,
  palette: Theme['palette'],
  colorScheme: 'light' | 'dark',
): string {
  const base = getTintedStatusColor(status, palette, colorScheme)
  const previousStatus = STATUS_COLUMNS[columnIndex - 1]
  const nextStatus = STATUS_COLUMNS[columnIndex + 1]

  if (!previousStatus && !nextStatus) {
    return base
  }

  const edgeBlend = 2
  const leftEdge = previousStatus
    ? `color-mix(in srgb, ${getTintedStatusColor(previousStatus, palette, colorScheme)} 45%, ${base})`
    : base
  const rightEdge = nextStatus
    ? `color-mix(in srgb, ${base} 45%, ${getTintedStatusColor(nextStatus, palette, colorScheme)})`
    : base

  return `linear-gradient(to right, ${leftEdge} 0%, ${base} ${edgeBlend}%, ${base} ${100 - edgeBlend}%, ${rightEdge} 100%)`
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
  workItemAssignees,
}: KanbanBoardProps) {
  const theme = useTheme()
  const [expandedCells, setExpandedCells] = useState<Record<string, boolean>>({})
  const sortedMembers = useMemo(() => sortMembers(members), [members])

  const rows = useMemo<RowData[]>(() => {
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
    return rows.reduce<Record<string, RowData>>((acc, row) => {
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={18} />
        <Typography variant="body-sm" color="text.secondary">
          Loading board data...
        </Typography>
      </Box>
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
      <Box sx={{ height: '100%' }}>
        <Box
          sx={{
            height: '100%',
            overflowX: 'auto',
          }}
        >
          <Box
            sx={{
              minWidth: 1220,
              height: '100%',
              overflowY: 'auto',
              overflowX: 'hidden',
              scrollbarGutter: 'stable',
              bgcolor: 'background.default',
            }}
          >
            <Box
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 3,
              }}
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: BOARD_GRID_TEMPLATE,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                }}
              >
                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                  }}
                >
                  <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
                    Team member
                  </Typography>
                </Box>

                {STATUS_COLUMNS.map((status, columnIndex) => (
                  <Box
                    key={status}
                    sx={{
                      px: 2,
                      py: 1.5,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      backgroundImage: getStatusColumnBackground(status, columnIndex, theme.palette, colorScheme),
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75 }}>
                      <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
                        {status}
                      </Typography>

                      <Tooltip
                        title={
                          currentIterationName
                            ? `Effort total includes visible items from ${currentIterationName} only.`
                            : 'Effort total includes visible items from the current sprint only.'
                        }
                      >
                        <Box component="span">
                          <Badge
                            badgeContent={statusEffortTotals[status]}
                            color={getStatusBadgeColor(status)}
                            max={999}
                            inline
                            size="small"
                            showZero
                          >
                            <Box sx={{ width: 0, height: 0 }} />
                          </Badge>
                        </Box>
                      </Tooltip>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: BOARD_GRID_TEMPLATE,
                minWidth: 1220,
                bgcolor: 'background.default',
              }}
            >

              {rows.map((row) => (
                <Box key={row.key} sx={{ display: 'contents' }}>
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1.25,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      display: 'flex',
                      alignItems: 'flex-start',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {row.isUnassigned ? (
                        <Avatar sx={{ width: 28, height: 28 }} />
                      ) : (
                        <Avatar alt={row.label} src={row.avatarUrl} sx={{ width: 28, height: 28 }} />
                      )}
                      <Typography variant="body-sm" sx={{ fontWeight: 500 }}>
                        {row.label}
                      </Typography>
                    </Box>
                  </Box>

                  {STATUS_COLUMNS.map((status, columnIndex) => {
                    const cellKey = `${row.key}:${status}`
                    const cellItems = cardsByCell[cellKey] ?? []
                    const isExpanded = expandedCells[cellKey] === true
                    const visibleItems = isExpanded
                      ? cellItems
                      : cellItems.slice(0, COLLAPSED_CELL_CARD_LIMIT)
                    const hiddenCount = Math.max(cellItems.length - visibleItems.length, 0)

                    return (
                      <Box
                        key={cellKey}
                        sx={{
                          pl: 1,
                          pr: 2,
                          py: 1,
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                          backgroundImage: getStatusColumnBackground(
                            status,
                            columnIndex,
                            theme.palette,
                            colorScheme,
                          ),
                          minHeight: 92,
                        }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignContent: 'flex-start',
                            gap: 0.75,
                          }}
                        >
                          {visibleItems.map((item) => (
                            <WorkItemCard key={item.id} item={item} />
                          ))}
                        </Box>

                        {hiddenCount > 0 ? (
                          <Button
                            size="small"
                            variant="text"
                            sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}
                            onClick={() => setCellExpanded(cellKey, true)}
                          >
                            Show {hiddenCount} more
                          </Button>
                        ) : null}

                        {isExpanded && cellItems.length > COLLAPSED_CELL_CARD_LIMIT ? (
                          <Button
                            size="small"
                            variant="text"
                            sx={{ mt: 0.5, px: 0.5, minWidth: 0 }}
                            onClick={() => setCellExpanded(cellKey, false)}
                          >
                            Show less
                          </Button>
                        ) : null}
                      </Box>
                    )
                  })}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    )
  }

  return <Box sx={{ height: '100%' }}>{content}</Box>
}
