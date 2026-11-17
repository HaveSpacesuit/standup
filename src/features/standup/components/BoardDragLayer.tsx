import { Box, GlobalStyles, Typography } from '@mui/material'
import { createPortal } from 'react-dom'
import { DROP_SLOT_ATTRIBUTE, type BoardDragState } from '../hooks/useBoardDrag'
import { describeDropChanges, type DropOption } from '../utils/workItemEditing'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { WORK_ITEM_ACTIONS_CLASS } from './WorkItemActions'

function getGhostLines(drag: BoardDragState): { lines: string[]; tone: 'plain' | 'refused' | 'hint'; note?: string } {
  const { result } = drag
  if (!result) return { lines: ['Drop on a lane or column'], tone: 'hint' }
  if (result.kind === 'none') return { lines: ['Stays where it is'], tone: 'hint' }
  if (result.kind === 'refused') return { lines: [result.reason], tone: 'refused' }
  const option = result.options[drag.slot] ?? result.options[0]
  const lines = option ? describeDropChanges(drag.source.item, option.changes) : []
  return {
    lines: lines.length ? lines : ['Stays where it is'],
    tone: lines.length ? 'plain' : 'hint',
    note: result.options.length > 1 ? `${result.options.length} states fit here; point at one to choose` : undefined,
  }
}

/**
 * The floating summary that follows the pointer while a card is dragged: which card, and what dropping it here would
 * change, or why it can't go here. `ghostRef` places it, so it moves without re-rendering.
 */
export function BoardDragGhost({ drag, ghostRef }: { drag: BoardDragState; ghostRef: (element: HTMLElement | null) => void }) {
  const { lines, tone, note } = getGhostLines(drag)
  const refused = drag.result?.kind === 'refused'
  return createPortal(
    <>
      <GlobalStyles
        styles={{
          // The pointer says whether the cell takes the card; tooltips and actions over the cards it passes would only
          // get in the way.
          '*, *::before, *::after': { cursor: `${refused ? 'no-drop' : 'grabbing'} !important` },
          body: { userSelect: 'none' },
          '.MuiTooltip-popper': { display: 'none' },
          [`.${WORK_ITEM_ACTIONS_CLASS}:not([data-busy])`]: { visibility: 'hidden' },
        }}
      />
      <Box
        ref={ghostRef}
        aria-hidden="true"
        data-board-drag-ghost=""
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: (theme) => theme.zIndex.tooltip + 1,
          pointerEvents: 'none',
          width: 'max-content',
          maxWidth: 300,
          px: 1.25,
          py: 1,
          display: 'grid',
          gap: 0.375,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: refused ? 'var(--stratakit-color-border-critical-base)' : 'var(--stratakit-color-border-accent-base)',
          borderRadius: '8px',
          boxShadow: 'var(--stratakit-shadow-surface-lg)',
          transform: 'translate(-9999px, -9999px)',
        }}
      >
        <Typography variant="body-sm" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500, mr: 0.75, fontVariantNumeric: 'tabular-nums' }}>#{drag.source.item.id}</Box>
          {drag.source.item.title}
        </Typography>
        {lines.map((line) => (
          <Typography
            key={line}
            variant="caption-md"
            sx={{
              color: tone === 'refused' ? 'var(--stratakit-color-text-critical-base)' : tone === 'hint' ? 'text.secondary' : 'text.primary',
              fontWeight: tone === 'plain' ? 600 : undefined,
            }}
          >
            {line}
          </Typography>
        ))}
        <Typography variant="caption-sm" sx={{ color: TERTIARY_TEXT_COLOR }}>
          {note ? `${note} · ` : ''}Esc to cancel
        </Typography>
      </Box>
    </>,
    document.body,
  )
}

/**
 * Bands across the cell under the pointer, one per state its column could give the card; the band pointed at is the
 * one the drop picks.
 */
export function DropSlots({ options, selected, stickyTop, narrow = false }: {
  options: readonly DropOption[]
  selected: number
  stickyTop: number
  /** In a cell too thin to label, such as the empty Blocked rail, the choices spill over the next column. */
  narrow?: boolean
}) {
  return (
    <Box
      aria-hidden="true"
      data-drop-slots=""
      sx={{
        position: 'absolute',
        inset: 4,
        right: narrow ? 'auto' : 4,
        width: narrow ? 176 : undefined,
        // Taller than a collapsed lane, so the choices stay big enough to point at.
        minHeight: options.length * 40,
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      {options.map((option, index) => {
        const active = index === selected
        return (
          <Box
            key={option.key}
            {...{ [DROP_SLOT_ATTRIBUTE]: index }}
            sx={{
              flex: '1 1 0',
              minHeight: 36,
              px: 1,
              borderRadius: '6px',
              border: '1px dashed var(--stratakit-color-border-accent-base)',
              bgcolor: active
                ? 'color-mix(in srgb, var(--stratakit-color-bg-accent-base) 18%, var(--stratakit-mui-palette-background-paper))'
                : 'color-mix(in srgb, var(--stratakit-mui-palette-background-paper) 92%, transparent)',
              borderStyle: active ? 'solid' : 'dashed',
              boxShadow: active ? 'var(--stratakit-shadow-surface-sm)' : undefined,
            }}
          >
            <Box sx={{ position: 'sticky', top: stickyTop, py: 0.75, display: 'grid' }}>
              <Typography
                variant="body-sm"
                sx={{ fontWeight: active ? 700 : 500, color: active ? 'var(--stratakit-color-text-accent-strong)' : 'text.primary' }}
              >
                {option.label}
              </Typography>
              {option.detail ? (
                <Typography variant="caption-sm" sx={{ color: 'text.secondary' }}>{option.detail}</Typography>
              ) : null}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
