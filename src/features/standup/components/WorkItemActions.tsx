import { memo, type MouseEvent, type ReactNode } from 'react'
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
  describeFieldValue,
  FIELD_SHORTCUT_KEYS,
  getEditableFields,
  getItemLabel,
  hasItemActions,
  isPullRequestCard,
  LINK_SHORTCUT_KEY,
  RELOAD_SHORTCUT_KEY,
  type EditableWorkItem,
} from '../utils/workItemEditing'
import { PARENT_LINK } from '../../../ado/workItemLinksApi'
import { AppTooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { haveSameDataProps } from '../utils/sameData'
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
 * menu of fields to edit, or a pull request card's links. Renders nothing outside a WorkItemEditingProvider. Compared by
 * value, since a board draws a pair for every card.
 */
export const WorkItemActions = memo(function WorkItemActions({ item, floating = false }: { item: EditableWorkItem; floating?: boolean }) {
  const editing = useWorkItemEditing()
  if (!editing || !hasItemActions(item)) return null
  const { editor } = editing
  const busy = editor.isBusy(item)
  const label = getItemLabel(item)
  return (
    <Box
      role="group"
      aria-label={`Actions for ${label}`}
      className={WORK_ITEM_ACTIONS_CLASS}
      data-busy={busy ? '' : undefined}
      // Keeps a click from also selecting the row or following the card's link.
      onClick={(event) => event.stopPropagation()}
      sx={floating ? floatingSx : inlineSx}
    >
      <IconButton
        size="small"
        label={busy ? `Updating ${label}…` : `Reload ${label} from Azure DevOps (${RELOAD_SHORTCUT_KEY})`}
        aria-keyshortcuts={RELOAD_SHORTCUT_KEY}
        aria-busy={busy || undefined}
        onClick={() => void editor.reload(item)}
      >
        {busy ? <CircularProgress size={14} aria-hidden="true" /> : <Icon href={svgRefresh} />}
      </IconButton>
      <IconButton
        size="small"
        label={isPullRequestCard(item) ? `More actions for ${label} (Shift+F10)` : `Edit ${label} (Shift+F10)`}
        aria-haspopup="menu"
        aria-keyshortcuts="Shift+F10"
        {...{ [WORK_ITEM_MENU_ATTRIBUTE]: workItemEditKey(item) }}
        onClick={(event) => editing.openMenu(item, event.currentTarget)}
      >
        <Icon href={svgMoreHorizontal} />
      </IconButton>
    </Box>
  )
}, haveSameDataProps)

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
 * More on hover. A pull request card gets the menu, R and the buttons, but no fields. Without editing it renders the
 * card alone.
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
  if (!editing || !enabled || !hasItemActions(item)) return <>{children}</>
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
    <ButtonBase nativeButton {...fieldButtonProps(editing, item, field)} sx={[fieldButtonSx, ...(Array.isArray(sx) ? sx : [sx])]}>
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
      <ButtonBase nativeButton className={EDIT_TAGS_CLASS} {...fieldButtonProps(editing, item, 'tags')} sx={[fieldButtonSx, tagButtonSx]}>
        <Icon href={svgAdd} alt="" style={tagButtonIconStyle} />
        Tag
      </ButtonBase>
    </AppTooltip>
  )
}

/** "+ Parent" where an item without a parent would show one, opening the link editor on Parent. Renders nothing when its links can't be edited. */
export function AddParentButton({ item }: { item: EditableWorkItem }) {
  const editing = useWorkItemEditing()
  if (!editing || !editing.canLink(item)) return null
  return (
    <AppTooltip title={`Add a parent (${LINK_SHORTCUT_KEY} for any link)`} describeChild>
      <ButtonBase
        nativeButton
        aria-label={`Add a parent to ${getItemLabel(item)}`}
        aria-haspopup="dialog"
        data-add-parent={item.id}
        onClick={(event: MouseEvent<HTMLElement>) => {
          event.stopPropagation()
          editing.openLink(item, event.currentTarget, PARENT_LINK)
        }}
        sx={[fieldButtonSx, tagButtonSx]}
      >
        <Icon href={svgAdd} alt="" style={tagButtonIconStyle} />
        Parent
      </ButtonBase>
    </AppTooltip>
  )
}
