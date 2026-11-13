import { Box } from '@mui/material'
import type { WorkItemSummary } from '../../../ado/types'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'

export const EFFORT_BADGE_HEIGHT = 18

export function EffortBadge({ effort, struck = false }: { effort: number; struck?: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        minWidth: 20,
        height: EFFORT_BADGE_HEIGHT,
        px: 1.25,
        borderRadius: 999,
        border: '1px solid var(--stratakit-color-border-neutral-muted)',
        color: struck ? TERTIARY_TEXT_COLOR : 'text.secondary',
        fontSize: 11,
        fontWeight: 600,
        lineHeight: '16px',
        textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
        textDecoration: struck ? 'line-through' : undefined,
      }}
    >
      <Box component="span" sx={visuallyHiddenSx}>{struck ? 'Removed effort ' : 'Effort '}</Box>
      {effort}
    </Box>
  )
}

export function WorkItemTypeIcon({ item }: { item: Pick<WorkItemSummary, 'workItemIconUrl' | 'workItemType'> }) {
  if (!item.workItemIconUrl) return null
  return (
    <Box
      component="span"
      role={item.workItemType ? 'img' : undefined}
      aria-label={item.workItemType}
      aria-hidden={item.workItemType ? undefined : true}
      sx={{
        width: 14,
        height: 14,
        display: 'inline-block',
        verticalAlign: 'text-bottom',
        mr: 0.5,
        // Keep the ADO icon's shape while letting CSS follow the current color scheme.
        bgcolor: 'var(--stratakit-color-icon-neutral-base)',
        maskImage: `url(${JSON.stringify(item.workItemIconUrl)})`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        '@media (forced-colors: active)': {
          bgcolor: 'CanvasText',
          forcedColorAdjust: 'none',
        },
      }}
    />
  )
}
