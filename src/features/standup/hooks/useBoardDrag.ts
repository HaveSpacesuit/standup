import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { WorkItemStatus } from '../../../ado/workItemStatus'
import type { BoardDropResult, DropOption, EditableWorkItem } from '../utils/workItemEditing'

/** Marks a board cell or lane head as a drop target; cells also carry the column. */
export const DROP_LANE_ATTRIBUTE = 'data-drop-lane'
export const DROP_COLUMN_ATTRIBUTE = 'data-drop-column'
/** Marks each choice in a column's state picker, by its index. */
export const DROP_SLOT_ATTRIBUTE = 'data-drop-slot'

/** How far the pointer moves before a press on a card becomes a drag, so clicks on the title still open it. */
const DRAG_THRESHOLD = 5
/** How close to the scroller's edge the pointer comes before the board scrolls, and how fast it scrolls there. */
const SCROLL_EDGE = 56
const SCROLL_SPEED = 18

// Presses on controls keep their own behavior; the title link still drags, since it covers most of the card.
const NO_DRAG_TARGETS = 'button, input, textarea, select, [role="button"], [contenteditable="true"]'

export type BoardDragSource = { item: EditableWorkItem; laneKey: string; column: WorkItemStatus }
/** A lane head has no column: dropping there changes the lane and keeps the card's column. */
export type BoardDropTarget = { laneKey: string; column: WorkItemStatus | null }
/** The handlers that make a card draggable; spread onto the card's wrapper. */
export type BoardDragProps = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
}

export type BoardDragState = {
  /** The same object for the whole drag. */
  source: BoardDragSource
  target: BoardDropTarget | null
  result: BoardDropResult | null
  /** The state picked in a column that offers several. */
  slot: number
}

type Session = {
  source: BoardDragSource
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  started: boolean
  state: BoardDragState | null
  frame: number
  cleanup: () => void
}

const targetKey = (target: BoardDropTarget | null) => (target ? `${target.laneKey}|${target.column ?? '*'}` : '')

/** Swallows a drag's click, waiting for pointer release when Esc cancels before the mouse is up. */
function suppressNextClick(pointerId: number, alreadyReleased: boolean) {
  const stop = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    cleanup()
  }
  const cleanup = () => {
    window.removeEventListener('click', stop, true)
    window.removeEventListener('pointerup', onPointerUp, true)
    window.removeEventListener('pointercancel', onPointerCancel, true)
    window.removeEventListener('blur', cleanup)
    if (releaseTimer !== undefined) window.clearTimeout(releaseTimer)
  }
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return
    window.removeEventListener('pointerup', onPointerUp, true)
    releaseTimer = window.setTimeout(cleanup, 0)
  }
  const onPointerCancel = (event: PointerEvent) => {
    if (event.pointerId === pointerId) cleanup()
  }
  let releaseTimer: number | undefined
  window.addEventListener('click', stop, true)
  window.addEventListener('pointercancel', onPointerCancel, true)
  window.addEventListener('blur', cleanup)
  if (alreadyReleased) {
    releaseTimer = window.setTimeout(cleanup, 0)
  } else {
    window.addEventListener('pointerup', onPointerUp, true)
  }
}

function readTarget(element: Element | null): { target: BoardDropTarget | null; slot: number | null } {
  const zone = element?.closest<HTMLElement>(`[${DROP_LANE_ATTRIBUTE}]`)
  const laneKey = zone?.getAttribute(DROP_LANE_ATTRIBUTE)
  if (!zone || !laneKey) return { target: null, slot: null }
  const column = (zone.getAttribute(DROP_COLUMN_ATTRIBUTE) || null) as WorkItemStatus | null
  const slot = element?.closest(`[${DROP_SLOT_ATTRIBUTE}]`)?.getAttribute(DROP_SLOT_ATTRIBUTE)
  return { target: { laneKey, column }, slot: slot ? Number(slot) : null }
}

/** Places the floating summary beside the pointer, flipping it to the other side near the window's edges. */
function placeGhost(ghost: HTMLElement | null, x: number, y: number) {
  if (!ghost) return
  const { offsetWidth: width, offsetHeight: height } = ghost
  const left = x + 14 + width > window.innerWidth - 8 ? Math.max(8, x - width - 14) : x + 14
  const top = y + 12 + height > window.innerHeight - 8 ? Math.max(8, y - height - 12) : y + 12
  ghost.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
}

/**
 * Drags board cards between cells with the mouse or a pen. A press becomes a drag once the pointer moves a few pixels;
 * the cell under the pointer is resolved to what the drop would change, the board scrolls near its edges, Esc cancels,
 * and releasing over a cell drops the card there. Touch keeps scrolling the board, and every move is also in the card's
 * menu.
 */
export function useBoardDrag({ enabled, scrollerRef, resolve, onDrop, onRefused }: {
  enabled: boolean
  scrollerRef: RefObject<HTMLElement | null>
  resolve: (source: BoardDragSource, target: BoardDropTarget) => BoardDropResult
  onDrop: (source: BoardDragSource, option: DropOption) => void
  onRefused?: (source: BoardDragSource, reason: string) => void
}) {
  const [drag, setDrag] = useState<BoardDragState | null>(null)
  const session = useRef<Session | null>(null)
  const ghostRef = useRef<HTMLElement | null>(null)
  const latest = useRef({ resolve, onDrop, onRefused })
  useEffect(() => {
    latest.current = { resolve, onDrop, onRefused }
  })

  const update = useCallback((next: BoardDragState) => {
    const current = session.current
    if (!current) return
    current.state = next
    setDrag(next)
  }, [])

  const hitTest = useCallback(() => {
    const current = session.current
    if (!current?.state) return
    const { target, slot } = readTarget(document.elementFromPoint(current.x, current.y))
    const state = current.state
    if (targetKey(target) !== targetKey(state.target)) {
      update({ ...state, target, result: target ? latest.current.resolve(current.source, target) : null, slot: slot ?? 0 })
    } else if (slot !== null && slot !== state.slot) {
      update({ ...state, slot })
    }
  }, [update])

  const end = useCallback((commit: boolean, alreadyReleased = false, pointerCancelled = false) => {
    const current = session.current
    if (!current) return
    session.current = null
    current.cleanup()
    cancelAnimationFrame(current.frame)
    setDrag(null)
    if (!current.started) return
    if (!pointerCancelled) suppressNextClick(current.pointerId, alreadyReleased)
    const result = commit ? current.state?.result : null
    if (result?.kind === 'options') {
      const option = result.options[current.state?.slot ?? 0] ?? result.options[0]
      if (option) latest.current.onDrop(current.source, option)
    } else if (result?.kind === 'refused') {
      latest.current.onRefused?.(current.source, result.reason)
    }
  }, [])

  const scrollTick = useCallback(() => {
    const current = session.current
    const scroller = scrollerRef.current
    if (!current?.started || !scroller) return
    const rect = scroller.getBoundingClientRect()
    const speed = (distance: number) => (distance < SCROLL_EDGE ? Math.ceil(SCROLL_SPEED * (1 - Math.max(distance, 0) / SCROLL_EDGE)) : 0)
    const dy = rect.height ? speed(rect.bottom - current.y) - speed(current.y - rect.top) : 0
    const dx = rect.width ? speed(rect.right - current.x) - speed(current.x - rect.left) : 0
    if (dx || dy) {
      const { scrollLeft, scrollTop } = scroller
      scroller.scrollBy(dx, dy)
      if (scroller.scrollLeft !== scrollLeft || scroller.scrollTop !== scrollTop) hitTest()
    }
    current.frame = requestAnimationFrame(scrollTick)
  }, [hitTest, scrollerRef])

  const begin = useCallback((source: BoardDragSource, event: ReactPointerEvent<HTMLElement>) => {
    const onMove = (move: PointerEvent) => {
      const current = session.current
      if (!current || move.pointerId !== current.pointerId) return
      current.x = move.clientX
      current.y = move.clientY
      if (!current.started) {
        if (Math.hypot(current.x - current.startX, current.y - current.startY) < DRAG_THRESHOLD) return
        current.started = true
        window.getSelection()?.removeAllRanges()
        update({ source: current.source, target: null, result: null, slot: 0 })
        current.frame = requestAnimationFrame(scrollTick)
      }
      move.preventDefault()
      hitTest()
      placeGhost(ghostRef.current, current.x, current.y)
    }
    const onUp = (up: PointerEvent) => {
      const current = session.current
      if (up.pointerId !== current?.pointerId) return
      // Release over the state picker's band that is under the pointer now, even if it rendered after the last move.
      current.x = up.clientX
      current.y = up.clientY
      hitTest()
      end(true, true)
    }
    const onCancel = (cancel: PointerEvent) => {
      if (cancel.pointerId === session.current?.pointerId) end(false, false, true)
    }
    const onKeyDown = (key: KeyboardEvent) => {
      if (key.key !== 'Escape' || !session.current?.started) return
      // Esc ends only the drag, not the preview panel or a dialog behind it.
      key.preventDefault()
      key.stopPropagation()
      end(false)
    }
    const onBlur = () => end(false, false, true)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onBlur)
    session.current = {
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      started: false,
      state: null,
      frame: 0,
      cleanup: () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKeyDown, true)
        window.removeEventListener('blur', onBlur)
      },
    }
  }, [end, hitTest, scrollTick, update])

  useEffect(() => {
    if (!enabled) end(false, false, true)
  }, [enabled, end])
  useEffect(() => () => end(false, false, true), [end])
  // A column offering several states renders a band for each once the card enters it; point at the band under the pointer.
  const result = drag?.result
  useEffect(() => {
    if (result?.kind === 'options' && result.options.length > 1) hitTest()
  }, [result, hitTest])

  /** Props for a card's wrapper that let it be dragged from this cell. */
  const getDragProps = (source: BoardDragSource): BoardDragProps | undefined => (enabled ? {
    onPointerDown: (event) => {
      if (event.button !== 0 || event.pointerType === 'touch' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      if (session.current || (event.target instanceof Element && event.target.closest(NO_DRAG_TARGETS))) return
      begin(source, event)
    },
    // The browser's own drag of the title link or an avatar would cancel the pointer events.
    onDragStart: (event) => event.preventDefault(),
  } : undefined)

  /** Positions the floating summary as soon as it renders, before the pointer next moves. */
  const setGhost = useCallback((element: HTMLElement | null) => {
    ghostRef.current = element
    const current = session.current
    if (element && current) placeGhost(element, current.x, current.y)
  }, [])

  return { drag, getDragProps, setGhost }
}
