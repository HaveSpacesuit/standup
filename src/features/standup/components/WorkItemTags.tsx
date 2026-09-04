import { Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { RolloverSprintIndicator } from './RolloverSprintIndicator'

type WorkItemTagsProps = {
  tags: string[]
  sprintName?: string
  showRolloverIndicator?: boolean
  rolloverIndicatorColor?: string
}

type BoardTagBadgeProps = {
  label: string
}

function BoardTagBadge({ label }: BoardTagBadgeProps) {
  return (
    <Box
      component="span"
      title={label}
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
  )
}

export function WorkItemTags({ tags, sprintName, showRolloverIndicator = false, rolloverIndicatorColor }: WorkItemTagsProps) {
  if (tags.length === 0 && !sprintName) {
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
            <Box
              component="span"
              sx={{
                '@container (max-width: 210px)': {
                  display: 'none',
                },
              }}
            >
              Sprint{' '}
            </Box>
            {sprintName}
          </Typography>
        </Box>
      ) : null}
    </Box>
  )
}
