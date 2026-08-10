import { Box, Button, FormControl, MenuItem, Select, Typography, type SelectChangeEvent } from '@mui/material'
import type { ReactNode } from 'react'
import { Icon } from '@stratakit/mui'
import svgAssign from '@stratakit/icons/assign.svg'

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
  const handleTeamChange = (event: SelectChangeEvent<string>) => {
    onTeamChange(event.target.value)
  }

  return (
    <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 420 }}>
      <Typography variant="body-sm" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
        Team
      </Typography>

      <FormControl size="small" sx={{ minWidth: 260, flex: 1 }}>
        <Select value={selectedTeamId} onChange={handleTeamChange}>
          {teamOptions.map((team) => (
            <MenuItem key={team.id} value={team.id}>
              {team.displayName}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Button
        size="small"
        variant="outlined"
        component="a"
        href={teamManagementUrl}
        target="_blank"
        rel="noreferrer noopener"
        startIcon={<Icon href={svgAssign} />}
      >
        Manage team
      </Button>

      {children}
    </Box>
  )
}
