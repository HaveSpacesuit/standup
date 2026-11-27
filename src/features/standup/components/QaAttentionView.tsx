import { memo, useId, useMemo, useState } from 'react'
import { Alert, Box, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import type { TeamIterationOption, WorkItemSummary } from '../../../ado/types'
import type { AttentionItemsState } from '../hooks/useAttentionItems'
import { useWorkItemPreview, type WorkItemPreviewSource } from '../hooks/useWorkItemPreview'
import { isPreviewRowClick, usePreviewPanelWidth, usePreviewSelection } from '../hooks/usePreviewPanel'
import { matchingAttentionTags, sortAttentionItems } from '../utils/attentionTags'
import { matchesQuickFilter, normalizeQuickFilterText } from '../utils/boardFilters'
import { AttentionTags } from './AttentionTags'
import { StableTableBody } from './StableTableBody'
import { EditableFieldButton, EditTagsButton, WorkItemActions } from './WorkItemActions'
import { PreviewToggleButton, WorkItemPreviewDetails, WorkItemPreviewPanel } from './WorkItemPreviewPanel'
import { CreatedAge, ImpactBars, MissingValue, NotSet, PersonLabel, SeverityChip, SprintLabel, StateLabel } from './WorkItemFields'
import { WorkItemTitle } from './WorkItemTitle'
import { WorkItemTypeIcon } from './WorkItemCardParts'
import { workItemTitleCellSx } from './workItemTableDisplay'
import { revealPreviewToggles, type PreviewControls } from './workItemPreviewDisplay'
import { getEditableRowProps, useWorkItemEditing } from './workItemEditingContext'
import { createBacklogSprintResolver, type BacklogSprintResolver } from '../utils/backlogSprint'
import { getEditableFields } from '../utils/workItemEditing'
import { AppTooltip } from './AppTooltip'
import { visuallyHiddenSx } from './developmentCardDisplay'

const COLUMNS: ReadonlyArray<{ label: string; width?: number; align?: 'right'; tip?: string }> = [
  { label: 'Item' },
  { label: 'Severity', width: 128 },
  { label: 'Impact', width: 88, tip: 'The Priority field: how many users hit it, from 1 (most) to 4 (few).' },
  { label: 'Effort', width: 80, align: 'right' },
  { label: 'Age', width: 72, align: 'right', tip: 'Time since the item was created.' },
  { label: 'Sprint', width: 176 },
  { label: 'State', width: 128 },
  { label: 'Assigned to', width: 200 },
  { label: 'QA board visibility', width: 208 },
]
const noWrapSx = { whiteSpace: 'nowrap' }
const EMPTY_ITERATIONS: TeamIterationOption[] = []

const AttentionRow = memo(function AttentionRow({ item, resolveSprint, coverage, preview, selected }: {
  item: WorkItemSummary
  resolveSprint: BacklogSprintResolver
  coverage: string
  preview?: Omit<PreviewControls, 'selectedId'>
  selected: boolean
}) {
  const editing = useWorkItemEditing()
  const editableFields = getEditableFields(item)
  return (
    <TableRow selected={selected} data-preview-id={preview ? item.id : undefined}
      {...getEditableRowProps(editing, item)}
      onClick={preview ? (event) => { if (isPreviewRowClick(event)) preview.onSelect(item.id) } : undefined}>
      <TableCell component="th" scope="row" sx={workItemTitleCellSx}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, '& > :not(.row-tools)': { minWidth: 0 }, '& > .row-tools': { ml: 'auto', my: -0.5, flex: 'none', display: 'inline-flex' } }}>
          {item.workItemUrl ? (
            <WorkItemTitle item={{ ...item, workItemUrl: item.workItemUrl }} editableTags
              icon={item.workItemIconUrl ? <WorkItemTypeIcon item={item} /> : <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>{item.workItemType}</Box>}
              tagsAction={<EditTagsButton item={item} />} />
          ) : <span>{item.workItemType} {item.id} {item.title}</span>}
          <Box className="row-tools">
            <WorkItemActions item={item} />
            {preview ? <PreviewToggleButton id={item.id} selected={selected} panelId={preview.panelId} onToggle={preview.onToggle} /> : null}
          </Box>
        </Box>
      </TableCell>
      <TableCell sx={noWrapSx}>
        <EditableFieldButton item={item} field="severity">
          {editableFields.includes('severity') ? <SeverityChip severity={item.severity} unsetTip="Severity is not set yet." /> : <NotSet />}
        </EditableFieldButton>
      </TableCell>
      <TableCell sx={noWrapSx}><EditableFieldButton item={item} field="priority"><ImpactBars priority={item.priority} detail="The Priority field" missingTip="Impact is not set yet." /></EditableFieldButton></TableCell>
      <TableCell align="right" sx={noWrapSx}>
        <EditableFieldButton item={item} field="effort">
          {item.effort ?? (editableFields.includes('effort') ? <MissingValue tip="Effort is not set yet." /> : <NotSet />)}
        </EditableFieldButton>
      </TableCell>
      <TableCell align="right" sx={noWrapSx}><CreatedAge createdAt={item.createdAt} /></TableCell>
      <TableCell sx={noWrapSx}><EditableFieldButton item={item} field="iterationPath"><SprintLabel sprint={resolveSprint(item.iterationPath)} iterationPath={item.iterationPath} /></EditableFieldButton></TableCell>
      <TableCell sx={noWrapSx}><EditableFieldButton item={item} field="state"><StateLabel state={item.state} /></EditableFieldButton></TableCell>
      <TableCell><EditableFieldButton item={item} field="assignedTo"><PersonLabel person={item.assignedTo} emptyLabel="Unassigned" /></EditableFieldButton></TableCell>
      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{coverage}</TableCell>
    </TableRow>
  )
})

export function QaAttentionView({ attention, tags, representedIds, selectedTag, onTagChange, search, onManage, onRetry, previewSource, scope, teamIterations = EMPTY_ITERATIONS }: {
  attention: AttentionItemsState
  tags: readonly string[]
  representedIds: ReadonlySet<number> | null
  selectedTag: string | null
  onTagChange: (tag: string | null) => void
  search: string
  onManage: () => void
  onRetry: () => void
  previewSource: WorkItemPreviewSource | null
  scope: string
  teamIterations?: TeamIterationOption[]
}) {
  const resolveSprint = useMemo(() => createBacklogSprintResolver(teamIterations), [teamIterations])
  const [limit, setLimit] = useState(50)
  const filterKey = JSON.stringify([scope, selectedTag, search])
  const [previousFilter, setPreviousFilter] = useState(filterKey)
  if (previousFilter !== filterKey) { setPreviousFilter(filterKey); setLimit(50) }
  const filtered = useMemo(() => sortAttentionItems(attention.items.filter((item) =>
    (!selectedTag || matchingAttentionTags(item, [selectedTag]).length > 0)
    && matchesQuickFilter(item, normalizeQuickFilterText(search), item.assignedTo?.displayName
      ? { kind: 'team-member', label: item.assignedTo.displayName } : undefined))),
  [attention.items, selectedTag, search])
  const visible = filtered.slice(0, limit)
  const selection = usePreviewSelection({
    ids: visible.map((item) => item.id),
    getUrl: (id) => attention.items.find((item) => item.id === id)?.workItemUrl,
    scope,
  })
  const selected = attention.items.find((item) => item.id === selection.selectedId)
  const panelId = useId()
  const rowPreview = useMemo(() => previewSource ? { panelId, onSelect: selection.select, onToggle: selection.toggle } : undefined,
    [previewSource, panelId, selection.select, selection.toggle])
  const [width, resize] = usePreviewPanelWidth()
  const load = useWorkItemPreview(previewSource, selected?.id ?? null, selection.nextId)
  const previewItem = selected?.workItemType && selected.workItemUrl
    ? { ...selected, workItemType: selected.workItemType, workItemUrl: selected.workItemUrl }
    : undefined
  const unavailable = attention.loading || attention.error || attention.syncedAt === null
  return (
    <Box component="main" sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', containerType: 'inline-size' }}>
      <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <Typography render={<h2 />} variant="body-lg" sx={{ fontWeight: 700 }}>Open attention items</Typography>
          <Button size="small" onClick={onManage} sx={{ ml: 'auto' }}>Manage tags</Button>
        </Box>
        <Typography variant="body-sm" color="text.secondary">
          Team area and descendants · All iterations · All open types. QA sprint, lookback, type, and hidden-tag filters do not apply.
        </Typography>
        {!unavailable && tags.length ? (
          <Typography variant="body-sm" sx={{ mt: 1 }}>
            {attention.items.length} open tagged items · {attention.items.filter((item) => !item.assignedTo?.displayName && !item.assignedTo?.uniqueName).length} unassigned
            {' · '}{representedIds ? `${attention.items.filter((item) => !representedIds.has(item.id)).length} not on current QA board` : 'QA board coverage unavailable'}
          </Typography>
        ) : null}
      </Box>
      {!tags.length ? <Alert severity="info">Attention tracking is off for this team. Choose attention tags to start.</Alert>
        : attention.error ? <Alert severity="error" role="alert" action={<Button onClick={onRetry}>Retry</Button>}>Attention unavailable. {attention.error}</Alert>
          : unavailable ? <Typography role="status" sx={{ p: 2 }}>Checking open tagged items...</Typography>
            : (
              <>
                <Box role="group" aria-label="Filter attention tags" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 2 }}>
                  <Button size="small" aria-pressed={!selectedTag} variant={!selectedTag ? 'contained' : 'text'} onClick={() => onTagChange(null)}>All tags · {attention.items.length}</Button>
                  {tags.map((tag) => (
                    <Button key={tag} size="small" aria-pressed={selectedTag === tag}
                      variant={selectedTag === tag ? 'contained' : 'text'} onClick={() => onTagChange(selectedTag === tag ? null : tag)}>
                      {tag} · {attention.items.filter((item) => matchingAttentionTags(item, [tag]).length).length}
                    </Button>
                  ))}
                </Box>
                <Box sx={{
                  display: 'flex', flex: 1, minHeight: 0, minWidth: 0,
                  '@container (max-width: 800px)': { flexDirection: 'column', overflow: 'auto', '& > aside': { width: '100% !important', maxWidth: '100%', minWidth: 0, minHeight: 320 } },
                }}>
                  <Box sx={{ flex: 1, minWidth: 0, minHeight: 240, display: 'flex', flexDirection: 'column' }}>
                    <Typography role="status" variant="body-sm" sx={{ px: 2, pb: 1 }}>
                      {filtered.length} of {attention.items.length} open tagged items · Unassigned first · Tag counts can overlap
                    </Typography>
                    {!filtered.length ? (
                      <Typography sx={{ p: 2 }}>
                        {attention.items.length ? 'No items match this attention filter.' : `No open items with ${tags.join(' or ')} were found in this team's area. This is not a release-readiness check.`}
                      </Typography>
                    ) : (
                      <TableContainer tabIndex={0} role="region" aria-label="Open attention items" sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', scrollbarGutter: 'stable' }}>
                        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', minWidth: COLUMNS.reduce((sum, column) => sum + (column.width ?? 360), 0) }}>
                          <Box component="caption" sx={visuallyHiddenSx}>Showing {visible.length} of {filtered.length} matching items</Box>
                          <colgroup>{COLUMNS.map((column) => <col key={column.label} style={{ width: column.width }} />)}</colgroup>
                          <TableHead><TableRow>
                            {COLUMNS.map((column) => (
                              <TableCell key={column.label} scope="col" align={column.align} sx={{ bgcolor: 'background.paper', whiteSpace: 'nowrap', top: '-1px', zIndex: 3 }}>
                                {column.tip ? <AppTooltip title={column.tip} describeChild><span>{column.label}</span></AppTooltip> : column.label}
                              </TableCell>
                            ))}
                          </TableRow></TableHead>
                          <TableBody component={StableTableBody} sx={{ ...revealPreviewToggles('& > tr'), '& > tr[data-preview-id]': { cursor: 'pointer', scrollMarginTop: 40 } }}>
                            {visible.map((item) => (
                              <AttentionRow key={item.id} item={item} resolveSprint={resolveSprint}
                                coverage={representedIds ? representedIds.has(item.id) ? 'On board' : 'Not on current QA board' : 'Unknown'}
                                preview={rowPreview} selected={selection.selectedId === item.id} />
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                    {visible.length < filtered.length ? <Button sx={{ m: 2 }} onClick={() => setLimit((current) => current + 50)}>Show more ({filtered.length - visible.length} remaining)</Button> : null}
                    <Typography variant="body-sm" color="text.secondary" sx={{ p: 2 }}>
                      {attention.syncedAt !== null ? `Checked ${new Date(attention.syncedAt).toLocaleTimeString()}. ` : ''}
                      Attention is a signal for discussion, not a confirmed blocker.
                    </Typography>
                  </Box>
                  {selection.selectedId !== null && previewSource ? (
                    <WorkItemPreviewPanel
                      panelId={panelId} panelRef={selection.panelRef} width={width} onResize={resize} onClose={selection.close}
                      id={selection.selectedId} item={previewItem} editItem={selected}
                      facts={selected ? <><span>{selected.state}</span><span>{selected.assignedTo?.displayName ?? 'Unassigned'}</span><AttentionTags tags={matchingAttentionTags(selected, tags)} /></> : undefined}
                    >
                      {previewItem ? <WorkItemPreviewDetails item={previewItem} editItem={selected} load={load} images={previewSource.images} />
                        : <Typography sx={{ mt: 2 }}>This item no longer qualifies for attention.</Typography>}
                    </WorkItemPreviewPanel>
                  ) : null}
                </Box>
              </>
            )}
    </Box>
  )
}
