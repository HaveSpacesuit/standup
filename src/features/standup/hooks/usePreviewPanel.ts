import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'

export const PREVIEW_PANEL_WIDTH = { initial: 440, min: 320, max: 1200, step: 32 } as const
/** The list keeps at least this much room beside the panel. */
export const PREVIEW_LIST_MIN_WIDTH = 360
const WIDTH_STORAGE_KEY = 'standup:preview-panel-width'

// Keys typed here belong to the field or popup, not to the list.
const TYPING_TARGETS = [
  'input', 'textarea', 'select', '[contenteditable]:not([contenteditable="false"])',
  '[role="dialog"]', '[role="alertdialog"]', '[role="menu"]', '[role="listbox"]', '[role="combobox"]',
].join(', ')
const INTERACTIVE_TARGETS = 'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="checkbox"]'

export const clampPreviewPanelWidth = (width: number, max: number = PREVIEW_PANEL_WIDTH.max) =>
  Math.round(Math.min(Math.max(width, PREVIEW_PANEL_WIDTH.min), Math.max(max, PREVIEW_PANEL_WIDTH.min)))

/**
 * Whether a click on a row or card should preview it: not one on its links and buttons, a modified click, or the end of
 * selecting text to copy.
 */
export function isPreviewRowClick(event: MouseEvent<HTMLElement>): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false
  const target = event.target
  if (target instanceof Element) {
    const interactive = target.closest(INTERACTIVE_TARGETS)
    if (interactive && event.currentTarget.contains(interactive)) return false
  }
  const selection = typeof window.getSelection === 'function' ? window.getSelection() : null
  return !selection || selection.isCollapsed || !selection.toString().trim()
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(TYPING_TARGETS))
}

function loadWidth(): number {
  try {
    const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY))
    return stored ? clampPreviewPanelWidth(stored) : PREVIEW_PANEL_WIDTH.initial
  } catch {
    return PREVIEW_PANEL_WIDTH.initial
  }
}

/** The panel's width, kept across pages and visits once resized. */
export function usePreviewPanelWidth(): [number, (width: number) => void] {
  const [width, setWidth] = useState(loadWidth)
  const resized = useRef(false)
  useEffect(() => {
    if (!resized.current) return
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(width))
    } catch {
      // Kept for this visit only.
    }
  }, [width])
  const resize = useCallback((next: number) => {
    resized.current = true
    setWidth(clampPreviewPanelWidth(next))
  }, [])
  return [width, resize]
}

type PreviewSelectionOptions = {
  /** The listed items, in the order the Up and Down arrows move through them. */
  ids: readonly number[]
  /** The item's Azure DevOps page, which O opens. */
  getUrl: (id: number) => string | undefined
  /** Closes the panel when it changes, such as on switching teams, for a page that is not remounted per team. */
  scope?: string
}

/**
 * Which item the preview panel shows, and the keys that work while it is open: the Down and Up arrows for the next and
 * previous item, O to open the item in Azure DevOps, and Esc to close the panel. Keys typed into a field or a dialog are
 * left alone, and the arrows scroll the page as usual while the panel is closed or has focus.
 */
export function usePreviewSelection({ ids, getUrl, scope }: PreviewSelectionOptions) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectionScope, setSelectionScope] = useState(scope)
  if (selectionScope !== scope) {
    setSelectionScope(scope)
    setSelectedId(null)
  }
  const panelRef = useRef<HTMLElement | null>(null)
  const lastIndex = useRef(0)
  const focusToggle = useRef(false)
  const latest = useRef({ ids, getUrl, selectedId })
  const index = selectedId === null ? -1 : ids.indexOf(selectedId)

  useEffect(() => {
    latest.current = { ids, getUrl, selectedId }
    if (index >= 0) lastIndex.current = index
  })

  const close = useCallback(() => {
    const id = latest.current.selectedId
    if (id === null) return
    // Hand focus back to the item's preview button rather than losing it with the panel.
    if (panelRef.current?.contains(document.activeElement)) {
      document.querySelector<HTMLElement>(`[data-preview-toggle="${id}"]`)?.focus()
    }
    setSelectedId(null)
  }, [])

  const toggle = useCallback((id: number) => {
    if (latest.current.selectedId === id) close()
    else setSelectedId(id)
  }, [close])

  /** Previews the next or previous listed item, returning the one now shown. */
  const move = useCallback((current: number, step: 1 | -1) => {
    const list = latest.current.ids
    if (!list.length) return current
    const position = list.indexOf(current)
    // When the item has left the list, the one after it has taken its place.
    const at = Math.min(lastIndex.current, list.length - 1)
    const next = position >= 0
      ? list[Math.min(Math.max(position + step, 0), list.length - 1)]
      : step > 0 ? list[at] : list[Math.max(at - 1, 0)]
    setSelectedId(next)
    return next
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || isTypingTarget(event.target)) return
      const { selectedId: current, getUrl: urlFor } = latest.current
      if (current === null) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.shiftKey) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const target = event.target instanceof Element ? event.target : null
        // Within the panel, the arrows scroll it.
        if (target && panelRef.current?.contains(target)) return
        event.preventDefault()
        const next = move(current, event.key === 'ArrowDown' ? 1 : -1)
        // Keyboard focus on an item's preview button follows the preview, so Enter closes the item shown.
        focusToggle.current = next !== current && Boolean(target?.matches('[data-preview-toggle]'))
      } else if (event.key.toLowerCase() === 'o') {
        const url = urlFor(current)
        if (!url) return
        event.preventDefault()
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close, move])

  useEffect(() => {
    if (selectedId === null) return
    if (focusToggle.current) {
      focusToggle.current = false
      document.querySelector<HTMLElement>(`[data-preview-toggle="${selectedId}"]`)?.focus({ preventScroll: true })
    }
    const row = document.querySelector(`[data-preview-id="${selectedId}"]`)
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  return {
    selectedId,
    /** The item after the selected one, loaded ahead so Down is instant. */
    nextId: index >= 0 && index + 1 < ids.length ? ids[index + 1] : undefined,
    /** Whether the selected item is still listed; it may have been cleared and refreshed away. */
    listed: index >= 0,
    select: setSelectedId as (id: number) => void,
    toggle,
    close,
    panelRef,
  }
}
