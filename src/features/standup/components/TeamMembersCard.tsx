import {
  Avatar,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Typography,
} from '@mui/material'
import Box from '@mui/material/Box'
import { useMemo, type ReactNode } from 'react'
import type { TeamMember } from '../../../ado/queryEngine'

type TeamMembersCardProps = {
  patConfigured: boolean
  isLoading: boolean
  membersError: string | null
  members: TeamMember[]
}

export function TeamMembersCard({
  patConfigured,
  isLoading,
  membersError,
  members,
}: TeamMembersCardProps) {
  const sortedMembers = useMemo(() => {
    const getFirstName = (displayName: string) => displayName.trim().split(/\s+/)[0] ?? ''

    return [...members].sort((a, b) => {
      const firstNameCompare = getFirstName(a.displayName).localeCompare(getFirstName(b.displayName))
      if (firstNameCompare !== 0) {
        return firstNameCompare
      }

      return a.displayName.localeCompare(b.displayName)
    })
  }, [members])

  let content: ReactNode

  if (!patConfigured) {
    content = (
      <Typography variant="body-sm" color="text.secondary">
        Open Settings and add your Azure DevOps PAT to load team members.
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
  } else if (membersError) {
    content = (
      <Typography variant="body-sm" color="error.main">
        {membersError}
      </Typography>
    )
  } else if (sortedMembers.length === 0) {
    content = (
      <Typography variant="body-sm" color="text.secondary">
        No team members returned for this team.
      </Typography>
    )
  } else {
    content = (
      <List sx={{ py: 0 }}>
        {sortedMembers.map((member) => {
          const key = member.descriptor ?? member.uniqueName ?? member.id ?? member.displayName
          return (
            <ListItem key={key} disableGutters>
              <ListItemAvatar>
                <Avatar alt={member.displayName} src={member.imageUrl} />
              </ListItemAvatar>
              <ListItemText primary={member.displayName} secondary={member.uniqueName} />
            </ListItem>
          )
        })}
      </List>
    )
  }

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="body-md" sx={{ fontWeight: 700, mb: 1 }}>
          Team Members
        </Typography>
        {content}
      </CardContent>
    </Card>
  )
}
