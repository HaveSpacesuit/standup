import {
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material'
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import type { ResolvedWorkItemAssignee, WorkItemSummary } from '../../../ado/queryEngine'

type WorkItemsCardProps = {
  patConfigured: boolean
  isLoading: boolean
  workItemsError: string | null
  assigneesError: string | null
  workItems: WorkItemSummary[]
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
}

export function WorkItemsCard({
  patConfigured,
  isLoading,
  workItemsError,
  assigneesError,
  workItems,
  workItemAssignees,
}: WorkItemsCardProps) {
  let content: ReactNode

  if (!patConfigured) {
    content = (
      <Typography variant="body-sm" color="text.secondary">
        Open Settings and add your Azure DevOps PAT to load work items.
      </Typography>
    )
  } else if (isLoading) {
    content = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={18} />
        <Typography variant="body-sm" color="text.secondary">
          Loading team data...
        </Typography>
      </Box>
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
  } else if (workItems.length === 0) {
    content = (
      <Typography variant="body-sm" color="text.secondary">
        No work items returned for current or next iteration.
      </Typography>
    )
  } else {
    content = (
      <List sx={{ py: 0 }}>
        {workItems.map((item) => (
          <ListItem key={item.id} disableGutters>
            <ListItemText
              primary={item.title}
              secondary={`#${item.id} · ${workItemAssignees[item.id]?.label ?? 'Unassigned'} · ${item.status}`}
            />
          </ListItem>
        ))}
      </List>
    )
  }

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="body-md" sx={{ fontWeight: 700, mb: 1 }}>
          Work Items
        </Typography>
        {content}
      </CardContent>
    </Card>
  )
}
