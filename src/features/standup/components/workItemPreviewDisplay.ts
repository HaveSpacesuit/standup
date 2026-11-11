import type { WorkItemPreview, WorkItemPreviewTextField } from '../../../ado/types'

export const PREVIEW_TEXT_LABELS: Record<WorkItemPreviewTextField, string> = {
  reproSteps: 'Repro steps',
  systemInfo: 'System info',
  description: 'Description',
  acceptanceCriteria: 'Acceptance criteria',
}

// Bugs lead with how to reproduce them; other types with what they are for.
const BUG_ORDER: readonly WorkItemPreviewTextField[] = ['reproSteps', 'systemInfo', 'description', 'acceptanceCriteria']
const OTHER_ORDER: readonly WorkItemPreviewTextField[] = ['description', 'acceptanceCriteria', 'reproSteps', 'systemInfo']

export type PreviewTextSection = { field: WorkItemPreviewTextField; label: string; html?: string; required: boolean }

const isBugType = (workItemType: string) => workItemType.trim().toLowerCase() === 'bug'

/**
 * The text sections to show: each field with content, and each required field even when empty, so what is missing
 * stands out. An item with neither still shows its main field (Repro steps for a bug, Description otherwise) as empty.
 */
export function getPreviewTextSections(
  workItemType: string,
  text: WorkItemPreview['text'],
  required: ReadonlySet<WorkItemPreviewTextField> = new Set(),
): PreviewTextSection[] {
  const order = isBugType(workItemType) ? BUG_ORDER : OTHER_ORDER
  const sections = order
    .filter((field) => text[field] || required.has(field))
    .map((field) => ({ field, label: PREVIEW_TEXT_LABELS[field], html: text[field], required: required.has(field) }))
  return sections.length ? sections : [{ field: order[0], label: PREVIEW_TEXT_LABELS[order[0]], required: false }]
}

/** "Acceptance criteria are empty", "Repro steps are empty", "Description is empty". */
export function describeEmptyText(label: string): string {
  return `${label} ${/(steps|criteria)$/i.test(label) ? 'are' : 'is'} empty`
}

const SIZE_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${SIZE_FORMAT.format(bytes / 1024)} KB`
  return `${SIZE_FORMAT.format(bytes / (1024 * 1024))} MB`
}

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i

export const isImageFileName = (name: string) => IMAGE_FILE.test(name)

/** The panel's element id on a page, which each row's preview button controls. */
export const previewPanelId = (page: string) => `${page}-preview-panel`

/** What a list needs to preview its rows: which row is previewed, and how to preview another or close it. */
export type PreviewControls = {
  selectedId: number | null
  panelId: string
  onSelect: (id: number) => void
  onToggle: (id: number) => void
}

/**
 * Styles for a list whose rows (`row`, such as '& > tr') hold a PreviewToggleButton: the button shows while its row is
 * hovered, focused or previewed, and always where there is no hover.
 */
export function revealPreviewToggles(row: string) {
  return {
    '& .preview-toggle': { opacity: 0, transition: 'opacity 120ms' },
    [`${row}:hover .preview-toggle, ${row}:focus-within .preview-toggle, & .preview-toggle[aria-pressed="true"]`]: { opacity: 1 },
    '@media (hover: none)': { '& .preview-toggle': { opacity: 1 } },
  }
}
