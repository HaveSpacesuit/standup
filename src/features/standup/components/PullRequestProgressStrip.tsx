import Box from '@mui/material/Box'
import { AppTooltip } from './AppTooltip'
import type { WorkItemPullRequestSummary } from '../../../ado/queryEngine'
import { getPullRequestProgress, type ProgressSegmentState } from './developmentCardDisplay'

const TRACK_COLOR = 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)'
const ATTENTION_COLOR = 'var(--stratakit-color-bg-attention-base)'
const SEGMENT_FILL: Record<Exclude<ProgressSegmentState, 'empty'>, string> = {
  critical: 'var(--stratakit-color-bg-critical-base)',
  attention: ATTENTION_COLOR,
  positive: 'var(--stratakit-color-bg-positive-base)',
  pending: `repeating-linear-gradient(-45deg, ${ATTENTION_COLOR} 0 3px, color-mix(in srgb, ${ATTENTION_COLOR} 35%, transparent) 3px 6px)`,
}

const SEGMENT_SIZE = {
  regular: { width: 22, height: 6, gap: 0.75 },
  compact: { width: 14, height: 5, gap: 0.5 },
} as const

type StripSize = keyof typeof SEGMENT_SIZE

type SegmentProps = {
  state: ProgressSegmentState
  fill?: number
  ring?: boolean
  size: StripSize
}

function Segment({ state, fill = 1, ring = false, size }: SegmentProps) {
  const { width, height } = SEGMENT_SIZE[size]
  return (
    <Box
      component="span"
      data-segment-state={ring ? 'ready' : state}
      sx={{
        position: 'relative',
        display: 'block',
        width,
        height,
        borderRadius: 999,
        overflow: 'hidden',
        bgcolor: TRACK_COLOR,
        boxShadow: ring ? 'inset 0 0 0 1.5px var(--stratakit-color-border-positive-base)' : undefined,
      }}
    >
      {state !== 'empty' && fill > 0 ? (
        <Box
          component="span"
          sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${fill * 100}%`, background: SEGMENT_FILL[state] }}
        />
      ) : null}
    </Box>
  )
}

/**
 * Checks → review → complete, as three small segments. StrataKit has no stepped progress
 * component, so this is built from its color tokens.
 */
export function PullRequestProgressStrip({ pullRequest, size = 'regular' }: { pullRequest: WorkItemPullRequestSummary; size?: StripSize }) {
  const progress = getPullRequestProgress(pullRequest)

  return (
    <AppTooltip title={progress.label}>
      <Box
        component="span"
        role="img"
        aria-label={progress.label}
        tabIndex={0}
        data-pr-progress=""
        sx={{ display: 'inline-flex', alignItems: 'center', gap: SEGMENT_SIZE[size].gap, flex: '0 0 auto' }}
      >
        <Segment state={progress.checks.state} size={size} />
        <Segment state={progress.review.state} fill={progress.review.fill} size={size} />
        <Segment
          state="empty"
          ring={progress.ready}
          size={size}
        />
      </Box>
    </AppTooltip>
  )
}
