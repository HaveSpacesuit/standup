import { Box, Divider, FormControl, MenuItem, Select, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Icon } from '@stratakit/mui'
import svgUserAdd from '@stratakit/icons/user-add.svg'
import { getTeamProfileLabel, type TeamProfile } from '../../../appSettings'
import { readStringSelectValue } from '../utils/selectValues'
import { visuallyHiddenSx } from './developmentCardDisplay'

export type TeamOption = TeamProfile

/** Select value of the "Manage team" menu entry; picking it opens Azure DevOps instead of switching teams. */
const MANAGE_TEAM_VALUE = '__manage-team__'

/** Select clones every child into an option, so this drops the injected props to stay a plain separator. */
function TeamMenuSeparator() {
  return <Divider component="li" role="separator" />
}

type TeamToolbarControlsProps = {
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  beforeChildren?: ReactNode
  children?: ReactNode
}

export function TeamToolbarControls({
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  beforeChildren,
  children,
}: TeamToolbarControlsProps) {
  const hasConfiguredTeams = teamOptions.length > 0
  const selectedTeam = teamOptions.find((team) => team.id === selectedTeamId)

  const handleTeamChange = (value: unknown) => {
    const teamId = readStringSelectValue(value)
    if (teamId === MANAGE_TEAM_VALUE) {
      window.open(teamManagementUrl, '_blank', 'noopener,noreferrer')
      return
    }

    onTeamChange(teamId)
  }

  return (
    <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flexShrink: 1 }}>
      {beforeChildren}
      <Typography
        variant="body-sm"
        sx={{
          fontWeight: 700,
          whiteSpace: 'nowrap',
          '@container (max-width: 960px)': {
            display: 'none',
          },
        }}
      >
        Team
      </Typography>

      <FormControl
        size="small"
        sx={{
          minWidth: 90,
          maxWidth: 270,
          flex: '1 1 auto',
        }}
      >
        <Select
          aria-label="Team"
          value={hasConfiguredTeams ? selectedTeamId : ''}
          renderValue={selectedTeam ? () => selectedTeam.displayName : undefined}
          onChange={(event) => handleTeamChange(event.target.value)}
          displayEmpty
          disabled={!hasConfiguredTeams}
        >
          {hasConfiguredTeams ? [
            ...teamOptions.map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {getTeamProfileLabel(team)}
              </MenuItem>
            )),
            <TeamMenuSeparator key="manage-team-separator" />,
            <MenuItem key={MANAGE_TEAM_VALUE} value={MANAGE_TEAM_VALUE}>
              <Icon href={svgUserAdd} />
              Manage team
              <Box component="span" sx={visuallyHiddenSx}> (opens in a new tab)</Box>
            </MenuItem>,
          ] : (
            <MenuItem value="" disabled>
              No teams configured
            </MenuItem>
          )}
        </Select>
      </FormControl>

      <Divider
        orientation="vertical"
        flexItem
        sx={{
          borderColor: 'divider',
          '@container (max-width: 600px)': {
            display: 'none',
          },
        }}
      />

      {children}
    </Box>
  )
}
