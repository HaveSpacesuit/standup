import { useId, useMemo, useState, type ReactNode } from 'react'
import { Alert, Box, Button, Divider, IconButton, MenuItem, MenuList, Popover, Snackbar, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import { getWorkItemFields } from '../../../ado/workItemPatch'
import { WORK_ITEM_FIELD_LABELS, type EditableWorkItemField, type WorkItemFieldChanges } from '../../../ado/workItemUpdateApi'
import { isTypingTarget } from '../hooks/usePreviewPanel'
import type { WorkItemEditor, WorkItemEditToast } from '../hooks/useWorkItemEditor'
import {
  describeFieldValue,
  FIELD_EDIT_LABELS,
  FIELD_SHORTCUT_KEYS,
  getEditableFields,
  getShortcutAction,
  isEditableWorkItem,
  RELOAD_SHORTCUT_KEY,
  type EditableWorkItem,
} from '../utils/workItemEditing'
import { copyRichText, formatWorkItemLink, getWorkItemLinkLabel } from '../utils/workItemLink'
import {
  prepareFocusRestore, workItemEditKey, WorkItemEditingContext, type EditAnchor, type WorkItemEditingApi,
} from './workItemEditingContext'
import { WIDE_FIELD_EDITORS, WorkItemFieldEditor } from './WorkItemFieldEditors'

type Position = { top: number; left: number }
type OpenEditor =
  | { kind: 'menu'; item: EditableWorkItem; position: Position }
  | { kind: 'field'; item: EditableWorkItem; field: EditableWorkItemField; position: Position }
function toPosition(anchor: EditAnchor): Position {
  if (!(anchor instanceof Element)) return anchor
  const rect = anchor.getBoundingClientRect()
  return { top: rect.bottom + 4, left: rect.left }
}

const kbdSx: SxProps<Theme> = {
  ml: 1.5,
  px: 0.5,
  minWidth: 18,
  textAlign: 'center',
  fontFamily: 'inherit',
  fontSize: 11,
  lineHeight: '16px',
  color: 'text.secondary',
  border: '1px solid var(--stratakit-color-border-neutral-muted)',
  borderRadius: '3px',
}

function Kbd({ children }: { children: ReactNode }) {
  return <Box component="kbd" aria-hidden="true" sx={kbdSx}>{children}</Box>
}

const headerSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  px: 1.5,
  py: 1,
  borderBottom: '1px solid var(--stratakit-color-border-neutral-muted)',
}

function EditorHeader({ id, label, item, shortcut }: { id?: string; label: string; item: EditableWorkItem; shortcut?: string }) {
  return (
    <Box sx={headerSx}>
      <Typography id={id} variant="body-sm" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</Typography>
      <Typography variant="body-sm" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
        #{item.id} · {item.title}
      </Typography>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </Box>
  )
}

const menuValueSx: SxProps<Theme> = {
  ml: 2,
  maxWidth: 160,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'text.secondary',
  fontSize: 12,
}

function ItemMenu({ open, editor, onOpenField, onReload, onClose }: {
  open: Extract<OpenEditor, { kind: 'menu' }>
  editor: WorkItemEditor
  onOpenField: (field: EditableWorkItemField) => void
  onReload: () => void
  onClose: () => void
}) {
  const { item } = open
  const fields = getWorkItemFields(item)
  const canEdit = editor.canEdit(item)
  const labelId = useId()
  return (
    <Popover
      open
      anchorReference="anchorPosition"
      anchorPosition={open.position}
      onClose={onClose}
      slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 380 } } }}
    >
      <EditorHeader id={labelId} label="Edit" item={item} />
      <MenuList
        autoFocusItem
        aria-labelledby={labelId}
        sx={{ py: 0.5 }}
        // The field keys open their editors here too, instead of jumping to an item by its first letter.
        onKeyDownCapture={(event) => {
          if (isTypingTarget(event.target) && !(event.target instanceof Element && event.target.closest('[role="menu"]'))) return
          const action = getShortcutAction(event)
          if (!action) return
          event.preventDefault()
          event.stopPropagation()
          if (action.kind === 'reload') onReload()
          else if (canEdit && getEditableFields(item).includes(action.field)) onOpenField(action.field)
        }}
      >
        {getEditableFields(item).map((field) => (
          <MenuItem
            key={field}
            disabled={!canEdit}
            aria-haspopup="dialog"
            aria-keyshortcuts={FIELD_SHORTCUT_KEYS[field]}
            onClick={() => onOpenField(field)}
          >
            <Box component="span" sx={{ flex: 1, whiteSpace: 'nowrap' }}>
              {field === 'title' ? 'Rename…' : WORK_ITEM_FIELD_LABELS[field]}
            </Box>
            {field === 'title' ? null : <Box component="span" sx={menuValueSx}>{describeFieldValue(field, fields[field])}</Box>}
            <Kbd>{FIELD_SHORTCUT_KEYS[field]}</Kbd>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem aria-keyshortcuts={RELOAD_SHORTCUT_KEY} onClick={onReload}>
          <Box component="span" sx={{ flex: 1 }}>Reload from Azure DevOps</Box>
          <Kbd>{RELOAD_SHORTCUT_KEY}</Kbd>
        </MenuItem>
        <MenuItem
          onClick={() => {
            const label = getWorkItemLinkLabel(item)
            copyRichText(formatWorkItemLink(item)).then(
              () => editor.notify(`Copied link to ${label}.`, 'success'),
              () => editor.notify(`Couldn’t copy the link to ${label}. The browser blocked clipboard access.`, 'error'),
            )
            onClose()
          }}
        >
          Copy link
        </MenuItem>
        <MenuItem
          onClick={() => {
            window.open(item.workItemUrl, '_blank', 'noopener,noreferrer')
            onClose()
          }}
        >
          Open in Azure DevOps
        </MenuItem>
      </MenuList>
      {editor.lockedReason ? (
        <Typography variant="caption-sm" color="text.secondary" sx={{ display: 'block', px: 1.5, pb: 1, maxWidth: 340 }}>
          Editing is off. {editor.lockedReason}
        </Typography>
      ) : null}
    </Popover>
  )
}

function FieldPopover({ open, editor, onSave, onClose }: {
  open: Extract<OpenEditor, { kind: 'field' }>
  editor: WorkItemEditor
  onSave: (changes: WorkItemFieldChanges) => void
  onClose: () => void
}) {
  const labelId = useId()
  return (
    <Popover
      open
      anchorReference="anchorPosition"
      anchorPosition={open.position}
      onClose={onClose}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-labelledby': labelId,
          sx: { width: WIDE_FIELD_EDITORS.has(open.field) ? 420 : 300, maxWidth: 'calc(100vw - 32px)' },
        },
      }}
    >
      <EditorHeader id={labelId} label={FIELD_EDIT_LABELS[open.field]} item={open.item} shortcut={FIELD_SHORTCUT_KEYS[open.field]} />
      <WorkItemFieldEditor field={open.field} item={open.item} options={editor.options} onSave={onSave} onCancel={onClose} />
    </Popover>
  )
}

const TOAST_DURATION_MS = 7000

/**
 * Confirms each save or reload, with Undo after a save, as a StrataKit status alert that follows the light or dark
 * theme. Errors stay until dismissed.
 */
function EditToast({ toast, onClose }: { toast: WorkItemEditToast | null; onClose: () => void }) {
  if (!toast) return null
  return (
    <Snackbar
      key={toast.key}
      open
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      autoHideDuration={toast.tone === 'error' ? null : TOAST_DURATION_MS}
      onClose={(_event, reason) => {
        if (reason !== 'clickaway') onClose()
      }}
    >
      <Alert
        severity={toast.tone}
        // StrataKit's Alert is a plain group by default; a toast has to announce itself.
        role="alert"
        sx={{ width: '100%', maxWidth: 560, boxShadow: 'var(--stratakit-shadow-surface-lg)' }}
        action={(
          <>
            {toast.undo ? (
              <Button
                size="small"
                onClick={() => {
                  const undo = toast.undo
                  onClose()
                  undo?.()
                }}
              >
                Undo
              </Button>
            ) : null}
            <IconButton size="small" edge="end" label="Dismiss" onClick={onClose}><Icon href={svgDismiss} /></IconButton>
          </>
        )}
      >
        {toast.message}
      </Alert>
    </Snackbar>
  )
}

/**
 * Lets every card and row below edit and reload its work item: one shared menu, one field editor at a time, and one
 * confirmation toast, so a view only adds the triggers.
 */
export function WorkItemEditingProvider({ editor, children }: { editor: WorkItemEditor; children: ReactNode }) {
  const [open, setOpen] = useState<OpenEditor | null>(null)

  const api = useMemo<WorkItemEditingApi>(() => {
    const openMenu = (item: EditableWorkItem, anchor: EditAnchor) => {
      if (isEditableWorkItem(item)) setOpen({ kind: 'menu', item, position: toPosition(anchor) })
    }
    const openField = (item: EditableWorkItem, field: EditableWorkItemField, anchor: EditAnchor) => {
      if (editor.canEdit(item)) setOpen({ kind: 'field', item, field, position: toPosition(anchor) })
    }
    return {
      editor,
      openMenu,
      openField,
      handleContextMenu: (item, event) => {
        if (event.defaultPrevented || isTypingTarget(event.target) || !isEditableWorkItem(item)) return
        event.preventDefault()
        event.stopPropagation()
        // Shift+F10 and the Menu key raise the event without a pointer position; open under the focused element instead.
        const fromKeyboard = event.clientX === 0 && event.clientY === 0
        openMenu(item, fromKeyboard && event.target instanceof Element ? event.target : { top: event.clientY, left: event.clientX })
      },
      handleKeyDown: (item, event) => {
        if (event.defaultPrevented || isTypingTarget(event.target) || !isEditableWorkItem(item)) return
        const action = getShortcutAction(event)
        if (!action) return
        if (action.kind === 'field' && (!editor.canEdit(item) || !getEditableFields(item).includes(action.field))) return
        event.preventDefault()
        event.stopPropagation()
        if (action.kind === 'reload') void editor.reload(item)
        else openField(item, action.field, event.target instanceof Element ? event.target : event.currentTarget)
      },
    }
  }, [editor])

  const close = () => {
    if (!open) return
    const restoreFocus = prepareFocusRestore(workItemEditKey(open.item))
    setOpen(null)
    // A save can move the card to another lane or column, or take it off the list, with the element focus came from.
    requestAnimationFrame(restoreFocus)
  }

  return (
    <WorkItemEditingContext.Provider value={api}>
      {children}
      {open?.kind === 'menu' ? (
        <ItemMenu
          open={open}
          editor={editor}
          onClose={close}
          onOpenField={(field) => setOpen({ kind: 'field', item: open.item, field, position: open.position })}
          onReload={() => {
            close()
            void editor.reload(open.item)
          }}
        />
      ) : null}
      {open?.kind === 'field' ? (
        <FieldPopover
          key={`${workItemEditKey(open.item)}:${open.field}`}
          open={open}
          editor={editor}
          onClose={close}
          onSave={(changes) => {
            close()
            void editor.save(open.item, changes)
          }}
        />
      ) : null}
      <EditToast toast={editor.toast} onClose={editor.dismissToast} />
    </WorkItemEditingContext.Provider>
  )
}
