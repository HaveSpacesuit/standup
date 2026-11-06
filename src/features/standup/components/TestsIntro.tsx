import { Box, Button, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgInfo from '@stratakit/icons/info.svg'
import { AppTooltip as Tooltip } from './AppTooltip'
import { TipLines } from './TipLines'
import { TEST_GAP_DAYS } from '../utils/testHealth'

type TestsIntroProps = { lookbackDays: number; daily: boolean; view?: 'rows' | 'overlay' }

const UNRUN_RESULTS = "Skipped, NotImpacted, and other unrun results don't count."

function testsIntroText({ lookbackDays, daily, view = 'overlay' }: TestsIntroProps): string {
  if (view === 'rows') return `One row per pipeline · the shaded band is its usual range · last ${lookbackDays} days`
  return `Share of executed tests that passed ${daily ? 'each day' : 'in each run'} · last ${lookbackDays} days`
}

function testsHowToLines({ daily, view = 'overlay' }: Pick<TestsIntroProps, 'daily' | 'view'>): string[] {
  if (view === 'rows') {
    return [
      `Each point is one run: passed ÷ executed tests. ${UNRUN_RESULTS}`,
      'Every row shares the same dates; hover any row to compare all pipelines on that day.',
      "The shaded band is the pipeline's usual range: the middle 80% of its runs, leaving out sharp drops.",
      'Only exceptions get color: amber is below usual, red is a sharp drop (about 4× the usual failures), and hollow amber is a run with fewer tests than usual.',
      'Hatching after the last run means the pipeline has stopped reporting results.',
      'Each row stretches the top of the scale, so small drops near 100% stay visible.',
    ]
  }
  return [
    daily
      ? `Each point is one pipeline's day (local time): passed ÷ executed tests. ${UNRUN_RESULTS}`
      : `Each point is one run: passed ÷ executed tests. ${UNRUN_RESULTS}`,
    'The scale stretches the top: each step from 98% → 95% → 90% → 75% → 50% roughly doubles the failures, so small drops near 100% stay visible.',
    `A dashed line means no results for ${TEST_GAP_DAYS} or more days.`,
  ]
}

/** One line on what the chart shows, with the method behind a "How to read this chart" tip. */
export function TestsIntro(props: TestsIntroProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, flexShrink: 0 }}>
      <Typography variant="body-sm" color="text.secondary">{testsIntroText(props)}</Typography>
      <Tooltip title={<TipLines lines={testsHowToLines(props)} />} describeChild>
        <Button size="small" variant="text" startIcon={<Icon href={svgInfo} />}>How to read this chart</Button>
      </Tooltip>
    </Box>
  )
}
