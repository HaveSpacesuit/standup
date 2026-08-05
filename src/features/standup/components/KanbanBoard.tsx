import { Avatar, CircularProgress, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { useMemo, type ReactNode } from 'react'
import type { ResolvedWorkItemAssignee, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import { WorkItemCard } from './WorkItemCard'

const STATUS_COLUMNS = ['Blocked', 'New', 'Active', 'Review', 'Done'] as const
const BOARD_GRID_TEMPLATE = '220px repeat(5, minmax(200px, 1fr))'

type KanbanBoardProps = {
  patConfigured: boolean
  isLoading: boolean
  membersError: string | null
  workItemsError: string | null
  assigneesError: string | null
  members: TeamMember[]
  workItems: WorkItemSummary[]
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
}

type RowData = {
  key: string
  label: string
  avatarUrl?: string
  isUnassigned?: boolean
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

export function KanbanBoard({
  patConfigured,
  isLoading,
  membersError,
  workItemsError,
  assigneesError,
  members,
  workItems,
  workItemAssignees,
}: KanbanBoardProps) {
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

    return initial
  }, [rows, rowLookup, workItems, workItemAssignees])

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
      <Box
        sx={{
          overflowX: 'auto',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: BOARD_GRID_TEMPLATE,
            minWidth: 1220,
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

          {STATUS_COLUMNS.map((status) => (
            <Box
              key={status}
              sx={{
                px: 2,
                py: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
                {status}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            maxHeight: 'calc(100vh - 220px)',
            overflowY: 'auto',
            overflowX: 'visible',
          }}
        >
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
                    gap: 1,
                  }}
                >
                  {row.isUnassigned ? (
                    <Avatar sx={{ width: 28, height: 28 }} />
                  ) : (
                    <Avatar alt={row.label} src={row.avatarUrl} sx={{ width: 28, height: 28 }} />
                  )}
                  <Typography variant="body-sm" sx={{ fontWeight: row.isUnassigned ? 700 : 500 }}>
                    {row.label}
                  </Typography>
                </Box>

                {STATUS_COLUMNS.map((status) => {
                  const cellItems = cardsByCell[`${row.key}:${status}`] ?? []

                  return (
                    <Box
                      key={`${row.key}:${status}`}
                      sx={{
                        pl: 1,
                        pr: 2,
                        py: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.default',
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
                        {cellItems.map((item) => (
                          <WorkItemCard key={item.id} item={item} />
                        ))}
                      </Box>
                    </Box>
                  )
                })}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    )
  }

  return <Box sx={{ mb: 2 }}>{content}</Box>
}
