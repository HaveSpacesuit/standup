import { Box, Button, Chip, Typography } from '@mui/material'
import { useId } from 'react'
import { Icon } from '@stratakit/mui'
import svgFlag from '@stratakit/icons/flag.svg'
import { AppTooltip } from './AppTooltip'
import {
  ATTENTION_FACETS,
  ATTENTION_TONE_COLORS,
  type AttentionFacetKey,
} from './boardAttention'

type AttentionBarProps = {
  facetCounts: Record<AttentionFacetKey, number>
  totalCards: number
  activeFacet: AttentionFacetKey | null
  highlightedCount: number
  onChange: (facet: AttentionFacetKey | null) => void
}

function formatCards(count: number): string {
  return `${count} ${count === 1 ? 'card' : 'cards'}`
}

const PRESSED_CHIP_STYLE = {
  backgroundColor: 'var(--stratakit-color-bg-accent-muted)',
  borderColor: 'var(--stratakit-color-border-accent-strong)',
  color: 'var(--stratakit-color-text-accent-strong)',
} as const

/** Facet chips that highlight matching cards in place, so the board keeps its shape while one signal is in focus. */
export function AttentionBar({ facetCounts, totalCards, activeFacet, highlightedCount, onChange }: AttentionBarProps) {
  const labelId = useId()
  const activeLabel = ATTENTION_FACETS.find((facet) => facet.key === activeFacet)?.label

  return (
    <Box
      sx={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 1,
        rowGap: 0.5,
        px: 2,
        py: 0.75,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        role="group"
        aria-labelledby={labelId}
        sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}
      >
        <Typography
          id={labelId}
          component="span"
          variant="body-sm"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mr: 0.5, fontWeight: 700, whiteSpace: 'nowrap' }}
        >
          <Icon href={svgFlag} style={{ color: 'var(--stratakit-color-icon-neutral-secondary)' }} />
          Needs attention
        </Typography>
        {ATTENTION_FACETS.map((facet) => {
          const count = facetCounts[facet.key]
          const pressed = activeFacet === facet.key
          const disabled = count === 0 && !pressed

          return (
            <AppTooltip key={facet.key} title={facet.description} placement="bottom">
              <Chip
                size="small"
                variant="outlined"
                disabled={disabled}
                data-attention-facet={facet.key}
                onClick={disabled ? undefined : () => onChange(pressed ? null : facet.key)}
                // StrataKit's filled chip matches the page surface in light mode and its layer outranks sx,
                // so the pressed state is drawn inline to stay visible.
                style={pressed ? PRESSED_CHIP_STYLE : undefined}
                slotProps={{
                  label: {
                    'aria-pressed': pressed,
                    'aria-label': `${facet.label}, ${formatCards(count)}`,
                  },
                }}
                label={(
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }}>
                    <Box
                      component="span"
                      aria-hidden="true"
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        flex: '0 0 auto',
                        bgcolor: ATTENTION_TONE_COLORS[facet.tone],
                        opacity: disabled ? 0.4 : 1,
                      }}
                    />
                    <Box component="span" sx={{ fontWeight: pressed ? 600 : undefined }}>{facet.label}</Box>
                    <Box component="span" sx={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums', color: disabled ? undefined : 'text.secondary' }}>
                      {count}
                    </Box>
                  </Box>
                )}
              />
            </AppTooltip>
          )
        })}
      </Box>

      {activeFacet ? (
        <Button size="small" variant="text" onClick={() => onChange(null)} sx={{ minWidth: 0 }}>
          Clear
        </Button>
      ) : null}

      <Typography
        role="status"
        component="span"
        variant="body-sm"
        sx={{ ml: 'auto', color: 'text.secondary', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
      >
        {activeFacet ? `${highlightedCount} of ${formatCards(totalCards)} highlighted · ${activeLabel}` : ''}
      </Typography>
    </Box>
  )
}
