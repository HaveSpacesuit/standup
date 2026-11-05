import { useEffect, useRef, useState } from 'react'
import { Box, Button, Checkbox, FormControlLabel, IconButton, TextField, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgAdd from '@stratakit/icons/add.svg'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgCopy from '@stratakit/icons/copy.svg'
import svgMinus from '@stratakit/icons/minus.svg'
import svgUndo from '@stratakit/icons/undo.svg'
import { AppTooltip } from './AppTooltip'
import { isValidPlanBudget, MAX_PLAN_BUDGET } from '../utils/backlogOptions'
import { formatPlanList, type BacklogPlan } from '../utils/backlogPlan'
import { formatBacklogValue, MIN_ADJUSTED_EFFORT } from '../utils/backlogValue'
import { formatEffort } from '../utils/sprintEffortTotals'

type BacklogPlanBarProps = {
  plan: BacklogPlan
  onBudgetChange: (budget: number) => void
  skipPlanned: boolean
  onSkipPlannedChange: (skip: boolean) => void
  skipUnestimated: boolean
  onSkipUnestimatedChange: (skip: boolean) => void
  /** Whether there is a hand pick or a changed budget for Reset to undo. */
  canReset: boolean
  onReset: () => void
}

const ATTENTION_TEXT = 'var(--stratakit-color-text-attention-base)'
const COPY_FEEDBACK_MS = 1500
const COPY_LABELS = { idle: 'Copy list', copied: 'Copied', failed: 'Copy failed' } as const

// MUI's sx reads a bare 1 as 100%, so the 1px sizes must be strings.
const visuallyHiddenSx: SxProps<Theme> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}

const barSx: SxProps<Theme> = {
  position: 'relative',
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  columnGap: 2,
  rowGap: 0.5,
  minHeight: 46,
  px: 2,
  py: 0.5,
  borderBottom: '1px solid var(--stratakit-color-border-accent-muted)',
  bgcolor: 'color-mix(in srgb, var(--stratakit-color-bg-accent-base) 8%, var(--stratakit-mui-palette-background-paper))',
  whiteSpace: 'nowrap',
}

const summarySx: SxProps<Theme> = {
  ml: 'auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1,
  color: 'text.secondary',
  fontVariantNumeric: 'tabular-nums',
  '& b': { color: 'text.primary', fontWeight: 650 },
}

const pluralBugs = (count: number) => `${count} ${count === 1 ? 'bug' : 'bugs'}`

/**
 * The budget, typed or stepped. Typing applies once the text is a whole number in range; until then the plan keeps
 * the last budget that was, and leaving the field puts that budget back.
 */
function BudgetField({ budget, onChange }: { budget: number; onChange: (budget: number) => void }) {
  const [text, setText] = useState(() => String(budget))
  const [shownBudget, setShownBudget] = useState(budget)
  // The stepper or Reset can change the budget too, and the field follows.
  if (shownBudget !== budget) {
    setShownBudget(budget)
    setText(String(budget))
  }

  const parsed = text.trim() ? Number(text) : Number.NaN
  const invalid = !isValidPlanBudget(parsed)

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Typography component="span" variant="body-sm" sx={{ mr: 0.25 }}>Budget</Typography>
      <AppTooltip title="Decrease budget">
        <span>
          <IconButton size="small" aria-label="Decrease budget" onClick={() => onChange(budget - 1)} disabled={budget <= 1}>
            <Icon href={svgMinus} />
          </IconButton>
        </span>
      </AppTooltip>
      <TextField
        size="small"
        type="number"
        value={text}
        error={invalid}
        onChange={(event) => {
          setText(event.target.value)
          const next = event.target.value.trim() ? Number(event.target.value) : Number.NaN
          if (isValidPlanBudget(next)) {
            onChange(next)
          }
        }}
        onBlur={() => setText(String(budget))}
        slotProps={{ htmlInput: { min: 1, max: MAX_PLAN_BUDGET, step: 1, 'aria-label': 'Effort budget in points' } }}
        sx={{ width: 72, '& input': { textAlign: 'center', fontWeight: 650, fontVariantNumeric: 'tabular-nums' } }}
      />
      <AppTooltip title="Increase budget">
        <span>
          <IconButton
            size="small"
            aria-label="Increase budget"
            onClick={() => onChange(budget + 1)}
            disabled={budget >= MAX_PLAN_BUDGET}
          >
            <Icon href={svgAdd} />
          </IconButton>
        </span>
      </AppTooltip>
      <Typography component="span" variant="body-sm">pts</Typography>
      {invalid ? (
        <Box role="alert" sx={visuallyHiddenSx}>Enter a whole number of points from 1 to {MAX_PLAN_BUDGET}.</Box>
      ) : null}
    </Box>
  )
}

function PlanSummary({ plan }: { plan: BacklogPlan }) {
  const over = plan.used - plan.budget
  const fill = Math.min(100, (plan.used / Math.max(1, plan.budget)) * 100)

  return (
    <Typography role="status" component="span" variant="body-sm" sx={summarySx}>
      <b>{pluralBugs(plan.picks.length)}</b>
      <span>
        <b>{formatEffort(plan.used)}</b> of {formatEffort(plan.budget)} pts
      </span>
      <Box
        component="span"
        aria-hidden="true"
        sx={{
          display: 'inline-flex',
          width: 96,
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          bgcolor: 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)',
        }}
      >
        <Box
          component="span"
          className="backlog-plan-meter"
          style={{
            width: `${fill}%`,
            backgroundColor: over > 0 ? 'var(--stratakit-color-bg-attention-base)' : 'var(--stratakit-color-bg-accent-base)',
          }}
        />
      </Box>
      {over > 0 ? <span style={{ color: ATTENTION_TEXT }}>over by {formatEffort(over)}</span> : null}
      <span>
        <span aria-hidden="true">Σ </span>
        <Box component="span" sx={visuallyHiddenSx}>Total </Box>
        Value <b>{formatBacklogValue(plan.valueTotal)}</b>
      </span>
      {plan.assumedEffortCount > 0 ? (
        <AppTooltip title={`Counted as ${MIN_ADJUSTED_EFFORT} pts each`}>
          <span tabIndex={0} style={{ color: ATTENTION_TEXT }}>{plan.assumedEffortCount} without effort</span>
        </AppTooltip>
      ) : null}
    </Typography>
  )
}

function CopyListButton({ plan }: { plan: BacklogPlan }) {
  const [feedback, setFeedback] = useState<keyof typeof COPY_LABELS>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const showFeedback = (next: keyof typeof COPY_LABELS) => {
    setFeedback(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFeedback('idle'), COPY_FEEDBACK_MS)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatPlanList(plan.picks))
      showFeedback('copied')
    } catch {
      showFeedback('failed')
    }
  }

  return (
    <AppTooltip title="Copy the picked bugs' IDs, titles, efforts, and Values, one bug per line">
      <span>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Icon href={svgCopy} />}
          onClick={() => void copy()}
          disabled={plan.picks.length === 0}
        >
          <span aria-live="polite">{COPY_LABELS[feedback]}</span>
        </Button>
      </span>
    </AppTooltip>
  )
}

/** Plan a sprint's controls: the budget and what to skip, a summary of the picks, and ways to share or undo them. */
export function BacklogPlanBar({
  plan,
  onBudgetChange,
  skipPlanned,
  onSkipPlannedChange,
  skipUnestimated,
  onSkipUnestimatedChange,
  canReset,
  onReset,
}: BacklogPlanBarProps) {
  return (
    <Box role="region" aria-label="Plan a sprint" sx={barSx}>
      <Typography
        component="span"
        variant="body-sm"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontWeight: 700, color: 'var(--stratakit-color-text-accent-strong)' }}
      >
        <Icon href={svgCalendar} style={{ color: 'var(--stratakit-color-icon-accent-strong)' }} />
        Plan a sprint
      </Typography>
      <BudgetField budget={plan.budget} onChange={onBudgetChange} />
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
        <AppTooltip title="Leave out bugs already in this sprint or the next">
          <FormControlLabel
            label="Skip planned"
            slotProps={{ typography: { variant: 'body-sm' } }}
            control={<Checkbox checked={skipPlanned} onChange={(_, checked) => onSkipPlannedChange(checked)} />}
          />
        </AppTooltip>
        <AppTooltip title={`Leave out bugs without an Effort, which would count as ${MIN_ADJUSTED_EFFORT} pts each`}>
          <FormControlLabel
            label="Skip unestimated"
            slotProps={{ typography: { variant: 'body-sm' } }}
            control={<Checkbox checked={skipUnestimated} onChange={(_, checked) => onSkipUnestimatedChange(checked)} />}
          />
        </AppTooltip>
      </Box>
      <PlanSummary plan={plan} />
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
        <CopyListButton plan={plan} />
        <AppTooltip title="Clear the hand picks and go back to the default budget">
          <span>
            <Button size="small" variant="text" startIcon={<Icon href={svgUndo} />} onClick={onReset} disabled={!canReset}>
              Reset
            </Button>
          </span>
        </AppTooltip>
      </Box>
    </Box>
  )
}
