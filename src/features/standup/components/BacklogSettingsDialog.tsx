import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'

type BacklogSettingsDialogProps = {
  open: boolean
  onClose: () => void
}

/** Placeholder until we know whether the Backlog page needs any settings. */
export function BacklogSettingsDialog({ open, onClose }: BacklogSettingsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Backlog settings</DialogTitle>
      <DialogContent>
        <Typography variant="body-sm" color="text.secondary">
          The Backlog page has no settings yet.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
