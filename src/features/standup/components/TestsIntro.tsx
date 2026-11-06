import { Box, Button, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgInfo from '@stratakit/icons/info.svg'
import { AppTooltip as Tooltip } from './AppTooltip'
import { TipLines } from './TipLines'
import { TEST_GAP_DAYS } from '../utils/testHealth'

type TestsIntroProps = { lookbackDays: number; daily: boolean }

function testsIntroText({ lookbackDays, daily }: TestsIntroProps): string {
  return `Share of executed tests that passed ${daily ? 'each day' : 'in each run'} · last ${lookbackDays} days`
}

function testsHowToLines({ daily }: Pick<TestsIntroProps, 'daily'>): string[] {
  return [
    daily
      ? "Each point is one pipeline's day (local time): passed ÷ executed tests. Skipped, NotImpacted, and other unrun results don't count."
      : "Each point is one run: passed ÷ executed tests. Skipped, NotImpacted, and other unrun results don't count.",
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
