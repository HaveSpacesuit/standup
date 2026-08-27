import { Typography } from '@mui/material'
import Box from '@mui/material/Box'
import type { TagLayout } from './workItemCardDisplay'
import { RolloverSprintIndicator } from './RolloverSprintIndicator'

type WorkItemTagsProps = {
  tagLayout: TagLayout
  sprintName?: string
  showRolloverIndicator?: boolean
  rolloverIndicatorColor?: string
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

export function WorkItemTags({ tagLayout, sprintName, showRolloverIndicator = false, rolloverIndicatorColor }: WorkItemTagsProps) {
  if (tagLayout.visibleTags.length === 0 && !sprintName) {
    return null
  }

  return (
    <Box
      sx={{
        mt: 0.7,
        clear: 'both',
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
        <Box sx={{ ml: 0.5, display: 'inline-flex', alignItems: 'center', gap: 0.35, flex: '0 0 auto', color: 'text.secondary', opacity: 0.85 }}>
          {showRolloverIndicator ? <RolloverSprintIndicator color={rolloverIndicatorColor} /> : null}
          <Typography
            variant="body-sm"
            sx={{
              fontSize: 10,
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
            }}
          >
            Sprint {sprintName}
          </Typography>
        </Box>
      ) : null}
    </Box>
  )
}
