import { useLayoutEffect, useState, type RefObject } from 'react'

export type ElementSize = { width: number; height: number }

/** Tracks the element's box with ResizeObserver, so SVG charts draw at their real size; `fallback` where it is missing, as in tests. */
export function useElementSize(ref: RefObject<HTMLElement | null>, fallback: ElementSize): ElementSize {
  const [size, setSize] = useState(fallback)

  useLayoutEffect(() => {
    const host = ref.current
    if (!host || typeof ResizeObserver === 'undefined') {
      return
    }

    const update = () => {
      const width = Math.floor(host.clientWidth)
      const height = Math.floor(host.clientHeight)
      setSize((previous) => (previous.width === width && previous.height === height ? previous : { width, height }))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => observer.disconnect()
  }, [ref])

  return size
}
