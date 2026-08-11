import { Avatar, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import type { WorkItemSummary } from '../../../ado/queryEngine'

type PullRequestMetaRowProps = {
  item: WorkItemSummary
}

export function PullRequestMetaRow({ item }: PullRequestMetaRowProps) {
  return (
    <Box
      sx={{
        mt: 0.8,
        clear: 'both',
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        minWidth: 0,
      }}
    >
      <Avatar
        alt={item.assignedTo?.displayName ?? ''}
        src={item.assignedTo?.imageUrl}
        sx={{ width: 16, height: 16, fontSize: 8 }}
      />
      <Typography
        variant="body-sm"
        sx={{
          fontSize: 10,
          lineHeight: 1.1,
          color: 'text.secondary',
          opacity: 0.85,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.assignedTo?.displayName ?? item.assignedTo?.uniqueName ?? ''}
      </Typography>
    </Box>
  )
}
