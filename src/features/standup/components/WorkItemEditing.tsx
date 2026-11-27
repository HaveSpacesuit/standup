import { useId, useMemo, useState, type ReactNode } from 'react'
import { Alert, Box, Button, Divider, IconButton, MenuItem, MenuList, Popover, Snackbar, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import type { WorkItemLinkChange } from '../../../ado/workItemLinksApi'
import { getWorkItemFields } from '../../../ado/workItemPatch'
import { WORK_ITEM_FIELD_LABELS, type EditableWorkItemField, type WorkItemFieldChanges } from '../../../ado/workItemUpdateApi'
import { isTypingTarget } from '../hooks/usePreviewPanel'
import type { WorkItemEditor, WorkItemEditorActions, WorkItemEditToast, WorkItemLinkSaveOptions } from '../hooks/useWorkItemEditor'
import {
  describeFieldValue,
  FIELD_EDIT_LABELS,
  FIELD_SHORTCUT_KEYS,
  getEditableFields,
  getItemLabel,
  getShortcutAction,
  hasItemActions,
  isEditableWorkItem,
  isPullRequestCard,
  LINK_SHORTCUT_KEY,
  RELOAD_SHORTCUT_KEY,
  type EditableWorkItem,
} from '../utils/workItemEditing'
import { getLinkTypeName } from '../utils/workItemLinkEditing'
import {
  copyRichText, formatPullRequestLink, formatWorkItemLink, getPullRequestLinkLabel, getWorkItemLinkLabel, type ClipboardContent,
} from '../utils/workItemLink'
import {
  prepareFocusRestore, workItemEditKey, WorkItemEditingContext, WorkItemEditOptionsContext, type EditAnchor, type WorkItemEditingApi,
} from './workItemEditingContext'
import { WIDE_FIELD_EDITORS, WorkItemFieldEditor } from './WorkItemFieldEditors'
import { WorkItemLinkEditor } from './WorkItemLinkEditor'

type Position = { top: number; left: number }
type OpenEditor =
  | { kind: 'menu'; item: EditableWorkItem; position: Position }
  | { kind: 'field'; item: EditableWorkItem; field: EditableWorkItemField; position: Position }
  | { kind: 'link'; item: EditableWorkItem; position: Position; rel?: string }
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
        {getItemLabel(item)} · {item.title}
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

function ItemMenu({ open, editor, onOpenField, onOpenLink, onReload, onClose }: {
  open: Extract<OpenEditor, { kind: 'menu' }>
  editor: WorkItemEditor
  onOpenField: (field: EditableWorkItemField) => void
  onOpenLink: () => void
  onReload: () => void
  onClose: () => void
}) {
  const { item } = open
  const fields = getWorkItemFields(item)
  const pullRequestCard = isPullRequestCard(item)
  const editableFields = pullRequestCard ? [] : getEditableFields(item)
  const canEdit = editor.canEdit(item)
  const canLink = !pullRequestCard && isEditableWorkItem(item) && Boolean(editor.links)
  const labelId = useId()
  const copyLink = (content: ClipboardContent, label: string) => {
    copyRichText(content).then(
      () => editor.notify(`Copied link to ${label}.`, 'success'),
      () => editor.notify(`Couldn’t copy the link to ${label}. The browser blocked clipboard access.`, 'error'),
    )
    onClose()
  }
  const openInAzureDevOps = () => {
    window.open(pullRequestCard ? item.pullRequest.url : item.workItemUrl, '_blank', 'noopener,noreferrer')
    onClose()
  }
  return (
    <Popover
      open
      anchorReference="anchorPosition"
      anchorPosition={open.position}
      onClose={onClose}
      slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 380 } } }}
    >
      <EditorHeader id={labelId} label={pullRequestCard ? 'Pull request' : 'Edit'} item={item} />
      <MenuList
        autoFocusItem
        aria-labelledby={labelId}
        sx={{ py: 0.5 }}
        // The field keys open their editors here too, instead of jumping to an item by its first letter.
        onKeyDownCapture={(event) => {
          if (isTypingTarget(event.target) && !(event.target instanceof Element && event.target.closest('[role="menu"]'))) return
          const action = getShortcutAction(event)
          if (!action || (action.kind !== 'reload' && pullRequestCard)) return
          event.preventDefault()
          event.stopPropagation()
          if (action.kind === 'reload') onReload()
          else if (action.kind === 'link') {
            if (canEdit && canLink) onOpenLink()
          } else if (canEdit && editableFields.includes(action.field)) onOpenField(action.field)
        }}
      >
        {editableFields.map((field) => (
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
        {canLink ? (
          <MenuItem disabled={!canEdit} aria-haspopup="dialog" aria-keyshortcuts={LINK_SHORTCUT_KEY} onClick={onOpenLink}>
            <Box component="span" sx={{ flex: 1, whiteSpace: 'nowrap' }}>Add link…</Box>
            <Kbd>{LINK_SHORTCUT_KEY}</Kbd>
          </MenuItem>
        ) : null}
        {editableFields.length || canLink ? <Divider /> : null}
        <MenuItem aria-keyshortcuts={RELOAD_SHORTCUT_KEY} onClick={onReload}>
          <Box component="span" sx={{ flex: 1 }}>Reload from Azure DevOps</Box>
          <Kbd>{RELOAD_SHORTCUT_KEY}</Kbd>
        </MenuItem>
        <MenuItem
          onClick={() => pullRequestCard
            ? copyLink(formatPullRequestLink(item.pullRequest), getPullRequestLinkLabel(item.pullRequest))
            : copyLink(formatWorkItemLink(item), getWorkItemLinkLabel(item))}
        >
          Copy link
        </MenuItem>
        {pullRequestCard ? null : item.activePullRequests?.map((pullRequest) => (
          <MenuItem
            key={`${pullRequest.repositoryId ?? ''}#${pullRequest.id}`}
            onClick={() => copyLink(formatPullRequestLink(pullRequest), getPullRequestLinkLabel(pullRequest))}
          >
            <Box component="span" sx={{ flex: 1, whiteSpace: 'nowrap' }}>Copy link to PR {pullRequest.id}</Box>
            <Box component="span" sx={menuValueSx}>{pullRequest.title}</Box>
          </MenuItem>
        ))}
        <MenuItem onClick={openInAzureDevOps}>Open in Azure DevOps</MenuItem>
      </MenuList>
      {editor.lockedReason && !pullRequestCard ? (
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

function LinkPopover({ open, editor, onSave, onClose }: {
  open: Extract<OpenEditor, { kind: 'link' }>
  editor: WorkItemEditor
  onSave: (change: WorkItemLinkChange, options: WorkItemLinkSaveOptions) => void
  onClose: () => void
}) {
  const labelId = useId()
  if (!editor.links) return null
  return (
    <Popover
      open
      anchorReference="anchorPosition"
      anchorPosition={open.position}
      onClose={onClose}
      slotProps={{ paper: { role: 'dialog', 'aria-labelledby': labelId, sx: { width: 440, maxWidth: 'calc(100vw - 32px)' } } }}
    >
      <EditorHeader
        id={labelId}
        label={open.rel ? `Add ${getLinkTypeName(open.rel).toLowerCase()}` : 'Add link'}
        item={open.item}
        shortcut={LINK_SHORTCUT_KEY}
      />
      <WorkItemLinkEditor item={open.item} source={editor.links} presetRel={open.rel} onSave={onSave} onCancel={onClose} />
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
            {toast.action ? (
              <Button
                size="small"
                onClick={() => {
                  const action = toast.action
                  onClose()
                  action?.run()
                }}
              >
                {toast.action.label}
              </Button>
            ) : null}
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

  // Every card reads this, so it leaves out the options and toast, which only the menu, editors and board drops use.
  const { lockedReason, canEdit, canReload, isBusy, save, saveLinks, reload, notify } = editor
  const canLink = Boolean(editor.links)
  const actions = useMemo<WorkItemEditorActions>(
    () => ({ lockedReason, canEdit, canReload, isBusy, save, saveLinks, reload, notify }),
    [lockedReason, canEdit, canReload, isBusy, save, saveLinks, reload, notify],
  )
  const api = useMemo<WorkItemEditingApi>(() => {
    const openMenu = (item: EditableWorkItem, anchor: EditAnchor) => {
      if (hasItemActions(item)) setOpen({ kind: 'menu', item, position: toPosition(anchor) })
    }
    const openField = (item: EditableWorkItem, field: EditableWorkItemField, anchor: EditAnchor) => {
      if (actions.canEdit(item)) setOpen({ kind: 'field', item, field, position: toPosition(anchor) })
    }
    const canOpenLink = (item: EditableWorkItem) => canLink && actions.canEdit(item) && isEditableWorkItem(item)
    const openLink = (item: EditableWorkItem, anchor: EditAnchor, rel?: string) => {
      if (canOpenLink(item)) setOpen({ kind: 'link', item, position: toPosition(anchor), rel })
    }
    return {
      editor: actions,
      openMenu,
      openField,
      openLink,
      canLink: canOpenLink,
      handleContextMenu: (item, event) => {
        if (event.defaultPrevented || isTypingTarget(event.target) || !hasItemActions(item)) return
        event.preventDefault()
        event.stopPropagation()
        // Shift+F10 and the Menu key raise the event without a pointer position; open under the focused element instead.
        const fromKeyboard = event.clientX === 0 && event.clientY === 0
        openMenu(item, fromKeyboard && event.target instanceof Element ? event.target : { top: event.clientY, left: event.clientX })
      },
      handleKeyDown: (item, event) => {
        if (event.defaultPrevented || isTypingTarget(event.target) || !hasItemActions(item)) return
        const action = getShortcutAction(event)
        if (!action) return
        if (action.kind === 'field' && (!actions.canEdit(item) || !getEditableFields(item).includes(action.field))) return
        if (action.kind === 'link' && !canOpenLink(item)) return
        event.preventDefault()
        event.stopPropagation()
        const anchor = event.target instanceof Element ? event.target : event.currentTarget
        if (action.kind === 'reload') void actions.reload(item)
        else if (action.kind === 'link') openLink(item, anchor)
        else openField(item, action.field, anchor)
      },
    }
  }, [actions, canLink])

  const close = () => {
    if (!open) return
    const restoreFocus = prepareFocusRestore(workItemEditKey(open.item))
    setOpen(null)
    // A save can move the card to another lane or column, or take it off the list, with the element focus came from.
    requestAnimationFrame(restoreFocus)
  }

  return (
    <WorkItemEditingContext.Provider value={api}>
      <WorkItemEditOptionsContext.Provider value={editor.options}>
        {children}
      </WorkItemEditOptionsContext.Provider>
      {open?.kind === 'menu' ? (
        <ItemMenu
          open={open}
          editor={editor}
          onClose={close}
          onOpenField={(field) => setOpen({ kind: 'field', item: open.item, field, position: open.position })}
          onOpenLink={() => setOpen({ kind: 'link', item: open.item, position: open.position })}
          onReload={() => {
            close()
            void editor.reload(open.item)
          }}
        />
      ) : null}
      {open?.kind === 'link' ? (
        <LinkPopover
          key={`${workItemEditKey(open.item)}:link:${open.rel ?? ''}`}
          open={open}
          editor={editor}
          onClose={close}
          onSave={(change, options) => {
            close()
            void editor.saveLinks(open.item, change, options)
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
