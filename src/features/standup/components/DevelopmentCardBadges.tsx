import { Badge } from '@mui/material'
import { AppTooltip } from './AppTooltip'
import { getStateBadgeColor } from './developmentCardDisplay'
import { abbreviateState } from './workItemCardDisplay'

const truncatedBadgeSx = {
  minWidth: 0,
  '& .MuiBadge-badge': { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' },
} as const

/** A work item state the card's column does not already imply, such as "Failed Testing". */
export function StateBadge({ state }: { state: string }) {
  return (
    <AppTooltip title={`State: ${state}`}>
      <Badge
        variant="inline"
        type="outlined"
        size="small"
        color={getStateBadgeColor(state)}
        max={Infinity}
        badgeContent={abbreviateState(state)}
        aria-label={`State: ${state}`}
        tabIndex={0}
        sx={{ ...truncatedBadgeSx, maxWidth: '100%' }}
      />
    </AppTooltip>
  )
}

/** What changed recently, such as "Moved to Review · 3h". */
export function ChangeBadge({ text, fullText }: { text: string; fullText?: string | null }) {
  return (
    <AppTooltip title={`Latest change: ${fullText ?? text}`}>
      <Badge
        variant="inline"
        type="outlined"
        size="small"
        color="info"
        max={Infinity}
        badgeContent={text}
        aria-label={`Latest change: ${fullText ?? text}`}
        tabIndex={0}
        data-change-reason=""
        sx={{ ...truncatedBadgeSx, flex: '0 1 auto' }}
      />
    </AppTooltip>
  )
}
