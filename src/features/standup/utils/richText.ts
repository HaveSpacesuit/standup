/**
 * Turns the HTML Azure DevOps stores for rich-text fields and comments into a small tree the page renders itself. Only
 * the formatting tags below survive; every attribute but a few table and list numbers is dropped, so styles written for
 * a light page (black text, white backgrounds) never reach the dark theme, and nothing can run script or load a page.
 */

export type RichTextTag =
  | 'p' | 'div' | 'br' | 'hr' | 'b' | 'strong' | 'i' | 'em' | 'u' | 's' | 'del' | 'ins' | 'sub' | 'sup' | 'code' | 'kbd'
  | 'mark' | 'small' | 'pre' | 'blockquote' | 'ul' | 'ol' | 'li' | 'dl' | 'dt' | 'dd' | 'table' | 'caption' | 'thead'
  | 'tbody' | 'tfoot' | 'tr' | 'th' | 'td' | 'a'

export type RichTextNode =
  | { kind: 'text'; text: string }
  | { kind: 'image'; src: string; alt: string; inLink: boolean }
  | {
      kind: 'element'
      tag: RichTextTag
      children: RichTextNode[]
      /** On links: an absolute http, https or mailto address. */
      href?: string
      /** A heading, shown as a bold block rather than a page heading, so it cannot break the panel's outline. */
      heading?: boolean
      colSpan?: number
      rowSpan?: number
      start?: number
    }

type HtmlParser = Pick<DOMParser, 'parseFromString'>

const KEPT = new Set<string>([
  'p', 'div', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'sub', 'sup', 'code', 'kbd', 'mark', 'small',
  'pre', 'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
])
const RENAMED: Record<string, RichTextTag> = { strike: 's', tt: 'code', center: 'div' }
const HEADING = /^h[1-6]$/
// Dropped with everything inside them; any other unknown tag is unwrapped, keeping its text.
const DROPPED = new Set([
  'script', 'style', 'template', 'noscript', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'param', 'svg',
  'math', 'canvas', 'video', 'audio', 'source', 'track', 'form', 'input', 'button', 'select', 'option', 'optgroup',
  'textarea', 'datalist', 'output', 'head', 'title', 'meta', 'link', 'base',
])
// Whitespace between these tags is only formatting. Tables cannot hold text outside their cells at all; the HTML parser
// already moves stray text out of them, so anything left is whitespace.
const STRUCTURAL = new Set<string>(['table', 'thead', 'tbody', 'tfoot', 'tr', 'ul', 'ol', 'dl'])
const TABLE_PARTS = new Set<string>(['table', 'thead', 'tbody', 'tfoot', 'tr'])
const IMAGE_SOURCE = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i

/** Deeper markup is flattened to its text, and a field stops after this many nodes; real fields are far smaller. */
export const RICH_TEXT_MAX_DEPTH = 32
export const RICH_TEXT_MAX_NODES = 4000

const ELEMENT_NODE = 1
const TEXT_NODE = 3

function safeHref(value: string | null): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/** An image the page may show: an absolute https or http address, or an inline picture. */
function safeImageSource(value: string | null): string | undefined {
  const src = value?.trim()
  if (!src) return undefined
  if (src.toLowerCase().startsWith('data:')) return IMAGE_SOURCE.test(src) ? src : undefined
  const href = safeHref(src)
  return href?.startsWith('http') ? href : undefined
}

function spanAttribute(element: Element, name: string): number | undefined {
  const value = Number(element.getAttribute(name))
  return Number.isInteger(value) && value > 1 && value <= 100 ? value : undefined
}

function defaultParser(): HtmlParser | undefined {
  return typeof DOMParser === 'function' ? new DOMParser() : undefined
}

/**
 * The tree for `html`, or null where the page has no HTML parser (server rendering), for the caller to show plain text.
 * The parser builds an inert document: nothing in it loads or runs.
 */
export function parseRichText(html: string, parser: HtmlParser | undefined = defaultParser()): RichTextNode[] | null {
  if (!parser) return null
  const body = parser.parseFromString(html, 'text/html').body
  if (!body) return []
  let budget = RICH_TEXT_MAX_NODES

  const convert = (parent: Node, parentTag: string, depth: number, inLink: boolean): RichTextNode[] => {
    const output: RichTextNode[] = []
    for (const node of Array.from(parent.childNodes)) {
      if (budget <= 0) break
      if (node.nodeType === TEXT_NODE) {
        const value = node.nodeValue ?? ''
        if (!value || TABLE_PARTS.has(parentTag) || (STRUCTURAL.has(parentTag) && !value.trim())) continue
        budget--
        output.push({ kind: 'text', text: value })
        continue
      }
      if (node.nodeType !== ELEMENT_NODE) continue
      const element = node as Element
      const name = element.tagName.toLowerCase()
      if (DROPPED.has(name)) continue
      budget--

      if (depth >= RICH_TEXT_MAX_DEPTH) {
        const flattened = element.textContent ?? ''
        if (flattened.trim() && !TABLE_PARTS.has(parentTag)) output.push({ kind: 'text', text: flattened })
        continue
      }
      if (name === 'img') {
        const src = safeImageSource(element.getAttribute('src'))
        if (src) output.push({ kind: 'image', src, alt: element.getAttribute('alt')?.trim() ?? '', inLink })
        continue
      }
      if (name === 'a') {
        const href = inLink ? undefined : safeHref(element.getAttribute('href'))
        const children = convert(element, parentTag, depth + 1, inLink || Boolean(href))
        if (href) output.push({ kind: 'element', tag: 'a', href, children })
        else output.push(...children)
        continue
      }

      const tag: RichTextTag | undefined = KEPT.has(name) ? name as RichTextTag : RENAMED[name] ?? (HEADING.test(name) ? 'div' : undefined)
      if (!tag) {
        // An unknown tag, such as span or font: keep what it wraps.
        output.push(...convert(element, parentTag, depth + 1, inLink))
        continue
      }
      const result: Extract<RichTextNode, { kind: 'element' }> = { kind: 'element', tag, children: convert(element, tag, depth + 1, inLink) }
      if (HEADING.test(name)) result.heading = true
      if (tag === 'td' || tag === 'th') {
        result.colSpan = spanAttribute(element, 'colspan')
        result.rowSpan = spanAttribute(element, 'rowspan')
      }
      if (tag === 'ol') {
        const start = Number(element.getAttribute('start')?.trim() || 1)
        if (Number.isInteger(start) && start !== 1 && Math.abs(start) <= 100_000) result.start = start
      }
      output.push(result)
    }
    return output
  }

  return convert(body, 'body', 0, false)
}
