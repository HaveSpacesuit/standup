import { useId, useMemo, useRef } from 'react'
import { Box, ButtonBase } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import { AppTooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'
import { SeriesSwatch } from './testChartParts'
import { CHART_TEXT_PRIMARY, CHART_TEXT_SECONDARY, testChartStyles } from './testChartStyles'
import { ATTENTION_TEXT_COLOR, TEST_HEALTH_STATUS_PRESENTATION, TEST_TILE_GRID_COLUMNS, testPointClassName } from './testHealthPresentation'
import { useElementSize } from '../hooks/useElementSize'
import { useSvgId } from '../hooks/useSvgId'
import {
  formatPassRate, formatRunDay, formatTestCount, formatTestHealthDelta, pluralizeTests, TEST_HEALTH_STATUS_LABELS,
  TEST_SPARKLINE_DAYS, testHealthStatusTip, testLinePaths, testPipelineShortName,
  type TestHealthEntry, type TestPipelineHealth, type TestTimeAxis,
} from '../utils/testHealth'
import { testStageLabel, type TestHealthOptions } from '../utils/testPipelines'

const SPARK_HEIGHT = 34
const SPARK_FALLBACK = { width: 220, height: SPARK_HEIGHT }
const DIMMED_OPACITY = 0.55

type TestHealthStripProps = {
  entries: TestHealthEntry[]
  axis: TestTimeAxis
  options: TestHealthOptions
  lookbackDays: number
  focusId: string | null
  onToggleFocus: (id: string) => void
}

/** One tile per pipeline: its latest pass rate against its own usual range. Clicking a tile focuses the chart on it. */
export function TestHealthStrip({ entries, axis, options, lookbackDays, focusId, onToggleFocus }: TestHealthStripProps) {
  return (
    <Box
      role="group"
      aria-label="Pipeline health"
      sx={{ display: 'grid', gridTemplateColumns: TEST_TILE_GRID_COLUMNS, gap: 1.25, flex: '0 0 auto' }}
    >
      {entries.map((entry) => (
        <HealthTile
          key={entry.pipeline.id}
          entry={entry}
          axis={axis}
          tip={testHealthStatusTip(entry.health, options, lookbackDays)}
          pressed={focusId === entry.pipeline.id}
          dimmed={focusId !== null && focusId !== entry.pipeline.id}
          onClick={() => onToggleFocus(entry.pipeline.id)}
        />
      ))}
    </Box>
  )
}

type HealthTileProps = { entry: TestHealthEntry; axis: TestTimeAxis; tip: string; pressed: boolean; dimmed: boolean; onClick: () => void }

function HealthTile({ entry, axis, tip, pressed, dimmed, onClick }: HealthTileProps) {
  const { pipeline, health } = entry
  const tipId = useId()
  const presentation = TEST_HEALTH_STATUS_PRESENTATION[health.status]
  const label = TEST_HEALTH_STATUS_LABELS[health.status]
  const shortName = testPipelineShortName(pipeline)
  const stage = testStageLabel(pipeline.stageName)
  const stale = health.status === 'stale'
  const rate = formatPassRate(health.latest.rate)
  const edge = `inset 3px 0 0 ${presentation.edge}`

  return (
    <ButtonBase
      nativeButton
      aria-pressed={pressed}
      aria-label={`${shortName} ${stage}: ${rate}, ${label}`}
      aria-describedby={tipId}
      data-pipeline={pipeline.id}
      onClick={onClick}
      style={{ opacity: dimmed ? DIMMED_OPACITY : 1 }}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 0.25,
        minWidth: 0,
        p: '9px 11px 8px 13px',
        textAlign: 'left',
        bgcolor: 'background.paper',
        border: 1,
        borderColor: pressed ? 'var(--stratakit-color-border-accent-strong)' : 'divider',
        borderRadius: 1,
        boxShadow: pressed
          ? `${edge}, 0 0 0 1px var(--stratakit-color-border-accent-strong)`
          : `${edge}, var(--stratakit-shadow-surface-xs)`,
        color: CHART_TEXT_SECONDARY,
        fontSize: 12,
        transition: 'opacity 120ms ease',
        '&:hover': { bgcolor: `color-mix(in srgb, var(--stratakit-mui-palette-background-paper), ${CHART_TEXT_PRIMARY} 3%)` },
        '&:focus-visible': { outline: '2px solid var(--stratakit-color-border-accent-base)', outlineOffset: 1 },
      }}
    >
      <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <SeriesSwatch shape={entry.shape} color={entry.color} width={18} height={10} />
        <Box component="span" sx={{ fontWeight: 650, fontSize: 13, color: CHART_TEXT_PRIMARY, whiteSpace: 'nowrap' }}>{shortName}</Box>
        <Box
          component="span"
          sx={{ color: TERTIARY_TEXT_COLOR, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
        >
          {stage}
        </Box>
        <AppTooltip title={tip} placement="top" describeChild>
          <Box
            component="span"
            data-status={health.status}
            style={presentation.chip}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              height: 20,
              p: '0 7px 0 5px',
              ml: 'auto',
              flex: '0 0 auto',
              borderRadius: 999,
              border: '1px solid transparent',
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <Icon href={presentation.icon} style={{ width: 12, height: 12, color: presentation.iconColor }} />
            {label}
          </Box>
        </AppTooltip>
      </Box>
      <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.25 }}>
        <Box
          component="span"
          sx={{ fontSize: 24, fontWeight: 650, lineHeight: 1.25, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: stale ? TERTIARY_TEXT_COLOR : CHART_TEXT_PRIMARY }}
        >
          {rate}
        </Box>
        <Box component="span" sx={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>{formatTestHealthDelta(health)}</Box>
      </Box>
      <HealthSparkline health={health} axis={axis} />
      <Box component="span" sx={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <HealthFoot health={health} />
      </Box>
      <Box component="span" id={tipId} sx={visuallyHiddenSx}>{tip}</Box>
    </ButtonBase>
  )
}

function HealthFoot({ health }: { health: TestPipelineHealth }) {
  const { latest } = health
  const day = formatRunDay(new Date(latest.date))
  const warn = (text: string) => <Box component="span" sx={{ color: ATTENTION_TEXT_COLOR, fontWeight: 600 }}>{text}</Box>
  if (health.status === 'stale') return <>{day} · {warn(`${pluralizeTests(health.idleDays, 'working day')} ago`)}</>
  if (latest.fewer) return <>{day} · {warn(`${formatTestCount(latest.total)} of ~${formatTestCount(health.usualTotal)} tests`)}</>
  return <>{day} · {pluralizeTests(latest.total, 'test')} · {formatTestCount(latest.failed)} failed</>
}

/** The last three weeks: the usual band, the runs as a neutral line, and dots only where a run stood out. */
function HealthSparkline({ health, axis }: { health: TestPipelineHealth; axis: TestTimeAxis }) {
  const ref = useRef<HTMLSpanElement>(null)
  const width = Math.max(40, useElementSize(ref, SPARK_FALLBACK).width)
  const hatchId = useSvgId('tests-stale-hatch')

  const spark = useMemo(() => {
    const start = Math.max(0, axis.dayCount - TEST_SPARKLINE_DAYS)
    const runs = health.runs.filter((run) => run.t >= start)
    const positions = [...runs.map((run) => run.position), health.usualHighPosition, health.usualLowPosition]
    const pad = Math.max(0.04, (Math.max(...positions) - Math.min(...positions)) * 0.12)
    const low = Math.min(...positions) - pad
    const high = Math.max(...positions) + pad
    const x = (t: number) => 2 + ((t - start) / (axis.dayCount - start)) * (width - 6)
    const y = (position: number) => 3 + ((position - low) / (high - low)) * (SPARK_HEIGHT - 6)
    const points = runs.map((run) => ({ run, t: run.t, x: x(run.t), y: y(run.position) }))
    const staleFrom = health.status === 'stale' ? Math.max(x(start), x(health.latest.day + 1)) : null
    return {
      band: { x: x(start), y: y(health.usualHighPosition), width: x(axis.dayCount) - x(start), height: Math.max(1.5, y(health.usualLowPosition) - y(health.usualHighPosition)) },
      stale: staleFrom === null ? null : { x: staleFrom, width: Math.max(0, x(axis.dayCount) - staleFrom) },
      paths: testLinePaths(points),
      dots: points.filter(({ run }) => run.cls !== 'ok' || run === health.latest),
    }
  }, [axis, health, width])

  return (
    <Box component="span" ref={ref} sx={{ display: 'block', height: SPARK_HEIGHT, my: 0.25, minWidth: 0 }}>
      <Box
        component="svg"
        aria-hidden="true"
        width={width}
        height={SPARK_HEIGHT}
        viewBox={`0 0 ${width} ${SPARK_HEIGHT}`}
        sx={(theme: Theme) => testChartStyles(theme)}
      >
        {spark.stale ? (
          <defs>
            <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line className="tests-hatch-mono" x1="0" y1="0" x2="0" y2="6" />
            </pattern>
          </defs>
        ) : null}
        <rect className="tests-band" {...spark.band} />
        {spark.stale ? <rect x={spark.stale.x} y={0} width={spark.stale.width} height={SPARK_HEIGHT} fill={`url(#${hatchId})`} /> : null}
        <path className="tests-line" d={spark.paths.solid} style={{ strokeWidth: 1.25 }} />
        {spark.paths.dashed ? <path className="tests-line-gap" d={spark.paths.dashed} /> : null}
        {spark.dots.map(({ run, x, y }) => <circle key={run.index} className={testPointClassName(run.cls)} cx={x} cy={y} r={2.4} />)}
      </Box>
    </Box>
  )
}
