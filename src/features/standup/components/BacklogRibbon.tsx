import type { ReactNode } from 'react'
import { Box, Divider, Typography } from '@mui/material'
import { AppTooltip } from './AppTooltip'
import { TipLines } from './TipLines'
import { visuallyHiddenSx } from './developmentCardDisplay'
import { SEVERITY_LEVELS, type BacklogSummary, type SeverityLevel } from '../utils/backlogAttention'
import type { BacklogTierThresholds } from '../utils/backlogOptions'
import { BACKLOG_TIER_COLORS, BACKLOG_TIERS, formatBacklogTierRange } from '../utils/backlogTiers'
import { parseDateOnly } from '../utils/dateOnly'
import { formatDayCount, formatSprintDate } from '../utils/sprintDates'
import { formatEffortPoints } from '../utils/sprintEffortTotals'

type BacklogRibbonProps = {
  summary: BacklogSummary
  tierThresholds: BacklogTierThresholds
}

const ATTENTION_TEXT = 'var(--stratakit-color-text-attention-base)'

const SEVERITY_LEGEND: Readonly<Record<SeverityLevel, { name: string; color: string }>> = {
  1: { name: 'Critical', color: 'var(--stratakit-color-bg-critical-base)' },
  2: { name: 'High', color: 'var(--stratakit-color-bg-attention-base)' },
  3: { name: 'Medium', color: 'var(--stratakit-color-bg-mono-base)' },
  4: { name: 'Low', color: 'var(--stratakit-color-bg-mono-muted)' },
}

// Lower-priority groups drop out as the ribbon narrows, so it always stays on one line.
const hideBelow = (width: number) => ({ [`@container (max-width: ${width}px)`]: { display: 'none' } })

const ribbonSx = {
  containerType: 'inline-size',
  height: 44,
  flexShrink: 0,
  px: 2,
  display: 'flex',
  alignItems: 'center',
  gap: 1.5,
  borderBottom: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.paper',
  color: 'text.secondary',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  fontVariantNumeric: 'tabular-nums',
  '& b': { color: 'text.primary', fontWeight: 700 },
} as const

const groupSx = { display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 } as const

const legendSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1.25,
  '& > span': { display: 'inline-flex', alignItems: 'center', gap: 0.5 },
} as const

const swatchSx = { width: 8, height: 8, borderRadius: '2px', flex: 'none' } as const

function RibbonDivider({ hideBelowWidth }: { hideBelowWidth?: number }) {
  return <Divider orientation="vertical" flexItem sx={{ my: 1.5, ...(hideBelowWidth ? hideBelow(hideBelowWidth) : {}) }} />
}

/** A ribbon group with its detail in a tooltip; focusable so keyboard users can open the tooltip too. */
function TipGroup({ tip, hideBelowWidth, children }: { tip: ReactNode; hideBelowWidth?: number; children: ReactNode }) {
  return (
    <AppTooltip title={tip} describeChild>
      <Typography
        component="span"
        variant="body-sm"
        tabIndex={0}
        sx={{ ...groupSx, color: 'inherit', ...(hideBelowWidth ? hideBelow(hideBelowWidth) : {}) }}
      >
        {children}
      </Typography>
    </AppTooltip>
  )
}

const plural = (count: number, noun: string) => `${count} ${count === 1 ? noun : `${noun}s`}`

function EffortTotal({ summary }: { summary: BacklogSummary }) {
  const { effortTotal, unestimatedCount } = summary
  const tip = [
    'Total effort of the estimated bugs.',
    ...(unestimatedCount > 0 ? [`${plural(unestimatedCount, 'bug')} ${unestimatedCount === 1 ? 'has' : 'have'} no effort.`] : []),
  ]

  return (
    <TipGroup tip={<TipLines lines={tip} />}>
      <span>
        <span aria-hidden="true">Σ </span>
        <Box component="span" sx={visuallyHiddenSx}>Total effort </Box>
        <b>{formatEffortPoints(effortTotal)}</b>
        {unestimatedCount > 0 ? ` + ${unestimatedCount} unestimated` : null}
      </span>
    </TipGroup>
  )
}

function ValueMix({ summary, thresholds }: { summary: BacklogSummary; thresholds: BacklogTierThresholds }) {
  const { tierCounts } = summary
  const tip = BACKLOG_TIERS.map(({ key, name }) => `${name} (${formatBacklogTierRange(key, thresholds)}): ${tierCounts[key]}`)

  return (
    <TipGroup tip={<TipLines lines={tip} />}>
      <b>Value</b>
      <Box
        aria-hidden="true"
        // No track behind the segments: they always fill the bar, and the faint Low segment must not read as empty space.
        sx={{ display: 'flex', gap: '1px', width: 96, height: 8, borderRadius: 999, overflow: 'hidden', ...hideBelow(760) }}
      >
        {BACKLOG_TIERS.map(({ key }) => tierCounts[key] > 0 ? (
          <Box key={key} sx={{ flex: `${tierCounts[key]} 0 0px`, minWidth: 3, bgcolor: BACKLOG_TIER_COLORS[key] }} />
        ) : null)}
      </Box>
      <Box component="span" sx={legendSx}>
        {BACKLOG_TIERS.map(({ key, name }) => (
          <span key={key}>
            <Box component="span" aria-hidden="true" sx={{ ...swatchSx, bgcolor: BACKLOG_TIER_COLORS[key] }} />
            {tierCounts[key]} {name.toLowerCase()}
          </span>
        ))}
      </Box>
    </TipGroup>
  )
}

function SeverityMix({ summary, hideBelowWidth }: { summary: BacklogSummary; hideBelowWidth: number }) {
  const { severityCounts, severityNotSetCount } = summary
  const tip = [
    ...SEVERITY_LEVELS.map((level) => `S${level} · ${SEVERITY_LEGEND[level].name}: ${severityCounts[level]}`),
    ...(severityNotSetCount > 0 ? [`Not set: ${severityNotSetCount}`] : []),
  ]

  return (
    <TipGroup tip={<TipLines lines={tip} />} hideBelowWidth={hideBelowWidth}>
      <b>Severity</b>
      <Box component="span" sx={legendSx}>
        {SEVERITY_LEVELS.map((level) => (
          <span key={level}>
            <Box component="span" aria-hidden="true" sx={{ ...swatchSx, borderRadius: '50%', bgcolor: SEVERITY_LEGEND[level].color }} />
            {severityCounts[level]} S{level}
          </span>
        ))}
        {severityNotSetCount > 0 ? <Box component="span" sx={{ color: ATTENTION_TEXT }}>{severityNotSetCount} not set</Box> : null}
      </Box>
    </TipGroup>
  )
}

function Planned({ summary, hideBelowWidth }: { summary: BacklogSummary; hideBelowWidth: number }) {
  const { plannedThisSprint, plannedNextSprint, inEndedSprints, currentSprint, nextSprint } = summary
  const tip = [
    'Open bugs already in a sprint:',
    `${plannedThisSprint} in ${currentSprint?.name ?? 'this sprint'}, ${plannedNextSprint} in ${nextSprint?.name ?? 'the next sprint'}`,
    ...(inEndedSprints > 0 ? [`${plural(inEndedSprints, 'bug')} still in sprints that have ended`] : []),
  ]

  return (
    <TipGroup tip={<TipLines lines={tip} />} hideBelowWidth={hideBelowWidth}>
      <b>Planned</b>
      <span>
        {plannedThisSprint} this · {plannedNextSprint} next
        {inEndedSprints > 0 ? (
          <>
            {' · '}
            <Box component="span" sx={{ color: ATTENTION_TEXT }}>{inEndedSprints} ended</Box>
          </>
        ) : null}
      </span>
    </TipGroup>
  )
}

function NewThisSprint({ count, summary }: { count: number; summary: BacklogSummary }) {
  const start = parseDateOnly(summary.currentSprint?.startDate)
  const since = summary.currentSprint
    ? `${summary.currentSprint.name} started${start ? ` on ${formatSprintDate(start)}` : ''}`
    : 'this sprint started'

  return (
    <TipGroup tip={`Created since ${since}`} hideBelowWidth={1080}>
      <span>+{count} new this sprint</span>
    </TipGroup>
  )
}

function MedianAge({ days }: { days: number }) {
  return (
    <TipGroup tip={`Half the open bugs are older than ${plural(days, 'day')}.`} hideBelowWidth={960}>
      <span>Median age <b>{formatDayCount(days)}</b></span>
    </TipGroup>
  )
}

/** One line about the whole backlog: its size and effort, its Value and severity mix, what is planned, and its age. */
export function BacklogRibbon({ summary, tierThresholds }: BacklogRibbonProps) {
  return (
    <Box component="section" aria-label="Backlog summary" sx={ribbonSx}>
      <Typography component="span" variant="body-sm" sx={{ ...groupSx, color: 'inherit' }}>
        <span><b>{summary.openCount}</b> open {summary.openCount === 1 ? 'bug' : 'bugs'}</span>
      </Typography>
      <EffortTotal summary={summary} />
      <RibbonDivider />
      <ValueMix summary={summary} thresholds={tierThresholds} />
      {/* Container-query thresholds sit a little above the measured fit, leaving room for wider counts. */}
      <RibbonDivider hideBelowWidth={1380} />
      <SeverityMix summary={summary} hideBelowWidth={1380} />
      {summary.hasSprints ? (
        <>
          <RibbonDivider hideBelowWidth={880} />
          <Planned summary={summary} hideBelowWidth={880} />
        </>
      ) : null}
      <Box sx={{ flex: '1 1 auto' }} />
      {summary.newThisSprint !== undefined ? <NewThisSprint count={summary.newThisSprint} summary={summary} /> : null}
      {summary.medianAgeDays !== undefined ? <MedianAge days={summary.medianAgeDays} /> : null}
    </Box>
  )
}
