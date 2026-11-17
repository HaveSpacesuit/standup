import { useState } from 'react'
import { Box, Button, Chip, TextField, Typography } from '@mui/material'
import { DEFAULT_EFFORT_SUGGESTIONS, MAX_EFFORT_SUGGESTIONS, parseEffortSuggestions } from '../utils/assignmentOptions'

type EffortSuggestionsEditorProps = {
  value: number[]
  onChange: (next: number[]) => void
}

const EFFORT_SUGGESTIONS_HELP_ID = 'effort-suggestions-help'

const sameValues = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, index) => value === b[index])

/** Edits the team's effort suggestions, the values offered as one-click choices when editing a work item's Effort. */
export function EffortSuggestionsEditor({ value, onChange }: EffortSuggestionsEditorProps) {
  const [input, setInput] = useState('')
  const candidate = Number(input)
  const full = value.length >= MAX_EFFORT_SUGGESTIONS
  const canAdd = input.trim() !== '' && Number.isFinite(candidate) && candidate > 0 && !value.includes(candidate) && !full

  const add = () => {
    if (!canAdd) return
    onChange(parseEffortSuggestions([...value, candidate]))
    setInput('')
  }

  return (
    <>
      <Typography variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
        Effort suggestions
      </Typography>
      <Typography id={EFFORT_SUGGESTIONS_HELP_ID} variant="body-sm" color="text.secondary" sx={{ mb: 1.5 }}>
        The Effort values offered as one-click choices when editing a work item, on every page. Any other value can still be typed. Up to {MAX_EFFORT_SUGGESTIONS} values.
      </Typography>

      <Box role="list" aria-label="Effort suggestions" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.25 }}>
        {value.map((effort) => (
          <Box role="listitem" key={effort}>
            <Chip
              label={effort}
              size="small"
              variant="outlined"
              aria-label={value.length > 1 ? `Effort suggestion ${effort}. Press Delete to remove.` : `Effort suggestion ${effort}`}
              // At least one suggestion stays; removing the last would restore the defaults.
              onDelete={value.length > 1 ? () => onChange(value.filter((entry) => entry !== effort)) : undefined}
            />
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          type="number"
          label="Add a value"
          value={input}
          disabled={full}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
          slotProps={{ htmlInput: { min: 0, step: 'any', 'aria-describedby': EFFORT_SUGGESTIONS_HELP_ID } }}
          sx={{ maxWidth: 160 }}
        />
        <Button size="small" variant="outlined" onClick={add} disabled={!canAdd}>
          Add
        </Button>
        <Button
          size="small"
          onClick={() => onChange([...DEFAULT_EFFORT_SUGGESTIONS])}
          disabled={sameValues(value, DEFAULT_EFFORT_SUGGESTIONS)}
        >
          Restore defaults ({DEFAULT_EFFORT_SUGGESTIONS.join(', ')})
        </Button>
      </Box>
    </>
  )
}
