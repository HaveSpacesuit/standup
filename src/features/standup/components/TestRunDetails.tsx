import { Box, Button, CircularProgress, IconButton, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgWindowPopout from '@stratakit/icons/window-popout.svg'
import type { AdoRequestClient } from '../../../ado/httpClient'
import { AppTooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { CHART_TEXT_PRIMARY, CHART_TEXT_SECONDARY } from './testChartStyles'
import { ATTENTION_TEXT_COLOR, CRITICAL_TEXT_COLOR, testChangePresentation } from './testHealthPresentation'
import { TipLines } from './TipLines'
import { useFailingTests, type FailingTestsCache, type FailingTestsState, type LabeledFailingTest } from '../hooks/useFailingTests'
import {
  formatPassRate, formatRunDay, formatRunTime, formatTestCount, formatTestUsualRange, testChangeDetail, testChangeTitle,
  testPipelineShortName, testRunUrl, type TestChange, type TestHealthEntry, type TestRun,
} from '../utils/testHealth'
import { testStageLabel } from '../utils/testPipelines'

/** Failing tests listed before "+N more"; the rest are a click away in Azure DevOps. */
const FAILING_TESTS_SHOWN = 8

type TestRunDetailsProps = {
  entry: TestHealthEntry
  run: TestRun
  change: TestChange | null
  client: AdoRequestClient | null
  cache: FailingTestsCache
  onClose: () => void
}

/** One run in context: what changed, its counts against the pipeline's usual, and, on demand, which tests failed. */
export function TestRunDetails({ entry, run, change, client, cache, onClose }: TestRunDetailsProps) {
  const { pipeline, health } = entry
  const previous = health.runs[run.index - 1] ?? null
  const failing = useFailingTests(client, pipeline, run, previous, cache)
  const date = new Date(run.date)
  const heading = `${testPipelineShortName(pipeline)} · ${testStageLabel(pipeline.stageName)}`
  const difference = previous ? Math.round((run.rate - previous.rate) * 10) / 10 : null

  return (
    <Box
      component="section"
      aria-label={`Run details: ${heading}`}
      data-testid="tests-run-details"
      sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, p: '12px 14px 14px', borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body-md" render={<h3 />} sx={{ m: 0, fontWeight: 700 }}>{heading}</Typography>
          <Typography variant="body-sm" sx={{ color: TERTIARY_TEXT_COLOR, fontVariantNumeric: 'tabular-nums' }}>
            {formatRunDay(date)} · {formatRunTime(date)} · {pipeline.kind === 'build' ? 'Build' : 'Release'} {run.runId}
          </Typography>
        </Box>
        <AppTooltip title="Close run details">
          <IconButton size="small" aria-label="Close run details" onClick={onClose} sx={{ mt: -0.5, mr: -0.75 }}>
            <Icon href={svgDismiss} />
          </IconButton>
        </AppTooltip>
      </Box>

      {change ? <ChangeCallout change={change} entry={entry} /> : null}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75 }}>
        <Stat label="Passed" value={formatTestCount(run.passed)} />
        <Stat label="Failed" value={formatTestCount(run.failed)} color={run.failed > 0 ? CRITICAL_TEXT_COLOR : undefined} />
        <Stat
          label="Ran"
          value={formatTestCount(run.total)}
          note={`of ~${formatTestCount(health.usualTotal)}`}
          color={run.fewer ? ATTENTION_TEXT_COLOR : undefined}
        />
      </Box>

      <Box
        component="dl"
        sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 1.5, rowGap: 0.5, m: 0, fontSize: 12, '& dt': { color: CHART_TEXT_SECONDARY }, '& dd': { m: 0, color: CHART_TEXT_PRIMARY, fontVariantNumeric: 'tabular-nums' } }}
      >
        <dt>Pass rate</dt>
        <dd>{formatPassRate(run.rate)}</dd>
        <dt>vs previous run</dt>
        <dd>
          {previous && difference !== null
            ? `${difference < 0 ? '−' : '+'}${Math.abs(difference).toFixed(1)} pts · ${formatPassRate(previous.rate)} on ${formatRunDay(new Date(previous.date))}`
            : 'first run in range'}
        </dd>
        <dt>Usual range</dt>
        <dd>{formatTestUsualRange(health)}</dd>
        <dt>Usual tests</dt>
        <dd>~{formatTestCount(health.usualTotal)}</dd>
      </Box>

      {run.failed > 0 ? <FailingTestsSection failing={failing} failed={run.failed} /> : null}

      <Button
        size="small"
        variant="outlined"
        href={testRunUrl(pipeline, run.runId)}
        target="_blank"
        rel="noreferrer noopener"
        startIcon={<Icon href={svgWindowPopout} />}
        sx={{ alignSelf: 'flex-start' }}
      >
        Open in Azure DevOps
      </Button>
    </Box>
  )
}

function ChangeCallout({ change, entry }: { change: TestChange; entry: TestHealthEntry }) {
  const presentation = testChangePresentation(change.type)
  return (
    <Box
      data-testid="tests-run-change"
      style={{ background: presentation.wash, boxShadow: `inset 3px 0 0 ${presentation.edge}` }}
      sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: '8px 10px 8px 12px', borderRadius: 1 }}
    >
      <Icon href={presentation.icon} style={{ flex: '0 0 auto', marginTop: 2, color: presentation.iconColor }} />
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ fontSize: 13, fontWeight: 650, color: CHART_TEXT_PRIMARY }}>{testChangeTitle(change)}</Box>
        <Box sx={{ fontSize: 12, color: CHART_TEXT_SECONDARY }}>{testChangeDetail(change, entry.health)}</Box>
      </Box>
    </Box>
  )
}

function Stat({ label, value, note, color }: { label: string; value: string; note?: string; color?: string }) {
  return (
    <Box sx={{ p: '6px 8px', border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0 }}>
      <Box sx={{ fontSize: 11, color: TERTIARY_TEXT_COLOR }}>{label}</Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
        <Box component="span" style={{ color: color ?? CHART_TEXT_PRIMARY }} sx={{ fontSize: 17, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </Box>
        {note ? <Box component="span" sx={{ fontSize: 11, color: TERTIARY_TEXT_COLOR, whiteSpace: 'nowrap' }}>{note}</Box> : null}
      </Box>
    </Box>
  )
}

function FailingTestsSection({ failing, failed }: { failing: FailingTestsState; failed: number }) {
  let body
  if (failing.status === 'loaded') {
    const shown = failing.tests.slice(0, FAILING_TESTS_SHOWN)
    const hidden = failing.tests.length - shown.length
    body = failing.tests.length ? (
      <>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {shown.map((test) => <FailingTestItem key={test.key} test={test} />)}
        </Box>
        {hidden > 0 || failing.truncated ? (
          <Typography variant="body-sm" sx={{ color: TERTIARY_TEXT_COLOR }}>
            {hidden > 0 ? `+${formatTestCount(hidden)} more` : ''}
            {hidden > 0 && failing.truncated ? ', ' : ''}
            {failing.truncated ? 'and more in Azure DevOps' : ''}
          </Typography>
        ) : null}
      </>
    ) : (
      <Typography variant="body-sm" color="text.secondary">No failing results were listed for this run.</Typography>
    )
  } else if (failing.status === 'error') {
    body = <Typography variant="body-sm" style={{ color: CRITICAL_TEXT_COLOR }}>Couldn&apos;t load failing tests. {failing.message}</Typography>
  } else {
    body = (
      <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, color: CHART_TEXT_SECONDARY }}>
        <CircularProgress size={14} aria-hidden="true" />
        Loading failing tests...
      </Box>
    )
  }
  return (
    <Box data-testid="tests-failing" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography variant="body-sm" render={<h4 />} sx={{ m: 0, fontWeight: 700 }}>
        Failing tests <Box component="span" sx={{ color: TERTIARY_TEXT_COLOR, fontWeight: 400 }}>{formatTestCount(failed)}</Box>
      </Typography>
      {body}
    </Box>
  )
}

const chipSx = { flex: '0 0 auto', height: 18, px: 0.75, borderRadius: 999, border: '1px solid transparent', fontSize: 10.5, fontWeight: 600, lineHeight: '16px' }

function FailingTestItem({ test }: { test: LabeledFailingTest }) {
  const tip = [test.name, ...(test.key !== test.name ? [test.key] : []), ...(test.outcome.toLowerCase() !== 'failed' ? [`Outcome: ${test.outcome}`] : [])]
  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, fontSize: 12, color: CHART_TEXT_PRIMARY }}>
      <AppTooltip title={<TipLines lines={tip} />} placement="left">
        <Box
          component="span"
          sx={{ flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}
        >
          {test.name}
        </Box>
      </AppTooltip>
      {test.isNew === true ? (
        <Box component="span" style={{ color: CRITICAL_TEXT_COLOR, borderColor: 'var(--stratakit-color-border-critical-base)' }} sx={chipSx}>New</Box>
      ) : test.isNew === false ? (
        <Box component="span" style={{ color: CHART_TEXT_SECONDARY, background: 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)' }} sx={chipSx}>Again</Box>
      ) : null}
    </Box>
  )
}
