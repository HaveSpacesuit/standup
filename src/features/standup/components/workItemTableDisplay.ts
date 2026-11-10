/** The empty part of a meter, such as the unlit Impact bars. */
export const METER_TRACK_COLOR = 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)'

// The id sits before the title like on the cards. Tables spread this into the cell holding WorkItemTitle: plain class
// names styled from the cell keep each row to one sx.
export const workItemTitleCellSx = {
  overflowWrap: 'anywhere' as const,
  '& .work-item-id': {
    mr: 0.5,
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: 'text.secondary',
  },
}
