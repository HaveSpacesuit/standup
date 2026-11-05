import { useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
  Typography,
} from '@mui/material'
import {
  areValidTierThresholds,
  isValidAgingMonths,
  MAX_AGING_MONTHS,
  type BacklogOptions,
  type BacklogTierThresholds,
} from '../utils/backlogOptions'
import { BACKLOG_TIER_COLORS, type BacklogTierKey } from '../utils/backlogTiers'

const COMPACT_ROWS_HELP_ID = 'backlog-compact-rows-help'
const TIERS_HELP_ID = 'backlog-tiers-help'
const TIERS_ERROR_ID = 'backlog-tiers-error'
const AGING_HELP_ID = 'backlog-aging-help'
const AGING_ERROR_ID = 'backlog-aging-error'

type ThresholdKey = keyof BacklogTierThresholds

const THRESHOLD_FIELDS: ReadonlyArray<{ key: ThresholdKey; name: string }> = [
  { key: 'top', name: 'Top' },
  { key: 'high', name: 'High' },
  { key: 'medium', name: 'Medium' },
]

type BacklogOptionsDialogProps = {
  open: boolean
  onClose: () => void
  /** The team's compact density, shared with the Development and QA cards. */
  compactRows: boolean
  onCompactRowsChange: (compactRows: boolean) => void
  backlogOptions: BacklogOptions
  onBacklogOptionsChange: (next: BacklogOptions) => void
}

function TierSwatch({ tier }: { tier: BacklogTierKey }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{ width: 4, height: 18, borderRadius: 999, bgcolor: BACKLOG_TIER_COLORS[tier], flex: 'none' }}
    />
  )
}

type ThresholdDraft = Record<ThresholdKey, string>

const toDraft = (thresholds: BacklogTierThresholds): ThresholdDraft => ({
  top: String(thresholds.top),
  high: String(thresholds.high),
  medium: String(thresholds.medium),
})

const parseDraft = (draft: ThresholdDraft): BacklogTierThresholds => ({
  // An empty field reads as NaN rather than Number('')'s 0, so it is reported as missing.
  top: draft.top.trim() ? Number(draft.top) : Number.NaN,
  high: draft.high.trim() ? Number(draft.high) : Number.NaN,
  medium: draft.medium.trim() ? Number(draft.medium) : Number.NaN,
})

/** The fields to flag and the message to show, or null when the thresholds can be used. */
function checkThresholds(thresholds: BacklogTierThresholds): { invalid: Set<ThresholdKey>; message: string } | null {
  if (areValidTierThresholds(thresholds)) {
    return null
  }

  const missing = THRESHOLD_FIELDS.filter(({ key }) => !(Number.isFinite(thresholds[key]) && thresholds[key] > 0))
  if (missing.length > 0) {
    return { invalid: new Set(missing.map(({ key }) => key)), message: 'Enter a Value above 0 for each tier.' }
  }

  const invalid = new Set<ThresholdKey>()
  if (thresholds.top <= thresholds.high) {
    invalid.add('top').add('high')
  }
  if (thresholds.high <= thresholds.medium) {
    invalid.add('high').add('medium')
  }
  return { invalid, message: 'Each threshold must be lower than the one above it.' }
}

/**
 * The tier thresholds, edited as text so a half-typed number can be shown. A change applies as soon as all three make
 * sense together; until then the tiers keep the last thresholds that did. The dialog unmounts its content when it
 * closes, so reopening it starts again from the saved thresholds.
 */
function TierThresholdFields({
  thresholds,
  onChange,
}: {
  thresholds: BacklogTierThresholds
  onChange: (next: BacklogTierThresholds) => void
}) {
  const [draft, setDraft] = useState(() => toDraft(thresholds))
  const problem = checkThresholds(parseDraft(draft))

  const handleChange = (key: ThresholdKey, value: string) => {
    const nextDraft = { ...draft, [key]: value }
    setDraft(nextDraft)
    const next = parseDraft(nextDraft)
    if (!checkThresholds(next)) {
      onChange(next)
    }
  }

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 1 }}>
        {THRESHOLD_FIELDS.map(({ key, name }) => {
          const invalid = problem?.invalid.has(key) ?? false
          return (
            <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TierSwatch tier={key} />
              <TextField
                size="small"
                type="number"
                label={`${name} from Value`}
                value={draft[key]}
                error={invalid}
                onChange={(event) => handleChange(key, event.target.value)}
                slotProps={{
                  htmlInput: {
                    min: 1,
                    step: 1,
                    'aria-describedby': invalid ? `${TIERS_HELP_ID} ${TIERS_ERROR_ID}` : TIERS_HELP_ID,
                  },
                }}
                sx={{ width: 150 }}
              />
            </Box>
          )
        })}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <TierSwatch tier="low" />
        <Typography variant="body-sm">
          <Box component="span" sx={{ fontWeight: 700 }}>Low</Box>
          <Box component="span" sx={{ color: 'text.secondary' }}>: everything below Medium</Box>
        </Typography>
      </Box>
      {problem ? (
        <Typography id={TIERS_ERROR_ID} role="alert" variant="body-sm" sx={{ color: 'var(--stratakit-color-text-critical-base)', mb: 1 }}>
          {problem.message}
        </Typography>
      ) : null}
    </>
  )
}

/** The age for the "Older than" chip, edited as text and applied once it is a whole number of months in range. */
function AgingMonthsField({ months, onChange }: { months: number; onChange: (next: number) => void }) {
  const [draft, setDraft] = useState(() => String(months))
  const parsed = draft.trim() ? Number(draft) : Number.NaN
  const invalid = !isValidAgingMonths(parsed)

  return (
    <>
      <TextField
        size="small"
        type="number"
        label="Flag New bugs older than (months)"
        value={draft}
        error={invalid}
        onChange={(event) => {
          setDraft(event.target.value)
          const next = event.target.value.trim() ? Number(event.target.value) : Number.NaN
          if (isValidAgingMonths(next)) {
            onChange(next)
          }
        }}
        slotProps={{
          htmlInput: {
            min: 1,
            max: MAX_AGING_MONTHS,
            step: 1,
            'aria-describedby': invalid ? `${AGING_HELP_ID} ${AGING_ERROR_ID}` : AGING_HELP_ID,
          },
        }}
        sx={{ width: 260 }}
      />
      {invalid ? (
        <Typography id={AGING_ERROR_ID} role="alert" variant="body-sm" sx={{ color: 'var(--stratakit-color-text-critical-base)', mt: 1 }}>
          Enter a whole number of months from 1 to {MAX_AGING_MONTHS}.
        </Typography>
      ) : null}
    </>
  )
}

export function BacklogOptionsDialog({
  open,
  onClose,
  compactRows,
  onCompactRowsChange,
  backlogOptions,
  onBacklogOptionsChange,
}: BacklogOptionsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Backlog options</DialogTitle>
      <DialogContent>
        <Box component="section" aria-labelledby="backlog-options-display">
          <Typography id="backlog-options-display" variant="body-md" render={<h3 />} sx={{ fontWeight: 700, mt: 0, mb: 0.5 }}>
            Display
          </Typography>
          <Typography id={COMPACT_ROWS_HELP_ID} variant="body-sm" color="text.secondary" sx={{ mb: 1.5 }}>
            Show each bug on one line, with its first tag and the assignee's avatar; hover over them for the rest. This is
            the same setting as Compact cards on the Development and QA pages, so it changes those too.
          </Typography>
          <FormControlLabel
            label="Compact rows"
            control={(
              <Checkbox
                checked={compactRows}
                onChange={(_, checked) => onCompactRowsChange(checked)}
                slotProps={{ input: { 'aria-describedby': COMPACT_ROWS_HELP_ID } }}
              />
            )}
          />
        </Box>

        <Box component="section" aria-labelledby="backlog-options-tiers" sx={{ mt: 3 }}>
          <Typography id="backlog-options-tiers" variant="body-md" render={<h3 />} sx={{ fontWeight: 700, mt: 0, mb: 0.5 }}>
            Value tiers
          </Typography>
          <Typography id={TIERS_HELP_ID} variant="body-sm" color="text.secondary" sx={{ mb: 2 }}>
            The list groups bugs by Value. Each tier starts at the Value set here, so a bug changes tier only when its own
            Severity, Impact, or Effort changes.
          </Typography>
          <TierThresholdFields
            thresholds={backlogOptions.tierThresholds}
            onChange={(tierThresholds) => onBacklogOptionsChange({ ...backlogOptions, tierThresholds })}
          />
          <FormControlLabel
            label="Start with the Low tier collapsed"
            control={(
              <Checkbox
                checked={backlogOptions.startLowCollapsed}
                onChange={(_, checked) => onBacklogOptionsChange({ ...backlogOptions, startLowCollapsed: checked })}
              />
            )}
          />
        </Box>

        <Box component="section" aria-labelledby="backlog-options-attention" sx={{ mt: 3 }}>
          <Typography id="backlog-options-attention" variant="body-md" render={<h3 />} sx={{ fontWeight: 700, mt: 0, mb: 0.5 }}>
            Needs attention
          </Typography>
          <Typography id={AGING_HELP_ID} variant="body-sm" color="text.secondary" sx={{ mb: 2 }}>
            The "Older than" chip highlights bugs that are still New after this many months, so the team can close them or
            confirm they still matter.
          </Typography>
          <AgingMonthsField
            months={backlogOptions.agingMonths}
            onChange={(agingMonths) => onBacklogOptionsChange({ ...backlogOptions, agingMonths })}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
