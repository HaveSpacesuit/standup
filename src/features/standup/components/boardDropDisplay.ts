import type { SystemStyleObject } from '@mui/system'
import type { Theme } from '@mui/material/styles'
import type { BoardDropResult } from '../utils/workItemEditing'

/**
 * How a board cell looks while a card is dragged: `open` takes the card, `refused` can't, and the `over` states mark the
 * cell under the pointer. Cells that would leave the card unchanged, such as its own, stay plain.
 */
export type DropCellState = 'open' | 'refused' | 'over' | 'over-refused'

const ACCENT = 'var(--stratakit-color-border-accent-base)'
const CRITICAL = 'var(--stratakit-color-border-critical-base)'
const HATCH = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--stratakit-color-text-neutral-secondary) 10%, transparent) 0 6px, transparent 6px 12px)'

export function getDropCellState(result: BoardDropResult | null | undefined, over: boolean): DropCellState | undefined {
  if (!result || result.kind === 'none') return undefined
  const refused = result.kind === 'refused'
  if (over) return refused ? 'over-refused' : 'over'
  return refused ? 'refused' : 'open'
}

/** A cell's drop look, keeping `shadow`, such as the standup speaker's frame, under it. */
export function getDropCellSx(state: DropCellState | undefined, shadow?: string): SystemStyleObject<Theme> {
  const withShadow = (extra: string) => (shadow ? `${shadow}, ${extra}` : extra)
  switch (state) {
    case 'open':
      return { boxShadow: withShadow(`inset 0 0 0 1px color-mix(in srgb, ${ACCENT} 35%, transparent)`) }
    case 'over':
      return {
        outline: `2px solid ${ACCENT}`,
        outlineOffset: -2,
        // Opaque, since lane heads are sticky and cards scroll under them.
        bgcolor: 'color-mix(in srgb, var(--stratakit-color-bg-accent-base) 8%, var(--stratakit-mui-palette-background-paper))',
      }
    case 'refused':
      return { backgroundImage: HATCH }
    case 'over-refused':
      return { backgroundImage: HATCH, outline: `2px dashed ${CRITICAL}`, outlineOffset: -2 }
    default:
      return {}
  }
}
