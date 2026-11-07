import Box from '@mui/material/Box'
import { AppTooltip } from './AppTooltip'

type WorkItemTagsProps = {
  tags: string[]
}

type BoardTagBadgeProps = {
  label: string
}

function BoardTagBadge({ label }: BoardTagBadgeProps) {
  return (
    <AppTooltip title={label}>
      <Box
        component="span"
        tabIndex={0}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 16,
          maxWidth: '100%',
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
          flex: '0 1 auto',
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
    </AppTooltip>
  )
}

export function WorkItemTags({ tags }: WorkItemTagsProps) {
  if (tags.length === 0) {
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
        alignItems: 'flex-start',
        minWidth: 0,
        justifyContent: 'space-between',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0.5,
          alignItems: 'center',
          minWidth: 0,
          flex: '1 1 auto',
        }}
      >
        {tags.map((tag) => (
          <BoardTagBadge key={tag} label={tag} />
        ))}
      </Box>
    </Box>
  )
}
