import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Box, Button, Chip, Divider, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgFlag from '@stratakit/icons/flag.svg'
import svgUserAdd from '@stratakit/icons/user-add.svg'
import svgUsers from '@stratakit/icons/users.svg'
import type { TeamIterationOption, TeamMember, WorkItemSummary, WorkItemUpdate } from '../../../ado/queryEngine'
import { StandupPresenterBar } from './StandupPresenterBar'
import { AppTooltip } from './AppTooltip'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import { DEFAULT_CARD_HIGHLIGHT_OPTIONS } from '../utils/cardHighlightOptions'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import { BOARD_COLUMN_DIVIDER, BOARD_HEADER_HEIGHT } from '../utils/boardLayout'
import { formatSprintDate, getSprintProgress } from '../utils/sprintDates'
import type { AttentionTone } from './boardAttention'
import type { BoardRowData } from './KanbanBoardGrid'
import { resolveStandupSpeakers, type StandupOrderMode } from './standupOrder'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { QaCard } from './QaCard'
import { QaColumnHeader } from './QaColumnHeader'
import { QaTesterLanes } from './QaTesterLanes'
import {
  COLUMN_META,
  getColumnItems,
  getItemHistory,
  getQaAttentionScore,
  getQaBoardLayout,
  getQaColumnStates,
  getQaLaneKey,
  getQaStandupOrder,
  getSignalSet,
  matchesTester,
  normalizeState,
  QA_ATTENTION_FACETS,
  QA_EVERYONE_ELSE_LANE,
  QA_NEEDS_TESTER_LANE,
  type ItemHistory,
  type QaColumnId,
  type QaColumnState,
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
const NO_HISTORY: ItemHistory = { bounceCount: 0 }


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

function FlowColumn({ column, index, items, matchCount, onToggle, compact, testers, renderCard }: {
  column: QaColumnState
  index: number
  items: WorkItemSummary[]
  matchCount: number | null
  onToggle: () => void
  compact: boolean
  testers: TeamMember[]
  renderCard: (item: WorkItemSummary, column: QaColumnId, compact: boolean) => ReactNode
}) {
  const { id, rail, collapsible } = column
  const readyUnassigned = id === 'needs-testing'
    ? items.filter((item) => !matchesTester(item.assignedTo, testers))
    : []
  const readyAssigned = id === 'needs-testing'
    ? items.filter((item) => matchesTester(item.assignedTo, testers))
    : []
  const renderColumnCard = (item: WorkItemSummary) => <Fragment key={item.id}>{renderCard(item, id, compact)}</Fragment>

  return (
    <Box
      component="section"
      aria-labelledby={`qa-column-${id}`}
      data-qa-column={id}
      sx={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: index > 0 ? BOARD_COLUMN_DIVIDER : undefined,
      }}
    >
      <QaColumnHeader
        id={id}
        count={items.length}
        matchCount={matchCount}
        rail={rail}
        onToggle={rail || collapsible ? onToggle : undefined}
        divider={index > 0}
        sx={{ position: 'sticky', top: 0, zIndex: 3, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}
      />
      {rail ? (
        <Box
          data-qa-column-body=""
          // The header's Expand button is the keyboard path; a click anywhere on the rail is a mouse shortcut.
          onClick={onToggle}
          sx={{
            flex: '1 1 auto',
            display: 'flex',
            justifyContent: 'center',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              position: 'sticky',
              top: BOARD_HEADER_HEIGHT + 12,
              alignSelf: 'flex-start',
              mt: 1.5,
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: TERTIARY_TEXT_COLOR,
              whiteSpace: 'nowrap',
            }}
          >
            {COLUMN_META[id].title} · {items.length > 0 ? items.length : 'none'}
          </Box>
        </Box>
      ) : (
        <Box data-qa-column-body="" sx={{ flex: '1 1 auto', display: 'grid', alignContent: 'start', gap: 1, p: compact ? 0.75 : 1 }}>
          {items.length === 0 ? (
            <Typography variant="body-sm" color="text.secondary">No items in this column.</Typography>
          ) : id === 'needs-testing' ? (
            <>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Needs a tester · {readyUnassigned.length}</Typography>
              {readyUnassigned.map(renderColumnCard)}
              <Divider />
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>Testing · {readyAssigned.length}</Typography>
              {readyAssigned.map(renderColumnCard)}
            </>
          ) : items.map(renderColumnCard)}
        </Box>
      )}
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
  const [columnOpen, setColumnOpen] = useState<Partial<Record<QaColumnId, boolean>>>({})
  const [collapseOverrides, setCollapseOverrides] = useState<Record<string, boolean>>({})
  const [standupOrderMode, setStandupOrderMode] = useState<StandupOrderMode>('alphabetical')
  const [standupOrderKeys, setStandupOrderKeys] = useState<readonly string[] | null>(null)
  const [standupIndex, setStandupIndex] = useState(0)
  const [spokenKeys, setSpokenKeys] = useState<ReadonlySet<string>>(() => new Set())
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
    const now = Date.now()
    const values = new Map<number, Set<QaFacet>>()
    for (const bucket of buckets) {
      for (const item of bucket.items) {
        values.set(item.id, getSignalSet(
          item,
          bucket.id,
          historyById.get(item.id) ?? NO_HISTORY,
          testers,
          teamIterations,
          cardHighlightOptions.freshDays,
          now,
        ))
      }
    }
    for (const item of comingItems) values.set(item.id, new Set())
    return values
  }, [buckets, cardHighlightOptions.freshDays, comingItems, testers, historyById, teamIterations])
  const facetCounts = useMemo(() => {
    const counts = Object.fromEntries(QA_ATTENTION_FACETS.map((facet) => [facet.key, 0])) as Record<QaFacet, number>
    for (const values of signalsById.values()) for (const key of values) counts[key]++
    return counts
  }, [signalsById])
  const highlightedIds = useMemo<ReadonlySet<number> | null>(
    () => selectedFacet
      ? new Set([...signalsById].filter(([, signals]) => signals.has(selectedFacet)).map(([id]) => id))
      : null,
    [selectedFacet, signalsById],
  )

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
  const columns = getQaColumnStates(
    columnIds,
    Object.fromEntries(columnIds.map((id) => [id, (itemsByColumn[id] ?? []).length])),
    columnOpen,
  )
  const flowLayout = getQaBoardLayout(columns)
  const toggleColumn = ({ id, rail }: QaColumnState) => setColumnOpen((current) => ({ ...current, [id]: rail }))
  const columnMatchCount = (id: QaColumnId) => highlightedIds
    ? (itemsByColumn[id] ?? []).filter((item) => highlightedIds.has(item.id)).length
    : null
  const visibleCount = highlightedIds
    ? allColumnItems.filter((item) => highlightedIds.has(item.id)).length
    : allColumnItems.length

  const testerRows = useMemo<BoardRowData[]>(() => [...testers]
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
    .map((member) => ({
      key: member.displayName,
      label: member.displayName,
      avatarUrl: member.imageUrl,
      avatarDescriptor: member.descriptor,
      memberIdentity: { displayName: member.displayName, uniqueName: member.uniqueName, imageUrl: member.imageUrl },
    })), [testers])
  const itemsByCell = useMemo(() => {
    const cells = new Map<string, WorkItemSummary[]>()
    for (const id of columnIds) {
      for (const item of itemsByColumn[id] ?? []) {
        const cellKey = `${getQaLaneKey(item, id, historyById.get(item.id) ?? NO_HISTORY, testers)}:${id}`
        const cell = cells.get(cellKey)
        if (cell) cell.push(item)
        else cells.set(cellKey, [item])
      }
    }
    return cells
  }, [columnIds, historyById, itemsByColumn, testers])
  const laneRows = useMemo<BoardRowData[]>(() => {
    const hasCards = (laneKey: string) => columnIds.some((id) => itemsByCell.has(`${laneKey}:${id}`))
    return [
      ...testerRows,
      ...(hasCards(QA_NEEDS_TESTER_LANE)
        ? [{ key: QA_NEEDS_TESTER_LANE, label: 'Needs a tester', isUnassigned: true, iconHref: svgUserAdd }]
        : []),
      // Other people's QA activity is context, so it starts collapsed behind the testers' lanes.
      ...(hasCards(QA_EVERYONE_ELSE_LANE)
        ? [{ key: QA_EVERYONE_ELSE_LANE, label: 'Everyone else', iconHref: svgUsers, defaultCollapsed: testerRows.length > 0 }]
        : []),
    ]
  }, [columnIds, itemsByCell, testerRows])

  const collapsedRowKeys = useMemo<ReadonlySet<string>>(
    () => new Set(laneRows.filter((row) => collapseOverrides[row.key] ?? row.defaultCollapsed ?? false).map((row) => row.key)),
    [collapseOverrides, laneRows],
  )
  const toggleRowCollapsed = (rowKey: string) => {
    setCollapseOverrides((current) => ({ ...current, [rowKey]: !collapsedRowKeys.has(rowKey) }))
  }
  const setAllRowsCollapsed = (collapsed: boolean) => {
    setCollapseOverrides(Object.fromEntries(laneRows.map((row) => [row.key, collapsed])))
  }

  const standupScores = useMemo(() => new Map(testerRows.map((row) => [
    row.key,
    getQaAttentionScore(columnIds.flatMap((id) => itemsByCell.get(`${row.key}:${id}`) ?? []), signalsById),
  ])), [columnIds, itemsByCell, signalsById, testerRows])
  const hasStandupSpeakers = testerRows.length > 0
  // The order is fixed when standup starts, so refreshed data can't reshuffle testers mid-meeting.
  if (standupActive && standupOrderKeys === null && hasStandupSpeakers) {
    setStandupOrderKeys(getQaStandupOrder(testerRows, standupOrderMode, standupScores))
    setStandupIndex(0)
    setSpokenKeys(new Set())
  } else if (!standupActive && standupOrderKeys !== null) {
    setStandupOrderKeys(null)
  }

  const standupSpeakers = useMemo(
    () => (standupActive ? resolveStandupSpeakers(standupOrderKeys ?? [], testerRows) : []),
    [standupActive, standupOrderKeys, testerRows],
  )
  const speakerIndex = Math.min(standupIndex, Math.max(standupSpeakers.length - 1, 0))
  const presentingRowKey = standupSpeakers[speakerIndex]?.key ?? null

  const goToSpeaker = (index: number) => {
    if (index === speakerIndex) {
      return
    }

    const leaving = standupSpeakers[speakerIndex]
    if (leaving) {
      setSpokenKeys((current) => new Set(current).add(leaving.key))
    }

    if (index >= standupSpeakers.length) {
      onStandupEnd()
      return
    }

    setStandupIndex(Math.max(0, index))
  }

  const changeStandupOrder = (mode: StandupOrderMode) => {
    setStandupOrderMode(mode)
    setStandupOrderKeys(hasStandupSpeakers ? getQaStandupOrder(testerRows, mode, standupScores) : null)
    setStandupIndex(0)
    setSpokenKeys(new Set())
  }

  const renderCard = (item: WorkItemSummary, column: QaColumnId, compact: boolean) => (
    <Box data-qa-card={item.id}>
      <QaCard
        item={item}
        column={column}
        history={historyById.get(item.id) ?? NO_HISTORY}
        compact={compact}
        currentIterationName={currentIterationName}
        highlightOptions={cardHighlightOptions}
        emphasis={highlightedIds ? highlightedIds.has(item.id) ? 'match' : 'dim' : undefined}
        testers={testers}
      />
    </Box>
  )

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
      {standupActive ? (
        <StandupPresenterBar
          speakers={standupSpeakers}
          currentIndex={speakerIndex}
          spokenKeys={spokenKeys}
          orderMode={standupOrderMode}
          onOrderModeChange={changeStandupOrder}
          onGoTo={goToSpeaker}
          onEnd={onStandupEnd}
        />
      ) : null}
      <QaSprintRibbon buckets={buckets} coming={comingItems} lookbackDays={lookbackDays} iterations={teamIterations} currentIterationName={currentIterationName} />
      <QaAttentionBar counts={facetCounts} selected={selectedFacet} onSelect={setSelectedFacet} />
      {selectedFacet ? (
        <Typography variant="body-sm" role="status" sx={{ px: 2, py: 0.5, color: 'text.secondary' }}>
          {visibleCount} of {allColumnItems.length} items highlighted · {QA_ATTENTION_FACETS.find((facet) => facet.key === selectedFacet)?.label}
        </Typography>
      ) : null}
      {view === 'flow' ? (
        <Box data-qa-scroll-container="" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: flowLayout.gridTemplate,
            minHeight: '100%',
            minWidth: flowLayout.minWidth,
          }}>
            {columns.map((column, index) => (
              <FlowColumn
                key={column.id}
                column={column}
                index={index}
                items={itemsByColumn[column.id] ?? []}
                matchCount={columnMatchCount(column.id)}
                onToggle={() => toggleColumn(column)}
                compact={compactCards}
                testers={testers}
                renderCard={renderCard}
              />
            ))}
          </Box>
        </Box>
      ) : (
        <>
          {testers.length === 0 ? (
            <Box
              sx={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
                px: 2,
                py: 0.75,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
              }}
            >
              <Typography variant="body-sm" color="text.secondary">
                {testersInferred ? 'No QA testers found in recent QA activity.' : 'None of the chosen QA testers are on this team.'}
              </Typography>
              {onChooseTesters ? <Button size="small" onClick={onChooseTesters}>Choose testers</Button> : null}
            </Box>
          ) : null}
          <QaTesterLanes
            columns={columns}
            rows={laneRows}
            itemsByCell={itemsByCell}
            highlightedIds={highlightedIds}
            signalsById={signalsById}
            compactCards={compactCards}
            testerCount={testers.length}
            onChooseInferredTesters={testersInferred && testers.length > 0 ? onChooseTesters : undefined}
            collapsedRowKeys={collapsedRowKeys}
            // Standup decides which lane is open, so manual collapsing pauses until it ends.
            onToggleRowCollapsed={presentingRowKey ? undefined : toggleRowCollapsed}
            onSetAllRowsCollapsed={presentingRowKey ? undefined : setAllRowsCollapsed}
            onToggleColumn={toggleColumn}
            presentingRowKey={presentingRowKey}
            renderCard={renderCard}
          />
        </>
      )}
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
