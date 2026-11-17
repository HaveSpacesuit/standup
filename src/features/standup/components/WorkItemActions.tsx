import type { MouseEvent, ReactNode } from 'react'
import { Box, ButtonBase, CircularProgress, IconButton } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { Icon } from '@stratakit/mui'
import svgAdd from '@stratakit/icons/add.svg'
import svgMoreHorizontal from '@stratakit/icons/more-horizontal.svg'
import svgRefresh from '@stratakit/icons/refresh.svg'
import { getWorkItemFields } from '../../../ado/workItemPatch'
import { WORK_ITEM_FIELD_LABELS, type EditableWorkItemField } from '../../../ado/workItemUpdateApi'
import {
  describeFieldValue, FIELD_SHORTCUT_KEYS, getEditableFields, isEditableWorkItem, RELOAD_SHORTCUT_KEY, type EditableWorkItem,
} from '../utils/workItemEditing'
import { AppTooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { useWorkItemEditing, WORK_ITEM_MENU_ATTRIBUTE, workItemEditKey, type WorkItemEditingApi } from './workItemEditingContext'
import type { BoardDragProps } from '../hooks/useBoardDrag'

/** The class on each item's Reload and More buttons; revealPreviewToggles shows them with the row's preview button. */
export const WORK_ITEM_ACTIONS_CLASS = 'work-item-actions'

const inlineSx: SxProps<Theme> = { display: 'inline-flex', alignItems: 'center', gap: 0.25, flex: '0 0 auto' }

// Floats over the card's top edge, so it takes no room from the card's content. Above the card, which raises itself
// while hovered.
const floatingSx: SxProps<Theme> = {
  ...inlineSx,
  position: 'absolute',
  top: -13,
  right: 6,
  zIndex: 3,
  p: '1px',
  bgcolor: 'background.paper',
  border: '1px solid var(--stratakit-color-border-neutral-base)',
  borderRadius: '6px',
  boxShadow: 'var(--stratakit-shadow-surface-md)',
  '& .MuiIconButton-root': { width: 24, height: 22 },
}

/**
 * Reload and More for one item. Reload reads the item fresh from Azure DevOps and updates it in place; More opens its
 * menu of fields to edit. Renders nothing outside a WorkItemEditingProvider.
 */
export function WorkItemActions({ item, floating = false }: { item: EditableWorkItem; floating?: boolean }) {
  const editing = useWorkItemEditing()
  if (!editing || !isEditableWorkItem(item)) return null
  const { editor } = editing
  const busy = editor.isBusy(item)
  return (
    <Box
      role="group"
      aria-label={`Actions for #${item.id}`}
      className={WORK_ITEM_ACTIONS_CLASS}
      data-busy={busy ? '' : undefined}
      // Keeps a click from also selecting the row or following the card's link.
      onClick={(event) => event.stopPropagation()}
      sx={floating ? floatingSx : inlineSx}
    >
      <IconButton
        size="small"
        label={busy ? `Updating #${item.id}…` : `Reload #${item.id} from Azure DevOps (${RELOAD_SHORTCUT_KEY})`}
        aria-keyshortcuts={RELOAD_SHORTCUT_KEY}
        aria-busy={busy || undefined}
        onClick={() => void editor.reload(item)}
      >
        {busy ? <CircularProgress size={14} aria-hidden="true" /> : <Icon href={svgRefresh} />}
      </IconButton>
      <IconButton
        size="small"
        label={`Edit #${item.id} (Shift+F10)`}
        aria-haspopup="menu"
        aria-keyshortcuts="Shift+F10"
        {...{ [WORK_ITEM_MENU_ATTRIBUTE]: workItemEditKey(item) }}
        onClick={(event) => editing.openMenu(item, event.currentTarget)}
      >
        <Icon href={svgMoreHorizontal} />
      </IconButton>
    </Box>
  )
}

const cardSx: SxProps<Theme> = {
  position: 'relative',
  // Keeps the actions' z-index inside the card, so they never paint over a sticky head.
  isolation: 'isolate',
  width: '100%',
  minWidth: 0,
  transition: 'opacity 120ms ease',
  [`& > .${WORK_ITEM_ACTIONS_CLASS}`]: {
    opacity: 0,
    transform: 'translateY(3px)',
    transition: 'opacity 120ms, transform 120ms',
    pointerEvents: 'none',
  },
  [`&[data-actions-below] > .${WORK_ITEM_ACTIONS_CLASS}`]: { top: 'auto', bottom: -13 },
  // Above the neighboring cards while hovered, yet below the sticky lane and column heads.
  '&:hover, &:focus-within': { zIndex: 2 },
  [`&:hover > .${WORK_ITEM_ACTIONS_CLASS}, &:focus-within > .${WORK_ITEM_ACTIONS_CLASS}, & > .${WORK_ITEM_ACTIONS_CLASS}[data-busy]`]: {
    opacity: 1,
    transform: 'none',
    pointerEvents: 'auto',
  },
  '@media (hover: none)': { [`& > .${WORK_ITEM_ACTIONS_CLASS}`]: { opacity: 1, transform: 'none', pointerEvents: 'auto' } },
  [`&[aria-busy="true"] > :not(.${WORK_ITEM_ACTIONS_CLASS})`]: { opacity: 0.65 },
  // The title stays a link; the rest of the card is the handle.
  '&[data-draggable]': { cursor: 'grab' },
  '&[data-dragging]': { opacity: 0.4 },
  [`&[data-dragging] > .${WORK_ITEM_ACTIONS_CLASS}`]: { visibility: 'hidden' },
}

/**
 * Moves a card's floating actions to its bottom edge when a sticky head covers its top edge (the first cards of a
 * board), or when the top edge is off screen.
 */
function placeFloatingActions(card: HTMLElement) {
  const actions = card.querySelector<HTMLElement>(`:scope > .${WORK_ITEM_ACTIONS_CLASS}`)
  if (!actions || typeof document.elementFromPoint !== 'function') return
  delete card.dataset.actionsBelow
  const rect = actions.getBoundingClientRect()
  const top = rect.top + 1
  let covered = top < 0
  // Hidden actions take no pointer events, so this finds what lies over or beneath their top edge.
  let node = covered ? null : document.elementFromPoint(rect.left + rect.width / 2, top)
  while (!covered && node && !node.contains(card)) {
    covered = getComputedStyle(node).position === 'sticky'
    node = node.parentElement
  }
  if (covered) card.dataset.actionsBelow = ''
}

/**
 * Makes a board card editable: its menu on right-click or Shift+F10, field keys while focus is in it, and Reload and
 * More on hover. Without editing it renders the card alone.
 */
export function EditableWorkItemCard({ item, enabled = true, dragProps, dragging = false, children }: {
  item: EditableWorkItem
  /** Off for cards that show the past, such as a replayed day or a lane of removed cards. */
  enabled?: boolean
  /** Lets the card be dragged to another cell of its board. */
  dragProps?: BoardDragProps
  /** The card being dragged, which fades while its summary follows the pointer. */
  dragging?: boolean
  children: ReactNode
}) {
  const editing = useWorkItemEditing()
  if (!editing || !enabled || !isEditableWorkItem(item)) return <>{children}</>
  const draggable = Boolean(dragProps) && editing.editor.canEdit(item)
  return (
    <Box
      data-editable-item={item.id}
      data-draggable={draggable ? '' : undefined}
      data-dragging={dragging ? '' : undefined}
      aria-busy={editing.editor.isBusy(item) || undefined}
      onPointerEnter={(event) => placeFloatingActions(event.currentTarget)}
      onFocus={(event) => placeFloatingActions(event.currentTarget)}
      onKeyDown={(event) => editing.handleKeyDown(item, event)}
      onContextMenu={(event) => editing.handleContextMenu(item, event)}
      {...(draggable ? dragProps : undefined)}
      sx={cardSx}
    >
      {children}
      <WorkItemActions item={item} floating />
    </Box>
  )
}

const fieldButtonSx: SystemStyleObject<Theme> = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'inherit',
  maxWidth: '100%',
  minHeight: 24,
  mx: -0.5,
  px: 0.5,
  borderRadius: '4px',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'inherit',
  '&:hover': { bgcolor: 'var(--stratakit-color-bg-glow-on-surface-neutral-hover)' },
  '&.Mui-focusVisible': { outline: '2px solid var(--stratakit-color-border-accent-base)', outlineOffset: 1 },
}

const canEditField = (editing: WorkItemEditingApi, item: EditableWorkItem, field: EditableWorkItemField) =>
  editing.editor.canEdit(item) && getEditableFields(item).includes(field)

/** What makes a button open the field's editor, named for the field and its value. */
function fieldButtonProps(editing: WorkItemEditingApi, item: EditableWorkItem, field: EditableWorkItemField) {
  const value = describeFieldValue(field, getWorkItemFields(item)[field])
  return {
    'aria-label': `${WORK_ITEM_FIELD_LABELS[field]}: ${value}. Change`,
    'aria-haspopup': 'dialog',
    'aria-keyshortcuts': FIELD_SHORTCUT_KEYS[field],
    'data-edit-field': field,
    onClick: (event: MouseEvent<HTMLElement>) => {
      event.stopPropagation()
      editing.openField(item, field, event.currentTarget)
    },
  } as const
}

/**
 * A field's value in a table cell or panel, as a button that opens its editor. Shows the value alone when the item or
 * field cannot be edited.
 */
export function EditableFieldButton({ item, field, children, sx }: {
  item: EditableWorkItem
  field: EditableWorkItemField
  children: ReactNode
  sx?: SxProps<Theme>
}) {
  const editing = useWorkItemEditing()
  if (!editing || !canEditField(editing, item, field)) return <>{children}</>
  return (
    <ButtonBase {...fieldButtonProps(editing, item, field)} sx={[fieldButtonSx, ...(Array.isArray(sx) ? sx : [sx])]}>
      {children}
    </ButtonBase>
  )
}

/** The class on each EditTagsButton; revealPreviewToggles shows it with the row's preview button. */
export const EDIT_TAGS_CLASS = 'edit-tags'

const tagButtonSx: SystemStyleObject<Theme> = {
  gap: 0.25,
  minHeight: 20,
  mx: 0,
  fontSize: 11,
  color: TERTIARY_TEXT_COLOR,
  whiteSpace: 'nowrap',
  '&:hover': { color: 'text.primary' },
}
const tagButtonIconStyle = { width: 12, height: 12 }

/**
 * "+ Tag" after an item's tags, opening its tag editor to add or remove tags in place. In a list styled with
 * revealPreviewToggles it shows while its row is hovered or focused. Renders nothing when the item's tags can't be edited.
 */
export function EditTagsButton({ item }: { item: EditableWorkItem }) {
  const editing = useWorkItemEditing()
  if (!editing || !canEditField(editing, item, 'tags')) return null
  return (
    <AppTooltip title={`Add or remove tags (${FIELD_SHORTCUT_KEYS.tags})`} describeChild>
      <ButtonBase className={EDIT_TAGS_CLASS} {...fieldButtonProps(editing, item, 'tags')} sx={[fieldButtonSx, tagButtonSx]}>
        <Icon href={svgAdd} alt="" style={tagButtonIconStyle} />
        Tag
      </ButtonBase>
    </AppTooltip>
  )
}
