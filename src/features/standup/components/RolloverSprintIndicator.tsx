import { Box, Tooltip } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgReschedule from '@stratakit/icons/reschedule.svg'

type RolloverSprintIndicatorProps = {
  color?: string
}

export function RolloverSprintIndicator({ color = 'currentColor' }: RolloverSprintIndicatorProps) {
  return (
    <Tooltip title="Rolled over from previous sprint" arrow>
      <Box
        component="span"
        aria-label="Rolled over from previous sprint"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          color,
          lineHeight: 0,
          transform: 'scale(0.82)',
          transformOrigin: 'center',
        }}
      >
        <Icon href={svgReschedule} />
      </Box>
    </Tooltip>
  )
}
