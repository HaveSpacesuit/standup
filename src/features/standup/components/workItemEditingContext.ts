import { createContext, useContext, type KeyboardEvent, type MouseEvent } from 'react'
import type { EditableWorkItemField } from '../../../ado/workItemUpdateApi'
import type { WorkItemEditOptions, WorkItemEditorActions } from '../hooks/useWorkItemEditor'
import { getItemKey, isEditableWorkItem, type EditableWorkItem } from '../utils/workItemEditing'

/** Where a menu or editor opens: under an element, or at a point such as a right-click. */
export type EditAnchor = Element | { top: number; left: number }

export type WorkItemEditingApi = {
  /** Without the options and toast, so every card isn't drawn again when a tag rule changes or a toast shows. */
  editor: WorkItemEditorActions
  openMenu: (item: EditableWorkItem, anchor: EditAnchor) => void
  openField: (item: EditableWorkItem, field: EditableWorkItemField, anchor: EditAnchor) => void
  /** Opens the item's menu on right-click, Shift+F10 or the Menu key; text fields keep the browser's menu. */
  handleContextMenu: (item: EditableWorkItem, event: MouseEvent<HTMLElement>) => void
  /** The field keys (S, A, I, E, V, P, T, F2) and R, while focus is in the item's card or row; only R on a pull request card. */
  handleKeyDown: (item: EditableWorkItem, event: KeyboardEvent<HTMLElement>) => void
}

export const WorkItemEditingContext = createContext<WorkItemEditingApi | null>(null)

/** The editing controls for cards and rows; null outside a WorkItemEditingProvider, where items are read-only. */
export function useWorkItemEditing(): WorkItemEditingApi | null {
  return useContext(WorkItemEditingContext)
}

export const WorkItemEditOptionsContext = createContext<WorkItemEditOptions | null>(null)

/** The states, sprints and tag rules the editors offer, such as where a board card can be dropped. */
export function useWorkItemEditOptions(): WorkItemEditOptions | null {
  return useContext(WorkItemEditOptionsContext)
}

/** Marks each item's More button, so focus can return to it when the card moves while a menu is open. */
export const WORK_ITEM_MENU_ATTRIBUTE = 'data-work-item-menu'

export const workItemEditKey: (item: EditableWorkItem) => string = getItemKey

const menuButtons = () => [...document.querySelectorAll<HTMLElement>(`[${WORK_ITEM_MENU_ATTRIBUTE}]`)]

/**
 * Call before a change that can move the item or take it off the list, then call what it returns once the change has
 * rendered. If focus was lost, it returns to the item's More button, or when the item has left, to the nearest item's
 * after it, else before it.
 */
export function prepareFocusRestore(key: string): () => void {
  const keys = [...new Set(menuButtons().map((element) => element.getAttribute(WORK_ITEM_MENU_ATTRIBUTE)))]
  const at = keys.indexOf(key)
  const fallbacks = at < 0 ? [] : [...keys.slice(at + 1), ...keys.slice(0, at).reverse()]
  return () => {
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
    const buttons = menuButtons()
    for (const candidate of [key, ...fallbacks]) {
      const button = buttons.find((element) => element.getAttribute(WORK_ITEM_MENU_ATTRIBUTE) === candidate)
      if (button) {
        button.focus()
        return
      }
    }
  }
}

/**
 * Props that make a table row or list item editable from the keyboard and by right-click; spread onto the row. Empty
 * without editing.
 */
export function getEditableRowProps(editing: WorkItemEditingApi | null, item: EditableWorkItem) {
  if (!editing || !isEditableWorkItem(item)) return {}
  return {
    'aria-busy': editing.editor.isBusy(item) || undefined,
    'data-busy': editing.editor.isBusy(item) ? '' : undefined,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => editing.handleKeyDown(item, event),
    onContextMenu: (event: MouseEvent<HTMLElement>) => editing.handleContextMenu(item, event),
  }
}
