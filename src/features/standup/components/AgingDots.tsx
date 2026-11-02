import Box from '@mui/material/Box'
import { AppTooltip } from './AppTooltip'
import { getToneColor, TERTIARY_TEXT_COLOR, type AgingDots as AgingDotsModel } from './developmentCardDisplay'

const MAX_DOTS = 4

/** Filled dots for each quarter of the stale threshold a card has gone without a tracked change. */
export function AgingDots({ dots, size = 5 }: { dots: AgingDotsModel; size?: number }) {
  const color = dots.tone === 'neutral' ? TERTIARY_TEXT_COLOR : getToneColor(dots.tone)

  return (
    <AppTooltip title={dots.label}>
      <Box
        component="span"
        role="img"
        aria-label={dots.label}
        tabIndex={0}
        data-aging-dots={dots.count}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flex: '0 0 auto', color }}
      >
        {Array.from({ length: MAX_DOTS }, (_, index) => (
          <Box
            key={index}
            component="span"
            sx={{
              width: size,
              height: size,
              borderRadius: '50%',
              bgcolor: index < dots.count ? 'currentColor' : 'transparent',
              boxShadow: index < dots.count ? 'none' : 'inset 0 0 0 1px currentColor',
              opacity: index < dots.count ? 1 : 0.45,
            }}
          />
        ))}
      </Box>
    </AppTooltip>
  )
}
