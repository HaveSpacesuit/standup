import { Badge } from '@mui/material'
import { getStateBadgeColor } from './developmentCardDisplay'

const truncatedBadgeSx = {
  minWidth: 0,
  '& .MuiBadge-badge': { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' },
} as const

/** A work item state the card's column does not already imply, such as "Failed Testing". */
export function StateBadge({ state }: { state: string }) {
  return (
    <Badge
      variant="inline"
      type="outlined"
      size="small"
      color={getStateBadgeColor(state)}
      max={Infinity}
      badgeContent={state}
      title={`State: ${state}`}
      sx={{ ...truncatedBadgeSx, maxWidth: '100%' }}
    />
  )
}

/** What changed recently, such as "Moved to Review · 3h". */
export function ChangeBadge({ text }: { text: string }) {
  return (
    <Badge
      variant="inline"
      type="outlined"
      size="small"
      color="info"
      max={Infinity}
      badgeContent={text}
      title={`Latest change: ${text}`}
      data-change-reason=""
      sx={{ ...truncatedBadgeSx, flex: '0 1 auto' }}
    />
  )
}
