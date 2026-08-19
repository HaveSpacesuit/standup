import { Typography } from '@mui/material'
import Box from '@mui/material/Box'
import type { TagLayout } from './workItemCardDisplay'

type WorkItemTagsProps = {
  tagLayout: TagLayout
  sprintName?: string
}

type BoardTagBadgeProps = {
  label: string
  isOverflow?: boolean
}

function BoardTagBadge({ label, isOverflow = false }: BoardTagBadgeProps) {
  return (
    <Box
      component="span"
      title={label}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 16,
        maxWidth: isOverflow ? 'none' : 110,
        minWidth: 0,
        px: 0.75,
        borderRadius: 999,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        color: 'text.secondary',
        fontSize: 9,
        lineHeight: 1.1,
        fontWeight: 500,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flex: isOverflow ? '0 0 auto' : '0 1 auto',
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Box>
    </Box>
  )
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
          <BoardTagBadge key={tag} label={tag} />
        ))}

        {tagLayout.hiddenCount > 0 ? <BoardTagBadge label={`+${tagLayout.hiddenCount}`} isOverflow /> : null}
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
