import { useState } from 'react'
import { Alert, Box, FormControlLabel, Switch, TextField, Typography } from '@mui/material'
import { isValidRefreshMinutes, type AutoRefreshOptions } from '../utils/autoRefresh'

type Props = {
  options: AutoRefreshOptions
  error: string | null
  onChange: (options: AutoRefreshOptions) => void
}

export function AutoRefreshSettings({ options, error, onChange }: Props) {
  const [minutes, setMinutes] = useState(String(options.minutes))
  const valid = minutes.trim() !== '' && isValidRefreshMinutes(Number(minutes))
  return (
    <Box>
      <FormControlLabel
        sx={{ m: 0 }}
        control={(
          <Switch
            size="small"
            checked={options.enabled}
            onChange={(_event, enabled) => onChange({ ...options, enabled })}
            slotProps={{ input: { 'aria-describedby': 'settings-auto-refresh-help' } }}
          />
        )}
        label={<Typography variant="body-sm">Auto-refresh current page</Typography>}
      />
      <Typography id="settings-auto-refresh-help" variant="body-sm" color="text.secondary" sx={{ mt: 0.5 }}>
        Refresh only the current page when its data reaches this age. Opening another page refreshes it if its data is already older.
      </Typography>
      {options.enabled && (
        <TextField
          label="Refresh interval (minutes)"
          type="number"
          size="small"
          value={minutes}
          error={!valid}
          helperText={!valid ? 'Enter a whole number of minutes greater than 0.' : undefined}
          slotProps={{ htmlInput: { min: 1, step: 1, 'aria-describedby': 'settings-auto-refresh-help' } }}
          onChange={(event) => {
            const input = event.target.value
            setMinutes(input)
            if (input.trim() && isValidRefreshMinutes(Number(input))) onChange({ ...options, minutes: Number(input) })
          }}
          sx={{ mt: 2 }}
        />
      )}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  )
}
