import { useId, useRef, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { Alert, Box, Button, IconButton, Link, Skeleton, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgAttach from '@stratakit/icons/attach.svg'
import svgChat from '@stratakit/icons/chat.svg'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgDocument from '@stratakit/icons/document.svg'
import svgImage from '@stratakit/icons/image.svg'
import svgKeyboard from '@stratakit/icons/keyboard.svg'
import svgLink from '@stratakit/icons/link.svg'
import svgVisibilityShow from '@stratakit/icons/visibility-show.svg'
import svgWindowPopout from '@stratakit/icons/window-popout.svg'
import type { WorkItemPreview, WorkItemPreviewTextField } from '../../../ado/types'
import { PREVIEW_LINK_LIMIT } from '../../../ado/workItemPreviewApi'
import { clampPreviewPanelWidth, PREVIEW_LIST_MIN_WIDTH, PREVIEW_PANEL_WIDTH } from '../hooks/usePreviewPanel'
import type { WorkItemPreviewImages } from '../hooks/useWorkItemPreview'
import { formatTriageMoment, formatTriageWhen } from '../utils/triageInbox'
import { AppTooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'
import { RichText } from './RichText'
import { TriageTypeIcon } from './TriageFields'
import { PersonLabel, StateLabel } from './WorkItemFields'
import { describeEmptyText, formatFileSize, getPreviewTextSections, isImageFileName } from './workItemPreviewDisplay'

const MUTED_BORDER = '1px solid var(--stratakit-color-border-neutral-muted)'
const sectionIconStyle = { width: 13, height: 13, color: 'var(--stratakit-color-icon-neutral-secondary)' }
const smallIconStyle = { width: 14, height: 14, flexShrink: 0 }

const panelSx: SxProps<Theme> = {
  position: 'relative',
  flex: 'none',
  minWidth: `min(${PREVIEW_PANEL_WIDTH.min}px, 100%)`,
  // The list keeps room beside the panel, however wide it was dragged on a larger window.
  maxWidth: `calc(100% - ${PREVIEW_LIST_MIN_WIDTH}px)`,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  borderLeft: 1,
  borderColor: 'divider',
  bgcolor: 'var(--stratakit-color-bg-page-base)',
}

// A wide, invisible grip over the panel's edge, showing an accent line while hovered or dragged; keyboard focus shows
// StrataKit's focus ring around it.
const resizerSx: SxProps<Theme> = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: -4,
  width: 8,
  zIndex: 2,
  cursor: 'col-resize',
  touchAction: 'none',
  '&::after': { content: '""', position: 'absolute', top: 0, bottom: 0, left: 3, width: 2, transition: 'background-color 120ms' },
  '&:hover::after, &[data-dragging]::after': { bgcolor: 'var(--stratakit-color-border-accent-base)' },
}

const headSx: SxProps<Theme> = {
  display: 'grid',
  gap: 0.75,
  px: 1.75,
  py: 1.25,
  borderBottom: 1,
  borderColor: 'divider',
  '& .top': { display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 28, fontSize: 12, color: 'text.secondary' },
  '& .top .id': { fontWeight: 650, color: 'text.primary', fontVariantNumeric: 'tabular-nums' },
  '& .top .spacer': { flex: 1 },
  '& .facts': { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 16px', fontSize: 12 },
  '& .facts > span': { display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 },
  '& .facts .label': { color: TERTIARY_TEXT_COLOR },
}

const bodySx: SxProps<Theme> = { flex: 1, minHeight: 0, overflow: 'auto', px: 1.75, pb: 2 }

const footSx: SxProps<Theme> = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px 12px',
  px: 1.75,
  py: 1,
  borderTop: 1,
  borderColor: 'divider',
  fontSize: 11.5,
  color: TERTIARY_TEXT_COLOR,
  '& kbd': {
    display: 'inline-block',
    minWidth: 18,
    px: 0.5,
    mr: 0.25,
    border: MUTED_BORDER,
    borderRadius: 'var(--stratakit-radius-sm)',
    font: 'inherit',
    fontSize: 11,
    lineHeight: '16px',
    textAlign: 'center',
  },
}

const sectionSx: SxProps<Theme> = {
  '& > h3': {
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
    m: 0,
    mt: 1.75,
    mb: 0.75,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: TERTIARY_TEXT_COLOR,
  },
  '& > h3 .count': { fontWeight: 600, letterSpacing: 0 },
}

const textBoxSx: SxProps<Theme> = { px: 1.25, py: 1, border: MUTED_BORDER, borderRadius: 1, bgcolor: 'background.paper' }
const emptyTextSx: SxProps<Theme> = {
  px: 1.25,
  py: 0.75,
  fontSize: 12.5,
  border: '1px dashed var(--stratakit-color-border-neutral-muted)',
  borderRadius: 1,
  color: TERTIARY_TEXT_COLOR,
  '&.missing': {
    borderColor: 'var(--stratakit-color-border-attention-base)',
    color: 'var(--stratakit-color-text-attention-base)',
    fontWeight: 600,
  },
}
const noneSx: SxProps<Theme> = { m: 0, fontSize: 12, color: TERTIARY_TEXT_COLOR }

const attachmentListSx: SxProps<Theme> = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 0.75,
  m: 0,
  p: 0,
  listStyle: 'none',
  '& > li': { maxWidth: '100%' },
  '& a': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.75,
    maxWidth: '100%',
    height: 26,
    px: 1,
    fontSize: 12,
    color: 'text.primary',
    textDecoration: 'none',
    border: MUTED_BORDER,
    borderRadius: 1,
    bgcolor: 'background.paper',
  },
  '& a:hover': { borderColor: 'var(--stratakit-color-border-accent-base)' },
  '& .name': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '& .size': { flexShrink: 0, color: TERTIARY_TEXT_COLOR },
}

const commentListSx: SxProps<Theme> = {
  display: 'grid',
  gap: 1.5,
  m: 0,
  p: 0,
  listStyle: 'none',
  '& > li': { display: 'grid', gap: 0.5, pl: 1.25, borderLeft: '2px solid var(--stratakit-color-border-neutral-muted)' },
  '& .comment-head': { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px', fontSize: 12, fontWeight: 600 },
  '& .comment-head time, & .comment-head .edited': { fontWeight: 400, color: TERTIARY_TEXT_COLOR },
}

const linkListSx: SxProps<Theme> = {
  display: 'grid',
  gap: 0.75,
  m: 0,
  p: 0,
  listStyle: 'none',
  fontSize: 12.5,
  '& > li': { display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr) auto', alignItems: 'baseline', gap: 1 },
  '& .relation': { color: TERTIARY_TEXT_COLOR, fontSize: 12 },
  '& .linked-id': { fontWeight: 650, fontVariantNumeric: 'tabular-nums', mr: 0.5 },
  '& a': { overflowWrap: 'anywhere' },
}

/** What the panel's header shows of the item; the page has these already, so they show before the details load. */
export type PreviewWorkItem = {
  id: number
  title: string
  workItemType: string
  workItemUrl: string
  workItemIconUrl?: string
}

function PanelResizer({ panelRef, width, onResize }: {
  panelRef: RefObject<HTMLElement | null>
  width: number
  onResize: (width: number) => void
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  // The list keeps its room, so the widest the panel can go depends on the window.
  const widest = () => {
    const layout = panelRef.current?.parentElement?.clientWidth
    return layout ? Math.min(PREVIEW_PANEL_WIDTH.max, layout - PREVIEW_LIST_MIN_WIDTH) : PREVIEW_PANEL_WIDTH.max
  }
  const rendered = () => panelRef.current?.getBoundingClientRect().width || width
  const resize = (next: number) => onResize(clampPreviewPanelWidth(next, widest()))
  const endDrag = (event: PointerEvent<HTMLElement>) => {
    drag.current = null
    delete event.currentTarget.dataset.dragging
  }

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize preview"
      aria-valuenow={Math.round(width)}
      aria-valuemin={PREVIEW_PANEL_WIDTH.min}
      aria-valuemax={PREVIEW_PANEL_WIDTH.max}
      tabIndex={0}
      sx={resizerSx}
      onPointerDown={(event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0) return
        event.preventDefault()
        drag.current = { startX: event.clientX, startWidth: rendered() }
        event.currentTarget.dataset.dragging = ''
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }}
      onPointerMove={(event: PointerEvent<HTMLElement>) => {
        // The panel is on the right, so dragging left widens it.
        if (drag.current) resize(drag.current.startWidth + drag.current.startX - event.clientX)
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => resize(PREVIEW_PANEL_WIDTH.initial)}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        const next = {
          ArrowLeft: rendered() + PREVIEW_PANEL_WIDTH.step,
          ArrowRight: rendered() - PREVIEW_PANEL_WIDTH.step,
          Home: PREVIEW_PANEL_WIDTH.min,
          End: widest(),
        }[event.key]
        if (next === undefined) return
        event.preventDefault()
        resize(next)
      }}
    />
  )
}

type WorkItemPreviewPanelProps = {
  /** The panel's id, which each item's preview button controls. */
  panelId: string
  panelRef: RefObject<HTMLElement | null>
  width: number
  onResize: (width: number) => void
  onClose: () => void
  /** The selected item's id, shown even once it has left the list. */
  id: number
  /** The item, or undefined once it has left the page's list, when `children` explains why. */
  item?: PreviewWorkItem
  /** The item's fields as a row under its title, like the list shows them. */
  facts?: ReactNode
  /** Shown in place of the title while the item is not on the page. */
  missingTitle?: string
  children: ReactNode
}

/**
 * A resizable panel beside a list, showing one item: its type, id and title over its fields, then sections the page
 * chooses, then the keys that move through the list.
 */
export function WorkItemPreviewPanel({
  panelId, panelRef, width, onResize, onClose, id, item, facts, missingTitle = 'Not in this list', children,
}: WorkItemPreviewPanelProps) {
  const titleId = useId()
  return (
    <Box component="aside" id={panelId} ref={panelRef} aria-labelledby={titleId} sx={panelSx} style={{ width }}>
      <PanelResizer panelRef={panelRef} width={width} onResize={onResize} />
      <Box sx={headSx}>
        <div className="top">
          {item ? <TriageTypeIcon item={item} /> : null}
          <span className="id">{id}</span>
          {item ? <span>{item.workItemType}</span> : null}
          <span className="spacer" />
          {item ? (
            <AppTooltip title="Open in Azure DevOps (O)">
              <IconButton size="small" aria-label="Open in Azure DevOps" href={item.workItemUrl} target="_blank" rel="noopener noreferrer">
                <Icon href={svgWindowPopout} />
              </IconButton>
            </AppTooltip>
          ) : null}
          <AppTooltip title="Close preview (Esc)">
            <IconButton size="small" aria-label="Close preview" onClick={onClose}><Icon href={svgDismiss} /></IconButton>
          </AppTooltip>
        </div>
        <Typography id={titleId} variant="body-md" render={<h2 />} sx={{ m: 0, fontWeight: 700, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
          {item?.title ?? missingTitle}
        </Typography>
        {item && facts ? <div className="facts">{facts}</div> : null}
      </Box>
      <Box sx={bodySx}>{children}</Box>
      <Box sx={footSx}>
        <Icon href={svgKeyboard} alt="" style={smallIconStyle} />
        <span><kbd>J</kbd><kbd>K</kbd> next / previous</span>
        <span><kbd>O</kbd> open in Azure DevOps</span>
        <span><kbd>Esc</kbd> close</span>
      </Box>
    </Box>
  )
}

/** A labelled part of the panel, with a small heading so the item's own text stands out. */
export function PreviewSection({ heading, iconHref, count, children }: {
  heading: string
  iconHref: string
  count?: number
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <Box component="section" aria-labelledby={headingId} sx={sectionSx}>
      <h3 id={headingId}>
        <Icon href={iconHref} alt="" style={sectionIconStyle} />
        {heading}
        {count ? <span className="count">· {count}</span> : null}
      </h3>
      {children}
    </Box>
  )
}

function DetailsSkeleton() {
  return (
    <>
      <Box role="status" sx={visuallyHiddenSx}>Loading details</Box>
      <Box aria-hidden="true" sx={{ display: 'grid', gap: 1, mt: 1.75 }}>
        <Skeleton variant="rounded" height={12} width="28%" />
        <Skeleton variant="rounded" height={132} />
        <Skeleton variant="rounded" height={12} width="28%" sx={{ mt: 1 }} />
        <Skeleton variant="rounded" height={26} width="60%" />
        <Skeleton variant="rounded" height={12} width="28%" sx={{ mt: 1 }} />
        <Skeleton variant="rounded" height={56} />
      </Box>
    </>
  )
}

function Attachments({ attachments }: { attachments: WorkItemPreview['attachments'] }) {
  if (!attachments.length) return <Box component="p" sx={noneSx}>None</Box>
  return (
    <Box component="ul" role="list" sx={attachmentListSx}>
      {attachments.map((attachment) => (
        <li key={attachment.url}>
          <a href={attachment.url} target="_blank" rel="noopener noreferrer">
            <Icon href={isImageFileName(attachment.name) ? svgImage : svgDocument} alt="" style={smallIconStyle} />
            <span className="name">{attachment.name}</span>
            {attachment.size !== undefined ? <span className="size">{formatFileSize(attachment.size)}</span> : null}
            <Box component="span" sx={visuallyHiddenSx}> (opens in a new tab)</Box>
          </a>
        </li>
      ))}
    </Box>
  )
}

function Comments({ preview, workItemUrl, images, now }: {
  preview: WorkItemPreview
  workItemUrl: string
  images?: WorkItemPreviewImages
  now: Date
}) {
  if (preview.commentsError !== undefined) {
    return (
      <Alert severity="warning">
        Comments could not be loaded. {preview.commentsError}{' '}
        <Link href={workItemUrl} target="_blank" rel="noopener noreferrer">View them in Azure DevOps</Link>
      </Alert>
    )
  }
  if (!preview.comments.length) return <Box component="p" sx={noneSx}>No comments yet</Box>
  return (
    <>
      <Box component="ol" role="list" aria-label="Newest comments first" sx={commentListSx}>
        {preview.comments.map((comment) => (
          <li key={comment.id}>
            <div className="comment-head">
              <PersonLabel person={comment.by} emptyLabel="Someone" />
              <AppTooltip title={formatTriageMoment(comment.at)} describeChild>
                <time dateTime={comment.at}>{formatTriageWhen(comment.at, now)}</time>
              </AppTooltip>
              {comment.edited ? <span className="edited">edited</span> : null}
            </div>
            <RichText html={comment.html} images={images} />
          </li>
        ))}
      </Box>
      {preview.commentCount > preview.comments.length ? (
        <Link href={workItemUrl} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-block', mt: 1, fontSize: 12.5 }}>
          View all {preview.commentCount} comments in Azure DevOps
        </Link>
      ) : null}
    </>
  )
}

function Links({ preview, workItemUrl }: { preview: WorkItemPreview; workItemUrl: string }) {
  const named = preview.links.slice(0, PREVIEW_LINK_LIMIT)
  const more = preview.links.length - named.length
  if (!named.length && !preview.hyperlinks.length && !preview.developmentLinks) return <Box component="p" sx={noneSx}>No links</Box>
  return (
    <>
      {named.length && preview.linkTitlesError !== undefined ? (
        <Alert severity="warning" sx={{ mb: 1 }}>Linked items could not be named. {preview.linkTitlesError}</Alert>
      ) : null}
      {named.length || preview.hyperlinks.length ? (
        <Box component="ul" role="list" sx={linkListSx}>
          {named.map((link, index) => (
            <li key={`${link.label}:${link.id}:${index}`}>
              <span className="relation">{link.label}</span>
              <Link href={link.workItemUrl} target="_blank" rel="noopener noreferrer">
                <span className="linked-id">{link.id}</span>
                {link.title ?? link.workItemType ?? 'Work item'}
              </Link>
              {link.state ? <StateLabel state={link.state} /> : <span />}
            </li>
          ))}
          {preview.hyperlinks.map((hyperlink, index) => (
            <li key={`hyperlink:${hyperlink.url}:${index}`}>
              <span className="relation">Hyperlink</span>
              <Link href={hyperlink.url} target="_blank" rel="noopener noreferrer">{hyperlink.label}</Link>
              <span />
            </li>
          ))}
        </Box>
      ) : null}
      {more > 0 || preview.developmentLinks ? (
        <Box component="p" sx={{ ...noneSx, mt: named.length || preview.hyperlinks.length ? 1 : 0 }}>
          {[
            more > 0 ? `${more} more linked ${more === 1 ? 'item' : 'items'}` : '',
            preview.developmentLinks
              ? `${preview.developmentLinks} development ${preview.developmentLinks === 1 ? 'link' : 'links'} (pull requests, commits and builds)`
              : '',
          ].filter(Boolean).join(' and ')}
          {' in '}
          <Link href={workItemUrl} target="_blank" rel="noopener noreferrer">Azure DevOps</Link>
        </Box>
      ) : null}
    </>
  )
}

/** The selected item's details as useWorkItemPreview loads them. */
export type PreviewLoad = { preview?: WorkItemPreview; loading: boolean; error?: string; retry: () => void }

type WorkItemPreviewDetailsProps = {
  item: Pick<PreviewWorkItem, 'workItemType' | 'workItemUrl'>
  load: PreviewLoad
  images?: WorkItemPreviewImages
  /** Text fields the page expects filled in; empty ones are flagged rather than muted. */
  required?: ReadonlySet<WorkItemPreviewTextField>
  now?: Date
}

/** The item's text, attachments, newest comments and links, as Azure DevOps has them now. */
export function WorkItemPreviewDetails({ item, load, images, required, now = new Date() }: WorkItemPreviewDetailsProps) {
  const { preview, error } = load
  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 1.75 }} action={<Button size="small" onClick={load.retry}>Retry</Button>}>
        {error}
      </Alert>
    )
  }
  if (!preview) return <DetailsSkeleton />
  return (
    <>
      {getPreviewTextSections(item.workItemType, preview.text, required).map((section) => (
        <PreviewSection key={section.field} heading={section.label} iconHref={svgDocument}>
          {section.html ? (
            <Box sx={textBoxSx}><RichText html={section.html} images={images} /></Box>
          ) : (
            <Box className={section.required ? 'missing' : undefined} sx={emptyTextSx}>{describeEmptyText(section.label)}</Box>
          )}
        </PreviewSection>
      ))}
      <PreviewSection heading="Attachments" iconHref={svgAttach} count={preview.attachments.length}>
        <Attachments attachments={preview.attachments} />
      </PreviewSection>
      <PreviewSection heading="Comments" iconHref={svgChat} count={preview.commentCount}>
        <Comments preview={preview} workItemUrl={item.workItemUrl} images={images} now={now} />
      </PreviewSection>
      <PreviewSection heading="Links" iconHref={svgLink} count={preview.links.length + preview.hyperlinks.length}>
        <Links preview={preview} workItemUrl={item.workItemUrl} />
      </PreviewSection>
    </>
  )
}

/**
 * The eye button on a row or card that opens its preview, or closes it again. It shows while the row is hovered,
 * focused or previewed, and always on touch screens; style the list with revealPreviewToggles.
 */
export function PreviewToggleButton({ id, selected, panelId, onToggle }: {
  id: number
  selected: boolean
  panelId: string
  onToggle: (id: number) => void
}) {
  return (
    <AppTooltip title={selected ? 'Close preview (Esc)' : 'Preview · J and K move through the list'} describeChild>
      <IconButton
        size="small"
        className="preview-toggle"
        data-preview-toggle={id}
        aria-label={`Preview ${id}`}
        aria-pressed={selected}
        aria-controls={selected ? panelId : undefined}
        onClick={(event) => {
          event.stopPropagation()
          onToggle(id)
        }}
      >
        <Icon href={svgVisibilityShow} />
      </IconButton>
    </AppTooltip>
  )
}
