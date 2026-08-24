import { Box, Divider, FormControl, IconButton, MenuItem, Select, Tooltip, Typography, type SelectChangeEvent } from '@mui/material'
import type { ReactNode } from 'react'
import { Icon } from '@stratakit/mui'
import svgUserAdd from '@stratakit/icons/user-add.svg'

export type TeamOption = {
  id: string
  displayName: string
}

type TeamToolbarControlsProps = {
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  children?: ReactNode
}

export function TeamToolbarControls({
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  children,
}: TeamToolbarControlsProps) {
  const hasConfiguredTeams = teamOptions.length > 0

  const handleTeamChange = (event: SelectChangeEvent<string>) => {
    onTeamChange(event.target.value)
  }

  return (
    <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 420 }}>
      <Typography variant="body-sm" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
        Team
      </Typography>

      <FormControl size="small" sx={{ minWidth: 260, flex: 1 }}>
        <Select
          value={hasConfiguredTeams ? selectedTeamId : ''}
          onChange={handleTeamChange}
          displayEmpty
          disabled={!hasConfiguredTeams}
        >
          {hasConfiguredTeams ? teamOptions.map((team) => (
            <MenuItem key={team.id} value={team.id}>
              {team.displayName}
            </MenuItem>
          )) : (
            <MenuItem value="" disabled>
              No teams configured
            </MenuItem>
          )}
        </Select>
      </FormControl>

      <Tooltip title="Manage team">
        <span>
          {hasConfiguredTeams ? (
            <IconButton
              size="small"
              aria-label="Manage team"
              component="a"
              href={teamManagementUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <Icon href={svgUserAdd} />
            </IconButton>
          ) : (
            <IconButton
              size="small"
              aria-label="Manage team"
              disabled
            >
              <Icon href={svgUserAdd} />
            </IconButton>
          )}
        </span>
      </Tooltip>
      <Divider orientation="vertical" flexItem sx={{ borderColor: 'divider' }} />

      {children}
    </Box>
  )
}
