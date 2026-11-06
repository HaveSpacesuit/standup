import type { ReactNode } from 'react'
import { Box, ButtonBase, Link, Skeleton, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgActivity from '@stratakit/icons/activity.svg'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { CHART_TEXT_PRIMARY, CHART_TEXT_SECONDARY } from './testChartStyles'
import { testChangePresentation, TESTS_PANEL_STACK_QUERY } from './testHealthPresentation'
import {
  formatAxisDay, testAxisDate, testChangeDetail, testChangeTitle, testPipelineShortName,
  type TestChange, type TestHealthEntry, type TestTimeAxis,
} from '../utils/testHealth'
import { testStageLabel } from '../utils/testPipelines'
import type { TestSprintBand } from '../utils/testSprints'

/** Without sprints, the recent group covers the last two weeks. */
const RECENT_DAYS = 14
const SKELETON_ROWS = 4

type TestChangesPanelProps = {
  loading: boolean
  entries: TestHealthEntry[]
  changes: TestChange[]
  axis: TestTimeAxis | null
  sprints: TestSprintBand[]
  lookbackDays: number
  focusId: string | null
  onClearFocus: () => void
  selectedChangeId: string | null
  onSelectChange: (change: TestChange) => void
  /** Run details, shown above the list while a run is selected. */
  details?: ReactNode
}

/** What changed across the pipelines, this sprint first; selecting a change opens its run. */
export function TestChangesPanel({
  loading, entries, changes, axis, sprints, lookbackDays, focusId, onClearFocus, selectedChangeId, onSelectChange, details,
}: TestChangesPanelProps) {
  const byId = new Map(entries.map((entry) => [entry.pipeline.id, entry]))
  const focused = focusId ? byId.get(focusId) ?? null : null
  const visible = focused ? changes.filter((change) => change.pipelineId === focused.pipeline.id) : changes
  const current = sprints.find((sprint) => sprint.current) ?? null
  const since = current ? current.start : (axis?.todayIndex ?? 0) - (RECENT_DAYS - 1)
  const recent = visible.filter((change) => change.day >= since)
  const earlier = visible.filter((change) => change.day < since)
  const focusName = focused ? `${testPipelineShortName(focused.pipeline)} · ${testStageLabel(focused.pipeline.stageName)}` : null

  const renderList = (list: TestChange[], label: string) => (
    <Box component="ul" role="list" aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {list.map((change) => {
        const entry = byId.get(change.pipelineId)
        return entry && axis ? (
          <li key={change.id}>
            <ChangeItem change={change} entry={entry} axis={axis} selected={change.id === selectedChangeId} onClick={() => onSelectChange(change)} />
          </li>
        ) : null
      })}
    </Box>
  )

  return (
    <Box
      component="aside"
      aria-label="Changes"
      sx={{
        width: 320,
        flexShrink: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: 1,
        borderColor: 'divider',
        bgcolor: 'var(--stratakit-color-bg-page-base)',
        [TESTS_PANEL_STACK_QUERY]: { width: 'auto', borderLeft: 0, borderTop: 1, borderColor: 'divider' },
      }}
    >
      <Box sx={{ p: '12px 14px 10px', borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="body-md" render={<h2 />} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, m: 0, mb: 0.25, fontWeight: 700 }}>
          <Icon href={svgActivity} alt="" style={{ color: 'var(--stratakit-color-icon-neutral-secondary)' }} />
          Changes
          {!loading ? <Box component="span" sx={{ color: TERTIARY_TEXT_COLOR, fontWeight: 400 }}>{visible.length}</Box> : null}
        </Typography>
        <Typography variant="body-sm" color="text.secondary">
          {focusName ? (
            <>
              Showing {focusName} only.{' '}
              <Link component="button" type="button" onClick={onClearFocus} sx={{ font: 'inherit', verticalAlign: 'baseline' }}>Show all</Link>
            </>
          ) : 'Detected against each pipeline\u2019s usual range. Select one to see its run.'}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', [TESTS_PANEL_STACK_QUERY]: { overflow: 'visible' } }}>
        {details}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 1.25 }}>
          {loading ? (
            <Box aria-hidden="true" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {Array.from({ length: SKELETON_ROWS }, (_, index) => <Skeleton key={index} variant="rounded" height={46} />)}
            </Box>
          ) : visible.length === 0 ? (
            <Typography variant="body-sm" color="text.secondary" sx={{ px: 0.5 }}>
              No changes{focusName ? ` for ${focusName}` : ''} in the last {lookbackDays} days.
            </Typography>
          ) : (
            <>
              <Box component="section" aria-label={current ? 'This sprint' : 'Last 2 weeks'} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <GroupHeading text={current ? 'This sprint' : 'Last 2 weeks'} meta={current?.label ?? null} count={recent.length} />
                {recent.length
                  ? renderList(recent, current ? 'Changes this sprint' : 'Changes in the last 2 weeks')
                  : <Typography variant="body-sm" color="text.secondary" sx={{ px: 0.5 }}>{current ? 'No changes this sprint.' : 'No changes in the last 2 weeks.'}</Typography>}
              </Box>
              {earlier.length ? (
                <Box component="section" aria-label="Earlier" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <GroupHeading text="Earlier" meta={null} count={earlier.length} />
                  {renderList(earlier, 'Earlier changes')}
                </Box>
              ) : null}
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}

function GroupHeading({ text, meta, count }: { text: string; meta: string | null; count: number }) {
  return (
    <Typography variant="body-sm" render={<h3 />} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, m: 0, px: 0.5, fontWeight: 700, color: CHART_TEXT_SECONDARY }}>
      {text}
      <Box component="span" sx={{ fontWeight: 400, color: TERTIARY_TEXT_COLOR }}>{count}</Box>
      {meta ? <Box component="span" sx={{ ml: 'auto', fontWeight: 400, fontSize: 11, color: TERTIARY_TEXT_COLOR }}>{meta}</Box> : null}
    </Typography>
  )
}

type ChangeItemProps = { change: TestChange; entry: TestHealthEntry; axis: TestTimeAxis; selected: boolean; onClick: () => void }

function ChangeItem({ change, entry, axis, selected, onClick }: ChangeItemProps) {
  const presentation = testChangePresentation(change.type)
  const title = testChangeTitle(change)
  const name = `${testPipelineShortName(entry.pipeline)} · ${testStageLabel(entry.pipeline.stageName)}`
  const date = formatAxisDay(testAxisDate(axis, change.day))
  const edge = `inset 3px 0 0 ${presentation.edge}`
  return (
    <ButtonBase
      nativeButton
      aria-pressed={selected}
      data-change={change.id}
      onClick={onClick}
      style={{ boxShadow: selected ? `${edge}, 0 0 0 1px var(--stratakit-color-border-accent-strong)` : `${edge}, var(--stratakit-shadow-surface-xs)` }}
      sx={{
        width: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: 1,
        p: '7px 10px 7px 12px',
        textAlign: 'left',
        bgcolor: 'background.paper',
        border: 1,
        borderColor: selected ? 'var(--stratakit-color-border-accent-strong)' : 'divider',
        borderRadius: 1,
        color: CHART_TEXT_SECONDARY,
        '&:hover': { bgcolor: `color-mix(in srgb, var(--stratakit-mui-palette-background-paper), ${CHART_TEXT_PRIMARY} 3%)` },
        '&:focus-visible': { outline: '2px solid var(--stratakit-color-border-accent-base)', outlineOffset: 1 },
      }}
    >
      <Icon href={presentation.icon} alt="" style={{ flex: '0 0 auto', marginTop: 2, color: presentation.iconColor }} />
      <Box component="span" sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
          <Box component="span" sx={{ fontSize: 13, fontWeight: 650, color: CHART_TEXT_PRIMARY, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </Box>
          <Box component="span" sx={{ ml: 'auto', flex: '0 0 auto', fontSize: 11, color: TERTIARY_TEXT_COLOR, fontVariantNumeric: 'tabular-nums' }}>{date}</Box>
        </Box>
        <Box component="span" sx={{ fontSize: 11.5, minWidth: 0, overflowWrap: 'anywhere' }}>
          {name} · {testChangeDetail(change, entry.health)}
        </Box>
      </Box>
    </ButtonBase>
  )
}
