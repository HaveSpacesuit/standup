import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  MenuItem,
  Select,
  Typography,
  type SelectChangeEvent,
} from '@mui/material'

type PullRequestsOptionsDialogProps = {
  open: boolean
  fullApprovalThreshold: number
  onFullApprovalThresholdChange: (value: number) => void
  onClose: () => void
}

export function PullRequestsOptionsDialog({
  open,
  fullApprovalThreshold,
  onFullApprovalThresholdChange,
  onClose,
}: PullRequestsOptionsDialogProps) {
  const handleFullApprovalThresholdChange = (event: SelectChangeEvent<number>) => {
    onFullApprovalThresholdChange(Number(event.target.value))
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Pull request options</DialogTitle>
      <DialogContent>
        <Typography variant="body-sm" sx={{ fontWeight: 700, mb: 0.75 }}>
          Approvals for full approval
        </Typography>

        <FormControl size="small" fullWidth>
          <Select<number>
            value={fullApprovalThreshold}
            onChange={handleFullApprovalThresholdChange}
          >
            {[0, 1, 2, 3, 4, 5].map((value) => (
              <MenuItem key={`approvals-threshold-${value}`} value={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
