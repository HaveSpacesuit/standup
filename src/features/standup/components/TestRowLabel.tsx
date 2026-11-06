import { Box, ButtonBase } from '@mui/material'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { CHART_TEXT_PRIMARY, CHART_TEXT_SECONDARY } from './testChartStyles'
import { ATTENTION_TEXT_COLOR, TEST_HEALTH_STATUS_PRESENTATION, TEST_ROW_DIMMED_OPACITY } from './testHealthPresentation'
import { formatPassRate, formatRunDay, formatTestCount, pluralizeTests, TEST_HEALTH_STATUS_LABELS, testPipelineShortName, type TestHealthEntry } from '../utils/testHealth'
import { testStageLabel } from '../utils/testPipelines'

const ACCENT_TINT = 'color-mix(in srgb, var(--stratakit-color-bg-accent-base) 8%, transparent)'
const ellipsis = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const

type TestRowLabelProps = { entry: TestHealthEntry; pressed: boolean; dimmed: boolean; onClick: () => void }

/** A pipeline's label in the Rows and Calendar views: its name, stage, and latest result, edged in its status color; click to focus it. */
export function TestRowLabel({ entry, pressed, dimmed, onClick }: TestRowLabelProps) {
  const { pipeline, health } = entry
  const { latest } = health
  const shortName = testPipelineShortName(pipeline)
  const stage = testStageLabel(pipeline.stageName)
  const rate = formatPassRate(latest.rate)
  const stale = health.status === 'stale'
  const sub = stale
    ? `${pluralizeTests(health.idleDays, 'working day')} ago`
    : latest.fewer ? `${formatTestCount(latest.total)} of ~${formatTestCount(health.usualTotal)} tests` : formatRunDay(new Date(latest.date))

  return (
    <ButtonBase
      nativeButton
      aria-pressed={pressed}
      aria-label={`${shortName} ${stage}: ${rate}, ${TEST_HEALTH_STATUS_LABELS[health.status]}`}
      data-pipeline={pipeline.id}
      onClick={onClick}
      style={{ opacity: dimmed ? TEST_ROW_DIMMED_OPACITY : 1, boxShadow: `inset 3px 0 0 ${TEST_HEALTH_STATUS_PRESENTATION[health.status].edge}` }}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        gap: '1px',
        minWidth: 0,
        p: '10px 10px 8px 12px',
        textAlign: 'left',
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: pressed ? ACCENT_TINT : 'transparent',
        color: CHART_TEXT_SECONDARY,
        fontSize: 12,
        transition: 'opacity 120ms ease',
        '&:hover': { bgcolor: pressed ? ACCENT_TINT : `color-mix(in srgb, transparent, ${CHART_TEXT_PRIMARY} 4%)` },
        '&:focus-visible': { outline: '2px solid var(--stratakit-color-border-accent-base)', outlineOffset: -2 },
      }}
    >
      <Box component="span" sx={{ fontWeight: 650, fontSize: 13, color: CHART_TEXT_PRIMARY, ...ellipsis }}>{shortName}</Box>
      <Box component="span" sx={{ fontSize: 11.5, color: TERTIARY_TEXT_COLOR, ...ellipsis }}>{stage}</Box>
      <Box
        component="span"
        sx={{ mt: 0.5, fontSize: 18, fontWeight: 650, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums', color: stale ? TERTIARY_TEXT_COLOR : CHART_TEXT_PRIMARY }}
      >
        {rate}
      </Box>
      <Box component="span" sx={{ fontSize: 11, color: stale || latest.fewer ? ATTENTION_TEXT_COLOR : TERTIARY_TEXT_COLOR, ...ellipsis }}>{sub}</Box>
    </ButtonBase>
  )
}
