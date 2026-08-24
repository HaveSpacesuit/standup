import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { REQUIRED_PAT_SCOPES } from '../../../adoAuth'

type PatEntryDialogProps = {
  open: boolean
  onPatSave: (pat: string) => void
}

export function PatEntryDialog({ open, onPatSave }: PatEntryDialogProps) {
  const [patValue, setPatValue] = useState('')
  const [patError, setPatError] = useState<string | null>(null)

  const handleSave = () => {
    const trimmed = patValue.trim()
    if (!trimmed) {
      setPatError('Azure DevOps PAT is required.')
      return
    }

    onPatSave(trimmed)
    setPatValue('')
    setPatError(null)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSave()
    }
  }

  return (
    <Dialog
      open={open}
      // Prevent closing without entering a PAT
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return
      }}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Azure DevOps access</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body-sm" color="text.secondary">
            Paste your Azure DevOps personal access token to load standup data. The token will be
            kept for this browser session only.
          </Typography>

          {patError ? <Alert severity="error">{patError}</Alert> : null}

          <TextField
            label="Personal access token"
            type="password"
            value={patValue}
            onChange={(event) => {
              setPatValue(event.target.value)
              setPatError(null)
            }}
            onKeyDown={handleKeyDown}
            fullWidth
            placeholder="Paste your Azure DevOps PAT"
            autoFocus
          />

          <Box>
            <Typography variant="body-sm" sx={{ fontWeight: 700, mb: 0.5 }}>
              Required PAT scopes
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary' }}>
              {REQUIRED_PAT_SCOPES.map((scope) => (
                <Typography key={scope} component="li" variant="body-sm">
                  {scope}
                </Typography>
              ))}
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button variant="contained" onClick={handleSave}>
          Save PAT
        </Button>
      </DialogActions>
    </Dialog>
  )
}
