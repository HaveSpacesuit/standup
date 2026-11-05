import { Box, Button, Chip, Typography } from '@mui/material'
import { useId } from 'react'
import { Icon } from '@stratakit/mui'
import svgFlag from '@stratakit/icons/flag.svg'
import { AppTooltip } from './AppTooltip'
import { ATTENTION_TONE_COLORS, type AttentionTone } from './boardAttention'

/** What a chip needs from a facet; the board's facets and the backlog's both fit. */
export type AttentionBarFacet<Key extends string> = {
  key: Key
  label: string
  tone: AttentionTone
  description: string
}

type AttentionBarProps<Key extends string> = {
  facetCounts: Record<Key, number>
  /** How many items the highlight is out of, such as the cards on the board. */
  totalItems: number
  activeFacet: Key | null
  highlightedCount: number
  onChange: (facet: Key | null) => void
  /** The facets this page offers, in bar order. */
  facets: readonly AttentionBarFacet<Key>[]
  /** The item noun, singular then plural, for counts such as "3 of 12 cards highlighted". */
  itemNoun?: readonly [string, string]
}

const CARD_NOUN = ['card', 'cards'] as const

const PRESSED_CHIP_STYLE = {
  backgroundColor: 'var(--stratakit-color-bg-accent-muted)',
  borderColor: 'var(--stratakit-color-border-accent-strong)',
  color: 'var(--stratakit-color-text-accent-strong)',
} as const

/** Facet chips that highlight matching items in place, so the page keeps its shape while one signal is in focus. */
export function AttentionBar<Key extends string>({
  facetCounts,
  totalItems,
  activeFacet,
  highlightedCount,
  onChange,
  facets,
  itemNoun = CARD_NOUN,
}: AttentionBarProps<Key>) {
  const labelId = useId()
  const activeLabel = facets.find((facet) => facet.key === activeFacet)?.label
  const formatItems = (count: number) => `${count} ${count === 1 ? itemNoun[0] : itemNoun[1]}`

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
        {facets.map((facet) => {
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
                    'aria-label': `${facet.label}, ${formatItems(count)}`,
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
        {activeFacet ? `${highlightedCount} of ${formatItems(totalItems)} highlighted · ${activeLabel}` : ''}
      </Typography>
    </Box>
  )
}
