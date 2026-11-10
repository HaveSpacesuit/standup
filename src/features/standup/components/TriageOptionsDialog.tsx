import { useId, useState } from 'react'
import { Alert, Autocomplete, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField, Typography } from '@mui/material'
import type { TeamIterationOption } from '../../../ado/types'
import { addTriageTags, parseTriageOptions, type TriageOptions } from '../utils/triageOptions'
import { ChipListEditor } from './ChipListEditor'

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
  const [tags, setTags] = useState(options.tags)
  const [tagDraft, setTagDraft] = useState('')
  const [includeNewBugs, setIncludeNewBugs] = useState(options.includeNewBugs)
  const [paths, setPaths] = useState(options.excludedIterationPaths)
  const [pathInput, setPathInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const addTags = () => {
    setTags((current) => addTriageTags(current, tagDraft))
    setTagDraft('')
  }

  const save = () => {
    try {
      const next = parseTriageOptions({
        tags: addTriageTags(tags, tagDraft),
        includeNewBugs,
        // Paths are kept while the new-bug rule is off, but text typed into the disabled field is not.
        excludedIterationPaths: includeNewBugs ? [...paths, pathInput] : paths,
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
