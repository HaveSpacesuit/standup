import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Typography,
} from '@mui/material'

const COMPACT_ROWS_HELP_ID = 'backlog-compact-rows-help'

type BacklogOptionsDialogProps = {
  open: boolean
  onClose: () => void
  /** The team's compact density, shared with the Development and QA cards. */
  compactRows: boolean
  onCompactRowsChange: (compactRows: boolean) => void
}

export function BacklogOptionsDialog({ open, onClose, compactRows, onCompactRowsChange }: BacklogOptionsDialogProps) {
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
