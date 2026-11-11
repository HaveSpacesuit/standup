import { createElement, Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgImage from '@stratakit/icons/image.svg'
import { toPlainText } from '../../../ado/triageApi'
import type { WorkItemPreviewImages } from '../hooks/useWorkItemPreview'
import { parseRichText, type RichTextNode } from '../utils/richText'
import { METER_TRACK_COLOR } from './workItemTableDisplay'

const PLAIN_TEXT_LIMIT = 4000
const BORDER = '1px solid var(--stratakit-color-border-neutral-muted)'

// Spacing for prose in a narrow panel: tight paragraphs, lists indented just past their markers, and tables and
// screenshots that never push the panel wider.
const richTextSx: SxProps<Theme> = {
  minWidth: 0,
  fontSize: 13,
  lineHeight: 1.55,
  color: 'text.primary',
  overflowWrap: 'anywhere',
  '& p, & ul, & ol, & dl, & pre, & blockquote, & .rt-table': { my: 0.75 },
  '& ul, & ol': { pl: 2.75 },
  '& li': { my: 0.25 },
  '& dt': { fontWeight: 650 },
  '& dd': { ml: 2 },
  '& .rt-heading': { fontWeight: 700, mt: 1.25, mb: 0.5 },
  '& a': { color: 'var(--stratakit-color-text-accent-strong)' },
  '& code, & kbd, & pre': { fontFamily: 'var(--stratakit-font-family-mono)', fontSize: 12 },
  '& code, & kbd': { px: 0.5, borderRadius: 0.5, bgcolor: METER_TRACK_COLOR },
  '& pre': { p: 1, whiteSpace: 'pre-wrap', borderRadius: 1, bgcolor: METER_TRACK_COLOR },
  '& pre code': { p: 0, bgcolor: 'transparent' },
  '& blockquote': { mx: 0, pl: 1.5, borderLeft: '3px solid var(--stratakit-color-border-neutral-muted)', color: 'text.secondary' },
  '& mark': { color: 'inherit', bgcolor: 'color-mix(in srgb, var(--stratakit-color-bg-attention-base) 30%, transparent)' },
  '& hr': { my: 1.25, border: 0, borderTop: BORDER },
  '& .rt-table': { overflowX: 'auto' },
  '& table': { borderCollapse: 'collapse', fontSize: 12 },
  '& th, & td': { px: 0.75, py: 0.5, border: BORDER, textAlign: 'left', verticalAlign: 'top' },
  '& th': { fontWeight: 650 },
  '& img': { display: 'block', maxWidth: '100%', height: 'auto', my: 0.75, border: BORDER, borderRadius: 1 },
  '& .rt-image-link': { display: 'block', width: 'fit-content', maxWidth: '100%' },
  '& .rt-image-note': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.75,
    my: 0.5,
    px: 1,
    py: 0.5,
    fontSize: 12,
    color: 'text.secondary',
    border: '1px dashed var(--stratakit-color-border-neutral-muted)',
    borderRadius: 1,
  },
  '& .rt-image-loading': { display: 'block', height: 96, maxWidth: 320, my: 0.75, borderRadius: 1, bgcolor: METER_TRACK_COLOR },
  '& > .rt-first': { mt: 0 },
  '& > .rt-last': { mb: 0 },
}

const iconStyle = { width: 14, height: 14, flexShrink: 0 }

const describeImage = (alt: string) => alt || 'Image'

function hostOf(src: string): string {
  try {
    return new URL(src).hostname
  } catch {
    return 'another site'
  }
}

/** A note in place of an image, linking to it unless it already sits inside a link. */
function ImageNote({ href, inLink, children }: { href?: string; inLink: boolean; children: ReactNode }) {
  const content = <><Icon href={svgImage} alt="" style={iconStyle} />{children}</>
  if (!href || inLink) return <span className="rt-image-note">{content}</span>
  return <a className="rt-image-note" href={href} target="_blank" rel="noopener noreferrer">{content}</a>
}

type ImageProps = { src: string; alt: string; inLink: boolean; images?: WorkItemPreviewImages }
type LoadedImage = { src: string; url?: string; failed?: boolean }

/**
 * A screenshot attached to the work item loads with the team's token and shows from memory; a click opens it full size
 * in Azure DevOps. Images from anywhere else are only linked, so the page never requests them.
 */
function RichTextImage({ src, alt, inLink, images }: ImageProps) {
  const inline = src.startsWith('data:')
  const loadable = !inline && Boolean(images?.canLoad(src))
  const [loaded, setLoaded] = useState<LoadedImage | null>(null)

  useEffect(() => {
    if (!loadable || !images) return undefined
    let active = true
    let url: string | undefined
    const request = images.load(src)
    if (!request) {
      setLoaded({ src, failed: true })
      return undefined
    }
    request.then(
      (blob) => {
        if (!active) return
        url = URL.createObjectURL(blob)
        setLoaded({ src, url })
      },
      () => {
        if (active) setLoaded({ src, failed: true })
      },
    )
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [loadable, images, src])

  if (inline) return <img src={src} alt={alt} />
  if (!loadable) return <ImageNote href={src} inLink={inLink}>{describeImage(alt)} from {hostOf(src)}</ImageNote>
  const current = loaded?.src === src ? loaded : null
  if (current?.failed) return <ImageNote href={src} inLink={inLink}>{describeImage(alt)} unavailable · open in Azure DevOps</ImageNote>
  if (!current?.url) return <span className="rt-image-loading" role="img" aria-label={`Loading ${describeImage(alt).toLowerCase()}`} />
  const image = <img src={current.url} alt={alt} />
  if (inLink) return image
  return (
    <a className="rt-image-link" href={src} target="_blank" rel="noopener noreferrer" aria-label={`${describeImage(alt)}, open full size in Azure DevOps`}>
      {image}
    </a>
  )
}

function renderNode(node: RichTextNode, key: number, images: WorkItemPreviewImages | undefined, edge?: string): ReactNode {
  if (node.kind === 'text') return <Fragment key={key}>{node.text}</Fragment>
  if (node.kind === 'image') return <RichTextImage key={key} src={node.src} alt={node.alt} inLink={node.inLink} images={images} />
  if (node.tag === 'br' || node.tag === 'hr') return createElement(node.tag, { key })
  const children = node.children.map((child, index) => renderNode(child, index, images))
  const props: Record<string, unknown> = { key }
  if (node.tag === 'a') Object.assign(props, { href: node.href, target: '_blank', rel: 'noopener noreferrer' })
  if (node.colSpan) props.colSpan = node.colSpan
  if (node.rowSpan) props.rowSpan = node.rowSpan
  if (node.start !== undefined) props.start = node.start
  const className = (classes: string[]) => classes.filter(Boolean).join(' ') || undefined
  if (node.tag === 'table') {
    // Wide tables scroll inside the text rather than widening the panel.
    return <div key={key} className={className(['rt-table', edge ?? ''])}>{createElement('table', props, children)}</div>
  }
  props.className = className([node.heading ? 'rt-heading' : '', edge ?? ''])
  return createElement(node.tag, props, children.length ? children : undefined)
}

// The first and last blocks lose their outer margins, so the text sits evenly in its box. Classes rather than
// :first-child, which emotion warns is unsafe.
function edgeOf(index: number, count: number): string | undefined {
  return [index === 0 ? 'rt-first' : '', index === count - 1 ? 'rt-last' : ''].filter(Boolean).join(' ') || undefined
}

type RichTextProps = {
  /** HTML from Azure DevOps; only plain formatting survives. */
  html: string
  images?: WorkItemPreviewImages
}

/** A rich-text field or comment, keeping its formatting and screenshots but none of its colors or fonts. */
export function RichText({ html, images }: RichTextProps) {
  const nodes = useMemo(() => parseRichText(html), [html])
  return (
    <Box sx={richTextSx}>
      {nodes ? nodes.map((node, index) => renderNode(node, index, images, edgeOf(index, nodes.length))) : toPlainText(html, PLAIN_TEXT_LIMIT)}
    </Box>
  )
}
