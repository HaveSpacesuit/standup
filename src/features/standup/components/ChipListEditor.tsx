import { useId } from 'react'
import { Box, Button, Chip, TextField, Typography } from '@mui/material'

type ChipListEditorProps = {
  /** Names the section and, for assistive technology, the group holding its pills and input. */
  heading: string
  description: string
  values: readonly string[]
  onRemove: (value: string) => void
  /** The text typed but not yet added. The caller owns it so Save can include it. */
  draft: string
  onDraftChange: (draft: string) => void
  /** Adds the draft; the caller trims, splits, and de-duplicates it, then clears the draft. */
  onAdd: () => void
  placeholder: string
  inputLabel: string
  emptyText: string
}

/** A list edited as removable pills over one input and an Add button, laid out like QA's Tag filters. */
export function ChipListEditor({
  heading, description, values, onRemove, draft, onDraftChange, onAdd, placeholder, inputLabel, emptyText,
}: ChipListEditorProps) {
  const headingId = useId()
  return (
    <Box role="group" aria-labelledby={headingId}>
      <Typography id={headingId} variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
        {heading}
      </Typography>
      <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.5 }}>
        {description}
      </Typography>

      {values.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
          {values.map((value) => (
            <Chip key={value} label={value} size="small" variant="outlined" onDelete={() => onRemove(value)} />
          ))}
        </Box>
      ) : (
        <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.5 }}>
          {emptyText}
        </Typography>
      )}

      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 1,
        alignItems: { xs: 'stretch', sm: 'center' },
      }}>
        <TextField
          size="small"
          fullWidth
          placeholder={placeholder}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onAdd()
            }
          }}
          slotProps={{ htmlInput: { 'aria-label': inputLabel } }}
        />
        <Button size="small" variant="outlined" sx={{ width: { xs: '100%', sm: 'auto' } }} onClick={onAdd} disabled={!draft.trim()}>
          Add
        </Button>
      </Box>
    </Box>
  )
}
