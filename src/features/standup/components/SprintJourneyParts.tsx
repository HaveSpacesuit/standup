import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import type { JourneyCaption, JourneyCaptionTone, JourneyTrail } from '../utils/sprintJourney'
import { getStatusColumnColor } from '../utils/statusColumnStyles'
import { AppTooltip } from './AppTooltip'
import { visuallyHiddenSx } from './developmentCardDisplay'

const CAPTION_COLORS: Record<JourneyCaptionTone, string> = {
  positive: 'success.main',
  attention: 'warning.main',
  info: 'var(--stratakit-color-text-info-base)',
  neutral: 'text.secondary',
}

// StrataKit's icon color outranks an inherited sx color, so icons take theirs inline.
const CAPTION_ICON_COLORS: Record<JourneyCaptionTone, string> = {
  positive: 'var(--stratakit-color-icon-positive-base)',
  attention: 'var(--stratakit-color-icon-attention-base)',
  info: 'var(--stratakit-color-icon-info-base)',
  neutral: 'var(--stratakit-color-icon-neutral-secondary)',
}

/** Where the card is in its sprint, such as "3d in Active" or "Back from Review · 2d". */
export function JourneyCaptionLabel({ caption, truncate = false }: { caption: JourneyCaption; truncate?: boolean }) {
  return (
    <AppTooltip title={caption.tooltip}>
      <Box
        component="span"
        tabIndex={0}
        data-journey-caption={caption.tone}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          flex: truncate ? '0 1 auto' : '0 0 auto',
          minWidth: 0,
          fontSize: 11,
          lineHeight: 1.3,
          fontWeight: caption.tone === 'neutral' ? 400 : 500,
          color: CAPTION_COLORS[caption.tone],
          whiteSpace: 'nowrap',
        }}
      >
        <Box component="span" sx={{ display: 'inline-flex', flex: '0 0 auto' }}>
          <Icon href={caption.iconHref} style={{ color: CAPTION_ICON_COLORS[caption.tone] }} />
        </Box>
        <Box component="span" sx={truncate ? { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } : undefined}>
          {caption.text}
        </Box>
        <Box component="span" sx={visuallyHiddenSx}>. {caption.tooltip}</Box>
      </Box>
    </AppTooltip>
  )
}

export const JOURNEY_TRAIL_HEIGHT = 4

/** A thin bar along the card's bottom edge, one stretch per column it has held this sprint. */
export function JourneyTrailBar({ trail }: { trail: JourneyTrail }) {
  const theme = useTheme()

  return (
    <Box
      component="span"
      role="img"
      aria-label={trail.label}
      data-journey-trail=""
      sx={{
        position: 'absolute',
        left: 3,
        right: 0,
        bottom: 0,
        height: JOURNEY_TRAIL_HEIGHT,
        display: 'flex',
        gap: '1px',
        overflow: 'hidden',
        borderBottomRightRadius: 'inherit',
        pointerEvents: 'none',
      }}
    >
      {trail.lead > 0 ? (
        <Box
          component="span"
          data-journey-lead=""
          sx={{
            flex: `${trail.lead} 1 0`,
            minWidth: 2,
            backgroundImage: 'repeating-linear-gradient(90deg, var(--stratakit-color-border-neutral-base) 0 2px, transparent 2px 4px)',
          }}
        />
      ) : null}
      {trail.segments.map((segment, index) => (
        <Box
          key={index}
          component="span"
          data-journey-segment={segment.status}
          sx={{ flex: `${segment.weight} 1 0`, minWidth: 2, bgcolor: getStatusColumnColor(segment.status, theme.palette) }}
        />
      ))}
    </Box>
  )
}
