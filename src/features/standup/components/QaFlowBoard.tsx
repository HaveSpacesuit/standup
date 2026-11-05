import { useEffect, useMemo, useState } from 'react'
import { Box, Button, ButtonBase, Chip, Divider, IconButton, Typography, useTheme } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgFlag from '@stratakit/icons/flag.svg'
import svgInfo from '@stratakit/icons/info.svg'
import svgUserAdd from '@stratakit/icons/user-add.svg'
import type { TeamIterationOption, TeamMember, WorkItemSummary, WorkItemUpdate } from '../../../ado/queryEngine'
import { StandupPresenterBar } from './StandupPresenterBar'
import { AppTooltip } from './AppTooltip'
import { AdoAvatar } from './AdoAvatar'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import { DEFAULT_CARD_HIGHLIGHT_OPTIONS } from '../utils/cardHighlightOptions'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import { formatSprintDate, getSprintProgress } from '../utils/sprintDates'
import { getStatusColumnColor } from '../utils/statusColumnStyles'
import type { AttentionTone } from './boardAttention'
import type { BoardRowData } from './KanbanBoardGrid'
import type { StandupOrderMode } from './standupOrder'
import { QaCard } from './QaCard'
import {
  COLUMN_META,
  getColumnItems,
  getItemForLane,
  getItemHistory,
  getSignalSet,
  matchesTester,
  normalizeState,
  QA_ATTENTION_FACETS,
  type ItemHistory,
  type QaColumnId,
  type QaFacet,
  type QaView,
} from './qaBoardModel'

type QaFlowBoardProps = {
  buckets: QualityAssuranceBucket[]
  updatesByItemId: Record<number, WorkItemUpdate[]>
  boardItems: WorkItemSummary[]
  currentIterationName: string | null
  teamIterations: TeamIterationOption[]
  /** The team's QA testers, whose lanes make up the Testers view and the QA standup. */
  testers: TeamMember[]
  /** No testers are chosen in QA options, so these were inferred from QA activity. */
  testersInferred: boolean
  /** Opens QA options on its Testers tab. */
  onChooseTesters?: () => void
  lookbackDays: number
  compactCards: boolean
  cardHighlightOptions: CardHighlightOptions
  view: QaView
  standupActive: boolean
  onStandupEnd: () => void
}

const EMPTY_BUCKETS: QualityAssuranceBucket[] = []
const EMPTY_ITEMS: WorkItemSummary[] = []
const EMPTY_UPDATES: Record<number, WorkItemUpdate[]> = {}
const EMPTY_TESTERS: TeamMember[] = []
const EMPTY_TEAM_ITERATIONS: TeamIterationOption[] = []


function getPaletteKey(tone: AttentionTone): string {
  switch (tone) {
    case 'critical': return 'var(--stratakit-color-bg-critical-base)'
    case 'attention': return 'var(--stratakit-color-bg-attention-base)'
    case 'positive': return 'var(--stratakit-color-bg-positive-base)'
    case 'info': return 'var(--stratakit-color-bg-info-base)'
  }
}

function QaSprintRibbon({ buckets, coming, lookbackDays, iterations, currentIterationName }: {
  buckets: QualityAssuranceBucket[]
  coming: WorkItemSummary[]
  lookbackDays: number
  iterations: TeamIterationOption[]
  currentIterationName: string | null
}) {
  const current = iterations.find((iteration) => iteration.timeFrame === 'current' || iteration.name === currentIterationName)
  const next = iterations.find((iteration) => iteration.timeFrame === 'future' && iteration.path !== current?.path)
  const progress = getSprintProgress(current?.startDate, current?.finishDate)
  const counts = [
    { title: 'New', count: buckets.find((bucket) => bucket.id === 'new')?.items.length ?? 0, color: 'var(--stratakit-color-bg-info-base)' },
    { title: 'Coming', count: coming.length, color: 'var(--stratakit-color-bg-mono-base)' },
    { title: 'Ready', count: buckets.find((bucket) => bucket.id === 'needs-testing')?.items.length ?? 0, color: 'var(--stratakit-color-bg-attention-base)' },
    { title: 'Back', count: buckets.find((bucket) => bucket.id === 'needs-development')?.items.length ?? 0, color: 'var(--stratakit-color-bg-accent-base)' },
    { title: 'Done', count: buckets.find((bucket) => bucket.id === 'done')?.items.length ?? 0, color: 'var(--stratakit-color-bg-positive-base)' },
  ]
  const total = counts.reduce((sum, entry) => sum + entry.count, 0)

  return (
    <Box
      component="section"
      aria-label="Sprint and QA flow"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 1.5,
        px: 2,
        py: 0.75,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="body-sm" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
        {currentIterationName ?? 'Current sprint'}
      </Typography>
      {progress.status === 'active' ? (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <Typography variant="body-sm">Day {progress.day} of {progress.totalDays}</Typography>
          <Box sx={{ width: 72, height: 6, borderRadius: 999, overflow: 'hidden', bgcolor: 'action.hover' }}>
            <Box sx={{ width: `${Math.round(progress.day / progress.totalDays * 100)}%`, height: '100%', bgcolor: 'var(--stratakit-color-bg-mono-base)' }} />
          </Box>
          <Typography variant="body-sm" color="text.secondary">{progress.daysLeft} days left</Typography>
        </Box>
      ) : null}
      <Divider orientation="vertical" flexItem />
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 140, flex: '1 1 200px' }}>
        <Typography variant="body-sm" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>QA flow</Typography>
        <Box
          role="img"
          aria-label={counts.map(({ title, count }) => `${count} ${title.toLowerCase()}`).join(', ')}
          sx={{ display: 'flex', flex: 1, minWidth: 52, height: 7, overflow: 'hidden', borderRadius: 999, bgcolor: 'action.hover' }}
        >
          {counts.map(({ title, count, color }) => count > 0 ? (
            <Box key={title} sx={{ flex: `${count} 0 0px`, bgcolor: color }} />
          ) : null)}
        </Box>
        <Typography variant="body-sm" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{total} items</Typography>
      </Box>
      <Chip size="small" variant="outlined" label={`Last ${lookbackDays} days`} />
      {next ? (
        <Typography variant="body-sm" color="text.secondary" sx={{ ml: 'auto', whiteSpace: 'nowrap' }}>
          Next: {next.name}
        </Typography>
      ) : null}
    </Box>
  )
}

function identityName(member: TeamMember): string {
  return member.displayName
}

function QaAttentionBar({ counts, selected, onSelect }: {
  counts: Record<QaFacet, number>
  selected: QaFacet | null
  onSelect: (key: QaFacet | null) => void
}) {
  return (
    <Box
      role="group"
      aria-label="Needs attention"
      sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, px: 2, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
    >
      <Typography variant="body-sm" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 700, mr: 0.25 }}>
        <Icon href={svgFlag} style={{ color: 'var(--stratakit-color-icon-neutral-secondary)' }} />
        Needs attention
      </Typography>
      {QA_ATTENTION_FACETS.map((facet) => {
        const pressed = selected === facet.key
        const count = counts[facet.key]
        return (
          <AppTooltip key={facet.key} title={facet.description}>
            <span>
              <Chip
                size="small"
                variant="outlined"
                disabled={count === 0 && !pressed}
                label={`${facet.label} ${count}`}
                onClick={() => onSelect(pressed ? null : facet.key)}
                aria-pressed={pressed}
                style={pressed ? {
                  backgroundColor: 'var(--stratakit-color-bg-accent-muted)',
                  borderColor: 'var(--stratakit-color-border-accent-strong)',
                  color: 'var(--stratakit-color-text-accent-strong)',
                } : undefined}
                icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getPaletteKey(facet.tone) }} />}
              />
            </span>
          </AppTooltip>
        )
      })}
      {selected ? <Button size="small" onClick={() => onSelect(null)}>Clear</Button> : null}
    </Box>
  )
}

function FlowColumn({ id, items, historyById, currentIterationName, compact, highlightOptions, testers, selectedFacet, signalsById, comingOpen, onComingToggle, emptyOpen, onEmptyToggle }: {
  id: QaColumnId
  items: WorkItemSummary[]
  historyById: Map<number, ItemHistory>
  currentIterationName: string | null
  compact: boolean
  highlightOptions: CardHighlightOptions
  testers: TeamMember[]
  selectedFacet: QaFacet | null
  signalsById: Map<number, Set<QaFacet>>
  comingOpen: boolean
  onComingToggle: () => void
  emptyOpen: boolean
  onEmptyToggle: () => void
}) {
  const theme = useTheme()
  const meta = COLUMN_META[id]
  const color = getStatusColumnColor(meta.status, theme.palette)
  const isCollapsed = id === 'coming' && !comingOpen
  const rail = items.length === 0 && !emptyOpen
  const readyUnassigned = id === 'needs-testing'
    ? items.filter((item) => !matchesTester(item.assignedTo, testers))
    : []
  const readyAssigned = id === 'needs-testing'
    ? items.filter((item) => matchesTester(item.assignedTo, testers))
    : []

  const renderCard = (item: WorkItemSummary) => {
    const signals = signalsById.get(item.id) ?? new Set<QaFacet>()
    const emphasis = selectedFacet ? signals.has(selectedFacet) ? 'match' : 'dim' : undefined
    return (
      <Box key={item.id} data-qa-card={item.id}>
        <QaCard
          item={item}
          column={id}
          history={historyById.get(item.id) ?? { bounceCount: 0 }}
          compact={compact}
          currentIterationName={currentIterationName}
          highlightOptions={highlightOptions}
          emphasis={emphasis}
          testers={testers}
        />
      </Box>
    )
  }

  return (
    <Box
      component="section"
      aria-labelledby={`qa-column-${id}`}
      data-qa-column={id}
      sx={{
        minWidth: rail || isCollapsed ? 44 : 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.default',
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          minHeight: 52,
          px: rail || isCollapsed ? 0.5 : 1.25,
          py: 0.75,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {rail ? (
          <ButtonBase
            aria-label={`Expand empty ${meta.title} column`}
            onClick={onEmptyToggle}
            sx={{ width: '100%', minHeight: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.5, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            <Box sx={{ width: 22, height: 4, borderRadius: 999, bgcolor: color }} />
            <Typography component="h2" id={`qa-column-${id}`} variant="body-sm">{meta.title} · 0</Typography>
          </ButtonBase>
        ) : isCollapsed ? (
          <ButtonBase
            aria-label="Expand Coming up"
            onClick={onComingToggle}
            sx={{ width: '100%', minHeight: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            <Box sx={{ width: 22, height: 4, borderRadius: 999, bgcolor: color }} />
            <Typography component="h2" id={`qa-column-${id}`} variant="body-sm">{meta.title} · {items.length}</Typography>
          </ButtonBase>
        ) : (
          <>
            <Box sx={{ width: 4, height: 22, borderRadius: 999, flex: '0 0 auto', bgcolor: color }} />
            <Typography component="h2" id={`qa-column-${id}`} variant="body-sm" sx={{ minWidth: 0, flex: 1, fontWeight: 700 }}>{meta.title}</Typography>
            <Typography variant="body-sm" sx={{ fontWeight: 700, color }}>{items.length}</Typography>
            {id === 'coming' ? <Button size="small" onClick={onComingToggle}>Collapse</Button>
              : emptyOpen ? <Button size="small" onClick={onEmptyToggle}>Collapse</Button> : null}
          </>
        )}
      </Box>
      {!rail && !isCollapsed ? (
        <Box sx={{ display: 'grid', alignContent: 'start', gap: 1, p: compact ? 0.75 : 1, minHeight: 0 }}>
          {items.length === 0 ? (
            <Typography variant="body-sm" color="text.secondary">No items in this column.</Typography>
          ) : id === 'needs-testing' ? (
            <>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Needs a tester · {readyUnassigned.length}</Typography>
              {readyUnassigned.map(renderCard)}
              <Divider />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Testing · {readyAssigned.length}</Typography>
              {readyAssigned.map(renderCard)}
            </>
          ) : items.map(renderCard)}
        </Box>
      ) : null}
    </Box>
  )
}

function LaneRow({ member, laneKey, itemsByLane, columnIds, historyById, currentIterationName, compact, highlightOptions, testers, selectedFacet, signalsById, maxLoad, collapsed, onToggle, isSpeaking }: {
  member?: TeamMember
  laneKey: string
  itemsByLane: Map<string, Partial<Record<QaColumnId, WorkItemSummary[]>>>
  columnIds: QaColumnId[]
  historyById: Map<number, ItemHistory>
  currentIterationName: string | null
  compact: boolean
  highlightOptions: CardHighlightOptions
  testers: TeamMember[]
  selectedFacet: QaFacet | null
  signalsById: Map<number, Set<QaFacet>>
  maxLoad: number
  collapsed: boolean
  onToggle: () => void
  isSpeaking: boolean
}) {
  const items = itemsByLane.get(laneKey) ?? {}
  const count = columnIds.reduce((sum, id) => sum + (items[id]?.length ?? 0), 0)
  const title = laneKey === 'none' ? 'Needs a tester' : laneKey === 'other' ? 'Everyone else' : member?.displayName ?? laneKey
  const color = isSpeaking ? 'var(--stratakit-color-border-accent-base)' : 'divider'
  const flaggedCount = columnIds.reduce((sum, id) => sum + (items[id] ?? []).filter((item) => (signalsById.get(item.id)?.size ?? 0) > 0).length, 0)

  return (
    <Box
      component="section"
      aria-label={`${title}, ${count} items`}
      sx={{ display: 'grid', gridTemplateColumns: `minmax(150px, 0.7fr) repeat(${columnIds.length}, minmax(210px, 1fr))`, minWidth: 1200, borderBottom: '1px solid', borderColor: color, bgcolor: isSpeaking ? 'action.hover' : 'background.default' }}
    >
      <ButtonBase
        onClick={onToggle}
        aria-expanded={!collapsed}
        sx={{ alignSelf: 'start', position: 'sticky', left: 0, zIndex: 1, minHeight: 52, px: 1, justifyContent: 'flex-start', bgcolor: 'background.paper', borderRight: '1px solid', borderColor: 'divider' }}
      >
        {member ? (
          <AdoAvatar
            alt={member.displayName}
            descriptor={member.descriptor}
            src={member.imageUrl}
            sx={{ width: 24, height: 24, mr: 0.75, fontSize: 10 }}
          />
        ) : null}
        <Typography variant="body-sm" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</Typography>
        <Typography variant="body-sm" color="text.secondary" sx={{ ml: 0.75 }}>{count}</Typography>
        <Box sx={{ display: 'grid', gap: 0.375, ml: 0.75, width: 44, flex: '0 0 auto' }}>
          <Box aria-hidden="true" sx={{ height: 4, borderRadius: 999, bgcolor: 'action.hover', overflow: 'hidden' }}>
            <Box sx={{ width: `${Math.min(100, count / Math.max(maxLoad, 1) * 100)}%`, height: '100%', bgcolor: 'var(--stratakit-color-bg-accent-base)' }} />
          </Box>
          {flaggedCount > 0 ? <Typography variant="caption" sx={{ color: 'var(--stratakit-color-text-attention-base)', lineHeight: 1 }}>{flaggedCount} flags</Typography> : null}
        </Box>
      </ButtonBase>
      {!collapsed ? columnIds.map((id) => (
        <Box key={id} sx={{ display: 'grid', alignContent: 'start', gap: 0.75, p: 0.75, borderRight: '1px solid', borderColor: 'divider' }}>
          {(items[id] ?? []).map((item) => {
            const signals = signalsById.get(item.id) ?? new Set<QaFacet>()
            const emphasis = selectedFacet ? signals.has(selectedFacet) ? 'match' : 'dim' : undefined
            return (
              <QaCard
                key={`${id}-${item.id}`}
                item={item}
                column={id}
                history={historyById.get(item.id) ?? { bounceCount: 0 }}
                compact={compact}
                currentIterationName={currentIterationName}
                highlightOptions={highlightOptions}
                emphasis={emphasis}
                testers={testers}
              />
            )
          })}
        </Box>
      )) : null}
    </Box>
  )
}

export function QaFlowBoard({
  buckets = EMPTY_BUCKETS,
  updatesByItemId = EMPTY_UPDATES,
  boardItems = EMPTY_ITEMS,
  currentIterationName,
  teamIterations = EMPTY_TEAM_ITERATIONS,
  testers = EMPTY_TESTERS,
  testersInferred = false,
  onChooseTesters,
  lookbackDays = 21,
  compactCards = false,
  cardHighlightOptions = DEFAULT_CARD_HIGHLIGHT_OPTIONS,
  view = 'flow',
  standupActive = false,
  onStandupEnd,
}: QaFlowBoardProps) {
  const [selectedFacet, setSelectedFacet] = useState<QaFacet | null>(null)
  const [comingOpen, setComingOpen] = useState(true)
  const [expandedEmpty, setExpandedEmpty] = useState<Partial<Record<QaColumnId, boolean>>>({})
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(() => new Set(['other']))
  const [standupIndex, setStandupIndex] = useState(0)
  const [standupOrderMode, setStandupOrderMode] = useState<StandupOrderMode>('alphabetical')
  const now = Date.now()
  useEffect(() => {
    if (standupActive) setStandupIndex(0)
  }, [standupActive])
  const currentIteration = teamIterations.find((iteration) => iteration.timeFrame === 'current' || iteration.name === currentIterationName)
  const allItems = useMemo(() => buckets.flatMap((bucket) => bucket.items), [buckets])
  const qaItemIds = useMemo(() => new Set(allItems.map((item) => item.id)), [allItems])
  const comingItems = useMemo(
    () => boardItems.filter((item) => !qaItemIds.has(item.id)
      && item.sprintName === currentIterationName
      && normalizeState(item.state) === 'in code review'),
    [boardItems, currentIterationName, qaItemIds],
  )
  const historyById = useMemo(() => new Map(
    allItems.map((item) => [item.id, getItemHistory(item, updatesByItemId[item.id] ?? [])]),
  ), [allItems, updatesByItemId])
  const signalsById = useMemo(() => {
    const values = new Map<number, Set<QaFacet>>()
    for (const bucket of buckets) {
      for (const item of bucket.items) {
        values.set(item.id, getSignalSet(
          item,
          bucket.id,
          historyById.get(item.id) ?? { bounceCount: 0 },
          testers,
          teamIterations,
          cardHighlightOptions.freshDays,
          now,
        ))
      }
    }
    for (const item of comingItems) values.set(item.id, new Set())
    return values
  }, [buckets, cardHighlightOptions.freshDays, comingItems, testers, historyById, now, teamIterations])
  const facetCounts = useMemo(() => {
    const counts = Object.fromEntries(QA_ATTENTION_FACETS.map((facet) => [facet.key, 0])) as Record<QaFacet, number>
    for (const values of signalsById.values()) for (const key of values) counts[key]++
    return counts
  }, [signalsById])

  const columnIds = useMemo<QaColumnId[]>(() => {
    const ids: QaColumnId[] = ['new', 'coming', 'needs-testing', 'needs-development', 'done']
    if (buckets.some((bucket) => bucket.id === 'history-unavailable')) ids.push('history-unavailable')
    return ids
  }, [buckets])
  const itemsByColumn = useMemo<Partial<Record<QaColumnId, WorkItemSummary[]>>>(() => ({
    new: getColumnItems(buckets, 'new'),
    coming: comingItems,
    'needs-testing': getColumnItems(buckets, 'needs-testing'),
    'needs-development': getColumnItems(buckets, 'needs-development'),
    done: getColumnItems(buckets, 'done'),
    'history-unavailable': getColumnItems(buckets, 'history-unavailable'),
  }), [buckets, comingItems])
  const allColumnItems = columnIds.flatMap((id) => itemsByColumn[id] ?? [])
  const flowGridTemplate = columnIds.map((id) => {
    const collapsed = ((itemsByColumn[id] ?? []).length === 0 && expandedEmpty[id] !== true)
      || (id === 'coming' && !comingOpen)
    if (collapsed) return '44px'
    if (id === 'needs-testing') return 'minmax(320px, 1.45fr)'
    if (id === 'done') return 'minmax(200px, 0.9fr)'
    return 'minmax(220px, 1fr)'
  }).join(' ')
  const visibleCount = selectedFacet
    ? allColumnItems.filter((item) => signalsById.get(item.id)?.has(selectedFacet)).length
    : allColumnItems.length

  const laneKeys = useMemo(
    () => ['none', ...testers.map(identityName), 'other'],
    [testers],
  )
  const itemsByLane = useMemo(() => {
    const lanes = new Map<string, Partial<Record<QaColumnId, WorkItemSummary[]>>>()
    for (const key of laneKeys) lanes.set(key, {})
    for (const id of columnIds) {
      for (const item of itemsByColumn[id] ?? []) {
        const ownerKey = getItemForLane(item, id, historyById.get(item.id) ?? { bounceCount: 0 }, testers)
        const lane = lanes.get(ownerKey) ?? lanes.get('other')!
        lane[id] ??= []
        lane[id]!.push(item)
      }
    }
    return lanes
  }, [columnIds, testers, historyById, itemsByColumn, laneKeys])

  const speakerRows = useMemo<BoardRowData[]>(() => [
    { key: 'none', label: 'Needs a tester', isUnassigned: true, iconHref: svgUserAdd },
    ...testers.map((member) => ({
      key: member.displayName,
      label: member.displayName,
      avatarUrl: member.imageUrl,
      avatarDescriptor: member.descriptor,
      memberIdentity: { displayName: member.displayName, uniqueName: member.uniqueName, imageUrl: member.imageUrl },
    })),
  ], [testers])
  const orderedSpeakers = useMemo(() => {
    if (standupOrderMode === 'alphabetical') return speakerRows
    return [...speakerRows].sort((a, b) => {
      if (a.key === 'none') return -1
      if (b.key === 'none') return 1
      const aCount = itemsByLane.get(a.key) ? columnIds.reduce((sum, id) => sum + (itemsByLane.get(a.key)?.[id]?.length ?? 0), 0) : 0
      const bCount = itemsByLane.get(b.key) ? columnIds.reduce((sum, id) => sum + (itemsByLane.get(b.key)?.[id]?.length ?? 0), 0) : 0
      return bCount - aCount || a.label.localeCompare(b.label)
    })
  }, [columnIds, itemsByLane, speakerRows, standupOrderMode])
  const visibleSpeakers = orderedSpeakers.filter((speaker) => speaker.key === 'none' || speakerRows.some((row) => row.key === speaker.key))
  const maxLaneLoad = Math.max(...laneKeys.map((key) => columnIds.reduce((sum, id) => sum + (itemsByLane.get(key)?.[id]?.length ?? 0), 0)), 1)

  const handleStandupGoTo = (index: number) => {
    if (index >= visibleSpeakers.length) {
      onStandupEnd()
      return
    }
    setStandupIndex(Math.max(index, 0))
  }
  const activeSpeakerKey = visibleSpeakers[standupIndex]?.key

  return (
    <Box component="main" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
      <QaSprintRibbon buckets={buckets} coming={comingItems} lookbackDays={lookbackDays} iterations={teamIterations} currentIterationName={currentIterationName} />
      {standupActive ? (
        <StandupPresenterBar
          speakers={visibleSpeakers}
          currentIndex={standupIndex}
          spokenKeys={new Set(visibleSpeakers.slice(0, standupIndex).map((speaker) => speaker.key))}
          orderMode={standupOrderMode}
          onOrderModeChange={setStandupOrderMode}
          onGoTo={handleStandupGoTo}
          onEnd={onStandupEnd}
        />
      ) : null}
      <QaAttentionBar counts={facetCounts} selected={selectedFacet} onSelect={setSelectedFacet} />
      {selectedFacet ? (
        <Typography variant="body-sm" role="status" sx={{ px: 2, py: 0.5, color: 'text.secondary' }}>
          {visibleCount} of {allColumnItems.length} items highlighted · {QA_ATTENTION_FACETS.find((facet) => facet.key === selectedFacet)?.label}
        </Typography>
      ) : null}
      <Box data-qa-scroll-container="" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {view === 'flow' ? (
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: flowGridTemplate,
            alignItems: 'start',
            minHeight: '100%',
            minWidth: 'max-content',
          }}>
            {columnIds.map((id) => (
              <FlowColumn
                key={id}
                id={id}
                items={itemsByColumn[id] ?? []}
                historyById={historyById}
                currentIterationName={currentIterationName}
                compact={compactCards}
                highlightOptions={cardHighlightOptions}
                testers={testers}
                selectedFacet={selectedFacet}
                signalsById={signalsById}
                comingOpen={comingOpen}
                onComingToggle={() => setComingOpen((open) => !open)}
                emptyOpen={expandedEmpty[id] === true}
                onEmptyToggle={() => setExpandedEmpty((current) => ({ ...current, [id]: current[id] !== true }))}
              />
            ))}
          </Box>
        ) : (
          <Box sx={{ minWidth: 'max-content' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: `minmax(150px, 0.7fr) repeat(${columnIds.length}, minmax(210px, 1fr))`, minWidth: 1200, position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ p: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="body-sm" sx={{ fontWeight: 700 }}>Testers · {testers.length}</Typography>
                {testersInferred && testers.length > 0 && onChooseTesters ? (
                  <IconButton size="small" label="Testers are inferred from recent QA activity. Choose testers" onClick={onChooseTesters}>
                    <Icon href={svgInfo} />
                  </IconButton>
                ) : null}
              </Box>
              {columnIds.map((id) => (
                <Typography key={id} variant="body-sm" sx={{ p: 1, fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>
                  {COLUMN_META[id].title} · {(itemsByColumn[id] ?? []).length}
                </Typography>
              ))}
            </Box>
            {testers.length === 0 ? (
              <Box sx={{ position: 'sticky', left: 0, width: 'max-content', display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1 }}>
                <Typography variant="body-sm" color="text.secondary">
                  {testersInferred ? 'No QA testers found in recent QA activity.' : 'None of the chosen QA testers are on this team.'}
                </Typography>
                {onChooseTesters ? <Button size="small" onClick={onChooseTesters}>Choose testers</Button> : null}
              </Box>
            ) : null}
            {['none', ...testers.map(identityName), 'other'].map((key) => (
              <LaneRow
                key={key}
                laneKey={key}
                member={testers.find((member) => member.displayName === key)}
                itemsByLane={itemsByLane}
                columnIds={columnIds}
                historyById={historyById}
                currentIterationName={currentIterationName}
                compact={compactCards}
                highlightOptions={cardHighlightOptions}
                testers={testers}
                selectedFacet={selectedFacet}
                signalsById={signalsById}
                maxLoad={maxLaneLoad}
                collapsed={collapsedLanes.has(key)}
                onToggle={() => setCollapsedLanes((current) => {
                  const next = new Set(current)
                  if (next.has(key)) next.delete(key)
                  else next.add(key)
                  return next
                })}
                isSpeaking={standupActive && activeSpeakerKey === key}
              />
            ))}
          </Box>
        )}
      </Box>
      {!currentIteration && teamIterations.length === 0 ? (
        <Typography variant="body-sm" color="text.secondary" sx={{ px: 2, py: 1 }}>
          Sprint dates are unavailable for this team.
        </Typography>
      ) : null}
      {!standupActive && visibleCount === 0 ? (
        <Typography variant="body-sm" color="text.secondary" sx={{ px: 2, py: 1 }}>
          No QA items matched. The board keeps its flow columns visible so empty work queues stay apparent.
        </Typography>
      ) : null}
      {currentIteration && progressIsUpcoming(currentIteration) ? (
        <Typography variant="body-sm" color="text.secondary" sx={{ px: 2, py: 0.5 }}>
          {currentIteration.name} starts {formatSprintDate(new Date(`${currentIteration.startDate}T00:00:00`))}
        </Typography>
      ) : null}
    </Box>
  )
}

function progressIsUpcoming(iteration: Pick<TeamIterationOption, 'startDate'> | null): boolean {
  if (!iteration?.startDate) return false
  return new Date(`${iteration.startDate}T00:00:00`).getTime() > new Date(new Date().toDateString()).getTime()
}
