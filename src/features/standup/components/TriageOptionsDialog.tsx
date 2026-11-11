import { useId, useState } from 'react'
import { Alert, Autocomplete, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from '@mui/material'
import type { TeamIterationOption } from '../../../ado/types'
import {
  addTriageTags, MAX_TRIAGE_AGE_FLAG_DAYS, MAX_TRIAGE_CLOSED_DAYS, parseTriageOptions, TRIAGE_CHECK_LABELS, TRIAGE_CHECKS, type TriageCheck,
  type TriageOptions,
} from '../utils/triageOptions'
import { ChipListEditor } from './ChipListEditor'

const CHECK_OPTIONS: TriageCheck[] = [...TRIAGE_CHECKS]

function ReadinessField({ label, value, onChange }: { label: string; value: TriageCheck[]; onChange: (value: TriageCheck[]) => void }) {
  return (
    <Autocomplete
      multiple
      disableCloseOnSelect
      filterSelectedOptions
      options={CHECK_OPTIONS}
      getOptionLabel={(check) => TRIAGE_CHECK_LABELS[check]}
      value={value}
      onChange={(_event, next) => onChange(next)}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  )
}

type Props = {
  options: TriageOptions
  onSave: (options: TriageOptions) => void
  onClose: () => void
  iterations: TeamIterationOption[]
  iterationsLoading: boolean
  iterationsError: string | null
}

export function TriageOptionsDialog({ options, onSave, onClose, iterations, iterationsLoading, iterationsError }: Props) {
  const newBugsHeadingId = useId()
  const readinessHeadingId = useId()
  const similarHeadingId = useId()
  const [tags, setTags] = useState(options.tags)
  const [tagDraft, setTagDraft] = useState('')
  const [includeNewBugs, setIncludeNewBugs] = useState(options.includeNewBugs)
  const [paths, setPaths] = useState(options.excludedIterationPaths)
  const [pathInput, setPathInput] = useState('')
  const [ageFlagInput, setAgeFlagInput] = useState(String(options.ageFlagDays))
  const [waitingTags, setWaitingTags] = useState(options.waitingTags)
  const [waitingDraft, setWaitingDraft] = useState('')
  const [bugChecks, setBugChecks] = useState(options.readinessChecks.bug)
  const [otherChecks, setOtherChecks] = useState(options.readinessChecks.other)
  const [similarOpenBugs, setSimilarOpenBugs] = useState(options.similarItems.openBugs)
  const [similarClosedBugs, setSimilarClosedBugs] = useState(options.similarItems.closedBugs)
  const [closedDaysInput, setClosedDaysInput] = useState(String(options.similarItems.closedDays))
  const [error, setError] = useState<string | null>(null)

  const addTags = () => {
    setTags((current) => addTriageTags(current, tagDraft))
    setTagDraft('')
  }

  const addWaitingTags = () => {
    setWaitingTags((current) => addTriageTags(current, waitingDraft))
    setWaitingDraft('')
  }

  const save = () => {
    try {
      const next = parseTriageOptions({
        tags: addTriageTags(tags, tagDraft),
        includeNewBugs,
        // Paths are kept while the new-bug rule is off, but text typed into the disabled field is not.
        excludedIterationPaths: includeNewBugs ? [...paths, pathInput] : paths,
        ageFlagDays: ageFlagInput.trim() ? Number(ageFlagInput) : Number.NaN,
        readinessChecks: { bug: bugChecks, other: otherChecks },
        waitingTags: addTriageTags(waitingTags, waitingDraft),
        similarItems: {
          openBugs: similarOpenBugs,
          closedBugs: similarClosedBugs,
          // Like the excluded paths, the saved days are kept while closed bugs are off, but an edit to the disabled field is not.
          closedDays: !similarClosedBugs
            ? options.similarItems.closedDays
            : closedDaysInput.trim() ? Number(closedDaysInput) : Number.NaN,
        },
      })
      onSave(next)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="triage-options-heading">
      <DialogTitle id="triage-options-heading">Triage options</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          <Typography variant="body-sm">
            Show unfinished work items with any Triage tag, or bugs still in the state they were filed in.
            Completed and Removed items are always excluded.
          </Typography>
          <ChipListEditor
            heading="Triage tags"
            description="Unfinished work items with any of these whole tags appear. Matching is case-insensitive."
            values={tags}
            onRemove={(tag) => setTags((current) => current.filter((entry) => entry !== tag))}
            draft={tagDraft}
            onDraftChange={setTagDraft}
            onAdd={addTags}
            placeholder="Add tag (for example: Triage)"
            inputLabel="Add Triage tag"
            emptyText="No Triage tags. Tag matching is off."
          />
          <Box role="group" aria-labelledby={newBugsHeadingId}>
            <Typography id={newBugsHeadingId} variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
              New bugs
            </Typography>
            <Typography variant="body-sm" color="text.secondary" sx={{ mb: 0.5 }}>
              Bugs still in their initial state, such as New. Later states such as Approved do not qualify.
            </Typography>
            <FormControlLabel
              control={<Checkbox checked={includeNewBugs} onChange={(event) => setIncludeNewBugs(event.target.checked)} />}
              label="Also include new bugs"
              sx={{ mb: 1.5 }}
            />
            <Autocomplete
              multiple freeSolo
              disabled={!includeNewBugs}
              options={iterations.map((iteration) => iteration.path)}
              loading={iterationsLoading}
              value={paths}
              inputValue={pathInput}
              onInputChange={(_event, value) => setPathInput(value)}
              onChange={(_event, value) => setPaths(value)}
              // StrataKit leaves a disabled chip's remove button working, so the disabled field drops it.
              slotProps={includeNewBugs ? undefined : { chip: { onDelete: undefined } }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Excluded iteration paths"
                  helperText={includeNewBugs
                    ? 'Select or enter full paths. Each path and its descendants are excluded only for new bugs; tagged items still qualify.'
                    : 'Turn on new bugs to use excluded iteration paths. Saved paths are kept.'}
                />
              )}
            />
          </Box>
          {includeNewBugs && iterationsError ? <Alert severity="warning">Unable to load sprint choices: {iterationsError} You can still enter full paths.</Alert> : null}
          <Box role="group" aria-labelledby={readinessHeadingId} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography id={readinessHeadingId} variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
                Readiness checks
              </Typography>
              <Typography variant="body-sm" color="text.secondary">
                Fields to fill in before an item is ready to clear. Leave both empty to hide the Readiness column.
              </Typography>
            </Box>
            <ReadinessField label="Required on bugs" value={bugChecks} onChange={setBugChecks} />
            <ReadinessField label="Required on other types" value={otherChecks} onChange={setOtherChecks} />
          </Box>
          <TextField
            label="Flag age after (working days)"
            type="number"
            value={ageFlagInput}
            onChange={(event) => setAgeFlagInput(event.target.value)}
            helperText={`An item in triage this many working days shows its age in amber (1–${MAX_TRIAGE_AGE_FLAG_DAYS}).`}
            slotProps={{ htmlInput: { min: 1, max: MAX_TRIAGE_AGE_FLAG_DAYS, step: 1 } }}
          />
          <ChipListEditor
            heading="Waiting tags"
            description="Items in triage with any of these tags are waiting on someone else; the tags do not add items. The Inbox groups them under Waiting on others with any reply since, and their age is never flagged."
            values={waitingTags}
            onRemove={(tag) => setWaitingTags((current) => current.filter((entry) => entry !== tag))}
            draft={waitingDraft}
            onDraftChange={setWaitingDraft}
            onAdd={addWaitingTags}
            placeholder="Add tag (for example: Needs Info)"
            inputLabel="Add waiting tag"
            emptyText="No waiting tags. Every item counts as still to triage."
          />
          <Box role="group" aria-labelledby={similarHeadingId}>
            <Typography id={similarHeadingId} variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
              Similar items
            </Typography>
            <Typography variant="body-sm" color="text.secondary" sx={{ mb: 0.5 }}>
              Each item's title is compared with the rest of the queue, and with these, to show its closest match as a
              possible duplicate or, for a closed bug, a possible regression.
            </Typography>
            <FormControlLabel
              control={<Checkbox checked={similarOpenBugs} onChange={(event) => setSimilarOpenBugs(event.target.checked)} />}
              label="Open bugs"
              sx={{ display: 'flex' }}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1 }}>
              <FormControlLabel
                control={<Checkbox checked={similarClosedBugs} onChange={(event) => setSimilarClosedBugs(event.target.checked)} />}
                label="Bugs closed in the last"
                sx={{ mr: 0 }}
              />
              <TextField
                type="number"
                size="small"
                disabled={!similarClosedBugs}
                value={closedDaysInput}
                onChange={(event) => setClosedDaysInput(event.target.value)}
                sx={{ width: 96 }}
                slotProps={{ htmlInput: { min: 1, max: MAX_TRIAGE_CLOSED_DAYS, step: 1, 'aria-label': `Days to look back for closed bugs (1–${MAX_TRIAGE_CLOSED_DAYS})` } }}
              />
              <Typography variant="body-sm" aria-hidden="true">days</Typography>
            </Box>
          </Box>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={save} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  )
}
