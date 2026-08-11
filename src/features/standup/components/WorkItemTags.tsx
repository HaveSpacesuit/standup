import { Chip, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import type { TagLayout } from './workItemCardDisplay'

type WorkItemTagsProps = {
  tagLayout: TagLayout
  sprintName?: string
}

export function WorkItemTags({ tagLayout, sprintName }: WorkItemTagsProps) {
  if (tagLayout.visibleTags.length === 0 && !sprintName) {
    return null
  }

  return (
    <Box
      sx={{
        mt: 0.7,
        pt: 0.6,
        clear: 'both',
        borderTop: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexWrap: 'nowrap',
        gap: 0.5,
        alignItems: 'center',
        minWidth: 0,
        justifyContent: 'space-between',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: 0.5,
          alignItems: 'center',
          minWidth: 0,
          overflow: 'hidden',
          flex: '1 1 auto',
        }}
      >
        {tagLayout.visibleTags.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            size="small"
            variant="outlined"
            sx={{
              flex: '0 1 auto',
              minWidth: 0,
              maxWidth: 110,
              height: 18,
              '& .MuiChip-label': {
                px: 0.75,
                fontSize: 10,
                lineHeight: 1.1,
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }}
          />
        ))}

        {tagLayout.hiddenCount > 0 ? (
          <Chip
            label={`+${tagLayout.hiddenCount}`}
            size="small"
            variant="outlined"
            sx={{
              flex: '0 0 auto',
              height: 18,
              '& .MuiChip-label': {
                px: 0.75,
                fontSize: 10,
                lineHeight: 1.1,
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              },
            }}
          />
        ) : null}
      </Box>

      {sprintName ? (
        <Typography
          variant="body-sm"
          sx={{
            ml: 0.5,
            flex: '0 0 auto',
            fontSize: 10,
            lineHeight: 1.1,
            color: 'text.secondary',
            opacity: 0.85,
            whiteSpace: 'nowrap',
          }}
        >
          Sprint {sprintName}
        </Typography>
      ) : null}
    </Box>
  )
}
