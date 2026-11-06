import { useId } from 'react'

/** A unique id safe inside SVG `url(#…)` references, which React's ids (with « » or colons) are not. */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
}
