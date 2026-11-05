import { memo, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Box, Button, Link, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgArrowLeft from '@stratakit/icons/arrow-left.svg'
import svgCheckmark from '@stratakit/icons/checkmark.svg'
import svgInfo from '@stratakit/icons/info.svg'
import { AppTooltip as Tooltip } from './AppTooltip'
import { BugEffort, BugSeverity, BugSprint, BugValue } from './BacklogTable'
import { TipLines } from './TipLines'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'
import {
  createLogScale,
  describeBacklogMapBubble,
  describeMapEffort,
  formatMapEffort,
  getIsoValueLine,
  getMapEffortDomain,
  groupBacklogMapBubbles,
  layoutBacklogMap,
  MAP_BENEFIT_DOMAIN,
  MAP_BENEFIT_TICKS,
  pickEffortTicks,
  benefitForValue,
  type BacklogMapBubble,
  type MapPoint,
} from '../utils/backlogMap'
import type { BacklogTierThresholds } from '../utils/backlogOptions'
import {
  BACKLOG_TIER_COLORS,
  BACKLOG_TIERS,
  formatBacklogTierRange,
  getBacklogTier,
  getBacklogTierStyle,
  type BacklogTierKey,
} from '../utils/backlogTiers'
import { formatBacklogValue, formatValueTerm, MIN_ADJUSTED_EFFORT, type RankedBacklogBug } from '../utils/backlogValue'

type BacklogMapProps = {
  /** Every open bug, ranked. All of them are plotted, so the map keeps its shape while filters come and go. */
  allBugs: readonly RankedBacklogBug[]
  /** The ranked bugs the quick filter leaves; bubbles with none of them fade. */
  bugs: readonly RankedBacklogBug[]
  tierThresholds: BacklogTierThresholds
  /** The bugs a Needs attention facet picks out, or null when no facet is on. */
  highlightedBugIds?: ReadonlySet<number> | null
  /** Plan a sprint's picks, ringed on the map; null when it is off. */
  pickedIds?: ReadonlySet<number> | null
  /** The selected bubble, whose bugs the side panel lists; the page keeps it, so it outlasts a refresh. */
  selectedKey: string | null
  onSelectedKeyChange: (key: string | null) => void
}

const MARGIN = { top: 16, right: 18, bottom: 46, left: 58 }
/** Where ResizeObserver is missing, as in tests, the plot takes a typical size. */
const FALLBACK_SIZE = { width: 720, height: 440 }
const MIN_SIZE = { width: 420, height: 300 }
const TOP_BUG_COUNT = 10
const LOW_BAND_VALUE = 1e-3
const HIGH_BAND_VALUE = 1e6

const PAPER = 'var(--stratakit-mui-palette-background-paper)'
const DIVIDER = 'var(--stratakit-mui-palette-divider)'
const TEXT_PRIMARY = 'var(--stratakit-color-text-neutral-primary)'
const TEXT_SECONDARY = 'var(--stratakit-color-text-neutral-secondary)'
const ATTENTION_BORDER = 'var(--stratakit-color-border-attention-base)'
const PICKED_BORDER = 'var(--stratakit-color-border-accent-strong)'

const pluralBugs = (count: number) => `${count} ${count === 1 ? 'bug' : 'bugs'}`

const plotSx: SxProps<Theme> = {
  position: 'absolute',
  top: 0,
  left: 0,
  display: 'block',
  '& text': { fontFamily: 'inherit' },
  '& .backlog-map-grid line': { stroke: 'var(--stratakit-color-border-neutral-muted)', strokeOpacity: 0.6 },
  '& .backlog-map-frame': { fill: 'none', stroke: DIVIDER },
  '& .backlog-map-iso': { fill: 'none', stroke: 'var(--stratakit-color-border-accent-base)', strokeWidth: 1.2, strokeDasharray: '5 4', opacity: 0.7 },
  '& .backlog-map-iso-label': { fill: 'var(--stratakit-color-text-accent-base)', fontSize: 11, fontWeight: 650 },
  '& .backlog-map-axis text': { fill: TERTIARY_TEXT_COLOR, fontSize: 11, fontVariantNumeric: 'tabular-nums' },
  '& .backlog-map-axis .backlog-map-axis-title': { fill: TEXT_SECONDARY, fontSize: 11.5, fontWeight: 650 },
  '& .backlog-map-corner': { fill: TERTIARY_TEXT_COLOR, fontSize: 11.5, fontWeight: 650, letterSpacing: '0.02em' },
  '& .backlog-map-corner[data-corner="quick-wins"]': { fill: 'var(--stratakit-color-text-positive-base)' },
  // StrataKit's focus ring stays on (its layer outranks sx anyway); the circle's accent stroke adds to it.
  '& .backlog-bubble': { cursor: 'pointer', transition: 'opacity 150ms ease' },
  '& .backlog-bubble circle': { fill: 'var(--backlog-tier)', stroke: PAPER, strokeWidth: 2 },
  '& .backlog-bubble[data-tier="medium"] circle': {
    stroke: `color-mix(in srgb, var(--stratakit-color-bg-accent-base) 55%, ${PAPER})`,
    strokeWidth: 1.2,
  },
  '& .backlog-bubble[data-tier="low"] circle': { stroke: 'var(--stratakit-color-bg-mono-base)', strokeWidth: 1 },
  '& .backlog-bubble[data-assumed] circle': { stroke: ATTENTION_BORDER, strokeWidth: 1.6, strokeDasharray: '3 2' },
  '& .backlog-bubble[data-picked] circle': { stroke: PICKED_BORDER, strokeWidth: 3, strokeDasharray: 'none' },
  '& .backlog-bubble[data-selected] circle': { stroke: TEXT_PRIMARY, strokeWidth: 2.5, strokeDasharray: 'none' },
  '& .backlog-bubble:hover circle': { stroke: TEXT_PRIMARY },
  '& .backlog-bubble:focus-visible circle': { stroke: 'var(--stratakit-color-border-accent-base)', strokeWidth: 3 },
  '& .backlog-bubble text': { fontSize: 10.5, fontWeight: 700, fill: TEXT_PRIMARY, pointerEvents: 'none' },
  // White on the solid accent of the Top tier, in both color schemes.
  '& .backlog-bubble[data-tier="top"] text': { fill: 'var(--stratakit-color-text-neutral-emphasis)' },
  // Like the dimmed rows and cards: bubbles outside the filters fade, and come back partway on hover or focus.
  '& .backlog-bubble[data-dim]': { opacity: 0.18 },
  '& .backlog-bubble[data-dim]:hover, & .backlog-bubble[data-dim]:focus-visible': { opacity: 0.7 },
}

/** Measures the plot's box, so the SVG draws at its real size and its text never scales. */
function usePlotSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState(FALLBACK_SIZE)

  useLayoutEffect(() => {
    const host = ref.current
    if (!host || typeof ResizeObserver === 'undefined') {
      return
    }

    const update = () => {
      const width = Math.floor(host.clientWidth)
      const height = Math.floor(host.clientHeight)
      setSize((previous) => (previous.width === width && previous.height === height ? previous : { width, height }))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => observer.disconnect()
  }, [ref])

  return { width: Math.max(MIN_SIZE.width, size.width), height: Math.max(MIN_SIZE.height, size.height) }
}

function BubbleTip({ bubble, selected }: { bubble: BacklogMapBubble; selected: boolean }) {
  const { lines, hint } = describeBacklogMapBubble(bubble, selected)
  return (
    <>
      <TipLines lines={lines} boldFirst />
      <Box component="span" sx={{ display: 'block', mt: 0.75 }}>
        {hint}
      </Box>
    </>
  )
}

const tierBounds = (key: BacklogTierKey, thresholds: BacklogTierThresholds): [number, number] => {
  switch (key) {
    case 'top':
      return [thresholds.top, HIGH_BAND_VALUE]
    case 'high':
      return [thresholds.high, thresholds.top]
    case 'medium':
      return [thresholds.medium, thresholds.high]
    case 'low':
      return [LOW_BAND_VALUE, thresholds.medium]
  }
}

const mapRowSx: SxProps<Theme> = {
  position: 'relative',
  py: 0.75,
  pr: 1,
  pl: '11px',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: '6px',
  bgcolor: 'background.paper',
  boxShadow: 'inset 3px 0 0 var(--backlog-tier, transparent)',
  fontSize: 12,
  lineHeight: 1.35,
  transition: 'opacity 120ms ease',
  '&[data-emphasis="dim"]': { opacity: 0.35 },
  '&[data-emphasis="dim"]:hover, &[data-emphasis="dim"]:focus-within': { opacity: 1 },
  '& .backlog-map-row-id': { fontWeight: 700 },
  '& .backlog-map-row-meta': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '4px 8px',
    mt: 0.5,
    fontSize: 11,
    color: TEXT_SECONDARY,
  },
  '& .backlog-map-row-picked': {
    ml: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    color: 'var(--stratakit-color-text-accent-strong)',
    fontWeight: 650,
  },
}

/** A bug in the side panel: its id and title, then its Value, severity, effort, and sprint. */
const MapBugRow = memo(function MapBugRow({
  bug,
  tier,
  dim,
  picked,
}: {
  bug: RankedBacklogBug
  tier: BacklogTierKey
  dim: boolean
  picked: boolean
}) {
  return (
    <Box component="li" sx={mapRowSx} style={getBacklogTierStyle(tier)} data-bug-id={bug.id} data-emphasis={dim ? 'dim' : undefined}>
      <div>
        <span className="backlog-map-row-id">{bug.id}</span>{' '}
        <Link href={bug.workItemUrl} target="_blank" rel="noreferrer noopener">
          {bug.title}
          <Box component="span" sx={visuallyHiddenSx}> (opens in a new tab)</Box>
        </Link>
      </div>
      <div className="backlog-map-row-meta">
        <BugValue bug={bug} />
        <BugSeverity severity={bug.severity} />
        <span>
          <Box component="span" sx={visuallyHiddenSx}>Effort </Box>
          {bug.effort === undefined ? <BugEffort effort={undefined} /> : <><BugEffort effort={bug.effort} /> pts</>}
        </span>
        <BugSprint sprint={bug.sprint} iterationPath={bug.iterationPath} />
        {picked ? (
          <span className="backlog-map-row-picked">
            <Icon href={svgCheckmark} alt="" style={{ color: 'var(--stratakit-color-icon-accent-strong)' }} />
            Picked
          </span>
        ) : null}
        {dim ? <Box component="span" sx={visuallyHiddenSx}>Outside the filter</Box> : null}
      </div>
    </Box>
  )
})

const listSx: SxProps<Theme> = { listStyle: 'none', m: 0, p: 0, display: 'grid', gap: '5px' }
const sideHeadSx: SxProps<Theme> = {
  flex: '0 0 auto',
  px: 1.5,
  py: 1.25,
  borderBottom: '1px solid',
  borderColor: 'divider',
}
const sideHeadingSx: SxProps<Theme> = { display: 'flex', alignItems: 'center', gap: 0.75, m: 0, mb: 0.25, fontWeight: 700 }
const swatchSx: SxProps<Theme> = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  boxSizing: 'border-box',
  flex: '0 0 auto',
  '&[data-kind="assumed"]': { border: `1.6px dashed ${ATTENTION_BORDER}` },
  '&[data-kind="picked"]': { border: `3px solid ${PICKED_BORDER}` },
}
const keySx: SxProps<Theme> = {
  listStyle: 'none',
  m: 0,
  mt: 0.75,
  p: 0,
  display: 'grid',
  gap: '3px',
  fontSize: 11.5,
  '& > li': { display: 'flex', alignItems: 'center', gap: 1 },
  // Stacked under the plot, the key runs across so the bug list keeps its room.
  '@container (max-width: 900px)': { display: 'flex', flexWrap: 'wrap', gap: '3px 16px' },
}

function MapKey({ thresholds, planning }: { thresholds: BacklogTierThresholds; planning: boolean }) {
  return (
    <Box component="ul" aria-label="Key" sx={keySx}>
      {BACKLOG_TIERS.map(({ key, name }) => (
        <li key={key}>
          <Box component="span" aria-hidden="true" sx={swatchSx} style={{ background: BACKLOG_TIER_COLORS[key] }} />
          {name} · {formatBacklogTierRange(key, thresholds)}
        </li>
      ))}
      <li>
        <Box component="span" aria-hidden="true" sx={swatchSx} data-kind="assumed" style={{ background: BACKLOG_TIER_COLORS.medium }} />
        Uses an assumed default
      </li>
      {planning ? (
        <li>
          <Box component="span" aria-hidden="true" sx={swatchSx} data-kind="picked" style={{ background: BACKLOG_TIER_COLORS.high }} />
          Picked in Plan a sprint
        </li>
      ) : null}
    </Box>
  )
}

export const BacklogMap = memo(function BacklogMap({
  allBugs,
  bugs,
  tierThresholds,
  highlightedBugIds = null,
  pickedIds = null,
  selectedKey,
  onSelectedKeyChange,
}: BacklogMapProps) {
  const plotRef = useRef<HTMLDivElement>(null)
  const bubbleRefs = useRef(new Map<string, SVGGElement>())
  const { width, height } = usePlotSize(plotRef)
  const clipId = `backlog-map-clip-${useId().replace(/[^\w-]/g, '')}`
  const hintId = `backlog-map-hint-${useId().replace(/[^\w-]/g, '')}`
  // The bubble that holds the map's one tab stop; arrow keys move it.
  const [focusKey, setFocusKey] = useState<string | null>(null)

  const shownIds = useMemo(
    () => new Set(bugs.filter((bug) => !highlightedBugIds || highlightedBugIds.has(bug.id)).map((bug) => bug.id)),
    [bugs, highlightedBugIds],
  )
  const filtered = highlightedBugIds !== null || bugs.length < allBugs.length
  const bubbles = useMemo(() => groupBacklogMapBubbles(allBugs, tierThresholds), [allBugs, tierThresholds])

  const plot = useMemo(() => {
    const left = MARGIN.left
    const right = width - MARGIN.right
    const top = MARGIN.top
    const bottom = height - MARGIN.bottom
    const effortDomain = getMapEffortDomain(bubbles)
    const toX = createLogScale(effortDomain, [left, right])
    const toY = createLogScale(MAP_BENEFIT_DOMAIN, [bottom, top])
    const point = ({ effort, benefit }: MapPoint) => `${toX(effort).toFixed(1)},${toY(benefit).toFixed(1)}`
    const [lowEffort, highEffort] = effortDomain

    const bands = BACKLOG_TIERS.map(({ key }) => {
      const [low, high] = tierBounds(key, tierThresholds)
      const corners = [
        { effort: lowEffort, benefit: benefitForValue(low, lowEffort) },
        { effort: highEffort, benefit: benefitForValue(low, highEffort) },
        { effort: highEffort, benefit: benefitForValue(high, highEffort) },
        { effort: lowEffort, benefit: benefitForValue(high, lowEffort) },
      ]
      return { key, points: corners.map(point).join(' ') }
    })

    // Every line of equal Value runs at the same angle, since Value is a ratio and both axes are logarithmic.
    const angle = (Math.atan2(toY(benefitForValue(10, highEffort)) - toY(benefitForValue(10, lowEffort)), right - left) * 180) / Math.PI
    const isoLines = [tierThresholds.top, tierThresholds.high, tierThresholds.medium].flatMap((value) => {
      const line = getIsoValueLine(value, effortDomain, MAP_BENEFIT_DOMAIN)
      return line ? [{ ...line, x1: toX(line.start.effort), y1: toY(line.start.benefit), x2: toX(line.end.effort), y2: toY(line.end.benefit), labelX: toX(line.label.effort), labelY: toY(line.label.benefit) }] : []
    })

    return {
      left,
      right,
      top,
      bottom,
      angle,
      bands,
      isoLines,
      effortTicks: pickEffortTicks(bubbles.map((bubble) => bubble.adjustedEffort), toX).map((effort) => ({ effort, x: toX(effort) })),
      benefitTicks: MAP_BENEFIT_TICKS.map((benefit) => ({ benefit, y: toY(benefit) })),
      bubbles: layoutBacklogMap(bubbles, toX, toY, [left, right]),
    }
  }, [bubbles, tierThresholds, width, height])

  const selected = plot.bubbles.find((bubble) => bubble.key === selectedKey) ?? null
  const tabKey = plot.bubbles.some((bubble) => bubble.key === focusKey) ? focusKey : (selected?.key ?? plot.bubbles[0]?.key)
  // Larger bubbles first, so a small one is never hidden under a large one.
  const stacked = useMemo(() => [...plot.bubbles].sort((a, b) => b.r - a.r), [plot.bubbles])
  const topBugs = useMemo(() => allBugs.filter((bug) => shownIds.has(bug.id)).slice(0, TOP_BUG_COUNT), [allBugs, shownIds])

  const toggleBubble = (key: string) => onSelectedKeyChange(key === selectedKey ? null : key)
  const focusBubble = (key: string) => {
    setFocusKey(key)
    bubbleRefs.current.get(key)?.focus()
  }

  const handleBubbleKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    const last = plot.bubbles.length - 1
    const target = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: last,
    }[event.key]
    if (target !== undefined) {
      event.preventDefault()
      focusBubble(plot.bubbles[Math.min(last, Math.max(0, target))].key)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleBubble(plot.bubbles[index].key)
    }
  }

  const backToGuide = () => {
    const key = selected?.key
    onSelectedKeyChange(null)
    if (key) {
      focusBubble(key)
    }
  }

  return (
    <Box
      component="main"
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', containerType: 'inline-size' }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && selectedKey !== null) {
          onSelectedKeyChange(null)
        }
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 340px',
          gridTemplateRows: 'minmax(0, 1fr)',
          '@container (max-width: 900px)': {
            gridTemplateColumns: 'minmax(0, 1fr)',
            gridTemplateRows: 'minmax(300px, 1fr) minmax(0, 40%)',
          },
        }}
      >
        <Box ref={plotRef} sx={{ position: 'relative', minWidth: 0, minHeight: 0, overflow: 'auto' }}>
          <Box component="span" id={hintId} sx={visuallyHiddenSx}>
            Bubbles group bugs with the same effort, severity, and impact. Arrow keys move between them by Value; Enter
            lists a bubble&apos;s bugs.
          </Box>
          <Box
            component="svg"
            role="group"
            aria-label="Value map: effort against severity and impact"
            aria-describedby={hintId}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            sx={plotSx}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} />
              </clipPath>
            </defs>
            <g aria-hidden="true">
              <g clipPath={`url(#${clipId})`}>
                {plot.bands.map(({ key, points }) => (
                  <polygon
                    key={key}
                    data-tier={key}
                    points={points}
                    style={{ fill: BACKLOG_TIER_COLORS[key], fillOpacity: key === 'low' ? 0.12 : key === 'medium' ? 0.18 : 0.16 }}
                  />
                ))}
                <g className="backlog-map-grid">
                  {plot.effortTicks.map(({ effort, x }) => (
                    <line key={`x-${effort}`} x1={x} x2={x} y1={plot.top} y2={plot.bottom} />
                  ))}
                  {plot.benefitTicks.map(({ benefit, y }) => (
                    <line key={`y-${benefit}`} x1={plot.left} x2={plot.right} y1={y} y2={y} />
                  ))}
                </g>
                {plot.isoLines.map((line) => (
                  <line key={line.value} className="backlog-map-iso" x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
                ))}
              </g>
              {plot.isoLines.map((line) => (
                <text
                  key={line.value}
                  className="backlog-map-iso-label"
                  textAnchor="end"
                  dy={-5}
                  transform={`translate(${line.labelX.toFixed(1)} ${line.labelY.toFixed(1)}) rotate(${plot.angle.toFixed(1)})`}
                >
                  Value {formatValueTerm(line.value)}
                </text>
              ))}
              <rect className="backlog-map-frame" x={plot.left} y={plot.top} width={plot.right - plot.left} height={plot.bottom - plot.top} />
              <g className="backlog-map-axis">
                {plot.effortTicks.map(({ effort, x }) => (
                  <text key={effort} x={x} y={plot.bottom + 16} textAnchor="middle" data-effort-tick={effort}>
                    {formatMapEffort(effort)}
                  </text>
                ))}
                {plot.benefitTicks.map(({ benefit, y }) => (
                  <text key={benefit} x={plot.left - 8} y={y} dy=".35em" textAnchor="end">
                    {benefit}
                  </text>
                ))}
                <text className="backlog-map-axis-title" x={(plot.left + plot.right) / 2} y={height - 8} textAnchor="middle">
                  Effort in pts → (log scale; under {MIN_ADJUSTED_EFFORT} counts as {MIN_ADJUSTED_EFFORT})
                </text>
                <text
                  className="backlog-map-axis-title"
                  transform={`translate(16 ${((plot.top + plot.bottom) / 2).toFixed(1)}) rotate(-90)`}
                  textAnchor="middle"
                >
                  Severity score × Impact score → (log scale)
                </text>
              </g>
              <text className="backlog-map-corner" data-corner="quick-wins" x={plot.left + 10} y={plot.top + 18}>Quick wins</text>
              <text className="backlog-map-corner" x={plot.right - 10} y={plot.top + 18} textAnchor="end">Big bets</text>
              <text className="backlog-map-corner" x={plot.left + 10} y={plot.bottom - 10}>Fill-ins</text>
              <text className="backlog-map-corner" x={plot.right - 10} y={plot.bottom - 10} textAnchor="end">Reconsider</text>
            </g>
            {stacked.map((bubble) => {
              const index = plot.bubbles.indexOf(bubble)
              const count = bubble.bugs.length
              const dim = !bubble.bugs.some((bug) => shownIds.has(bug.id))
              const picked = pickedIds !== null && bubble.bugs.some((bug) => pickedIds.has(bug.id))
              const isSelected = bubble.key === selectedKey
              const label = [
                `${pluralBugs(count)}, Value ${formatBacklogValue(bubble.value)}`,
                ...(picked ? ['picked'] : []),
                ...(dim ? ['outside the filter'] : []),
              ].join(', ')
              return (
                <Tooltip key={bubble.key} title={<BubbleTip bubble={bubble} selected={isSelected} />} describeChild placement="top">
                  <g
                    ref={(element) => {
                      if (element) {
                        bubbleRefs.current.set(bubble.key, element)
                      } else {
                        bubbleRefs.current.delete(bubble.key)
                      }
                    }}
                    className="backlog-bubble"
                    role="button"
                    tabIndex={bubble.key === tabKey ? 0 : -1}
                    aria-label={label}
                    aria-pressed={isSelected}
                    data-key={bubble.key}
                    data-tier={bubble.tier}
                    data-assumed={bubble.assumed || undefined}
                    data-dim={dim || undefined}
                    data-picked={picked || undefined}
                    data-selected={isSelected || undefined}
                    style={getBacklogTierStyle(bubble.tier)}
                    onClick={() => toggleBubble(bubble.key)}
                    onFocus={() => setFocusKey(bubble.key)}
                    onKeyDown={(event) => handleBubbleKeyDown(event, index)}
                  >
                    <circle cx={bubble.cx.toFixed(1)} cy={bubble.cy.toFixed(1)} r={bubble.r} />
                    {count > 1 ? (
                      <text x={bubble.cx.toFixed(1)} y={bubble.cy.toFixed(1)} dy=".36em" textAnchor="middle">
                        {count}
                      </text>
                    ) : null}
                  </g>
                </Tooltip>
              )
            })}
          </Box>
        </Box>

        <Box
          component="aside"
          aria-label="Bugs on the map"
          sx={{
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid',
            borderColor: 'divider',
            bgcolor: 'var(--stratakit-color-bg-page-base)',
            '@container (max-width: 900px)': { borderLeft: 'none', borderTop: '1px solid', borderColor: 'divider' },
          }}
        >
          {selected ? (
            <Box sx={sideHeadSx}>
              <Typography variant="body-md" render={<h2 />} sx={sideHeadingSx}>
                <Box
                  component="span"
                  aria-hidden="true"
                  sx={{ width: 4, height: 16, borderRadius: 999, flex: '0 0 auto' }}
                  style={{ background: BACKLOG_TIER_COLORS[selected.tier] }}
                />
                {pluralBugs(selected.bugs.length)} · Value {formatBacklogValue(selected.value)}
              </Typography>
              <Typography variant="body-sm" color="text.secondary">
                Effort {describeMapEffort(selected.adjustedEffort)}
                {' · '}Severity × Impact {formatValueTerm(selected.benefit)}
              </Typography>
              {selected.assumed ? (
                <Typography variant="body-sm" style={{ color: 'var(--stratakit-color-text-attention-base)' }}>
                  Uses an assumed default, so the position is a guess.
                </Typography>
              ) : null}
              <Button size="small" variant="text" startIcon={<Icon href={svgArrowLeft} />} onClick={backToGuide} sx={{ mt: 0.5, ml: -1 }}>
                Back to the reading guide
              </Button>
            </Box>
          ) : (
            <Box sx={sideHeadSx}>
              <Typography variant="body-md" render={<h2 />} sx={sideHeadingSx}>
                <Icon href={svgInfo} alt="" style={{ color: 'var(--stratakit-color-icon-neutral-secondary)' }} />
                Reading the map
              </Typography>
              <Typography variant="body-sm" color="text.secondary">
                Up is more severe and more widespread; right is more effort. Each diagonal joins equal Value, so bubbles
                in the same band rank alike. Select a bubble to list its bugs.
              </Typography>
              <MapKey thresholds={tierThresholds} planning={pickedIds !== null} />
            </Box>
          )}

          {/* Relative so the visually hidden text in the rows is contained by this scroller, not the page. */}
          <Box sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto', p: 1 }}>
            {selected ? (
              <Box component="ul" role="list" aria-label="Bugs in the selected bubble" sx={listSx}>
                {selected.bugs.map((bug) => (
                  <MapBugRow
                    key={bug.id}
                    bug={bug}
                    tier={selected.tier}
                    dim={!shownIds.has(bug.id)}
                    picked={pickedIds?.has(bug.id) ?? false}
                  />
                ))}
              </Box>
            ) : topBugs.length > 0 ? (
              <>
                <Typography
                  variant="body-sm"
                  render={<h3 />}
                  color="text.secondary"
                  sx={{ fontWeight: 700, m: 0, mx: 0.25, mb: 0.75 }}
                >
                  Top {topBugs.length} by Value{filtered ? ' · filtered' : ''}
                </Typography>
                <Box component="ul" role="list" sx={listSx}>
                  {topBugs.map((bug) => (
                    <MapBugRow
                      key={bug.id}
                      bug={bug}
                      tier={getBacklogTier(bug.value, tierThresholds)}
                      dim={false}
                      picked={pickedIds?.has(bug.id) ?? false}
                    />
                  ))}
                </Box>
              </>
            ) : (
              <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 0.5 }}>
                No bugs match.
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  )
})
