import { Button, Card, CardContent, FormControl, MenuItem, Select, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { getTeamProfileLabel, type TeamProfile } from '../../../appSettings'
import { readStringSelectValue } from '../utils/selectValues'

type TeamSelectorCardProps = {
  teams: TeamProfile[]
  selectedTeamId: string
  onTeamChange: (teamId: string) => void
  onRefresh: () => void
  refreshDisabled: boolean
}

export function TeamSelectorCard({
  teams,
  selectedTeamId,
  onTeamChange,
  onRefresh,
  refreshDisabled,
}: TeamSelectorCardProps) {
  const selectedTeam = teams.find((team) => team.id === selectedTeamId)

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body-md" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            Team
          </Typography>
          <FormControl sx={{ minWidth: 260, flex: 1 }}>
            <Select
              aria-label="Team"
              value={selectedTeamId}
              onChange={(event) => onTeamChange(readStringSelectValue(event.target.value))}
              renderValue={selectedTeam ? () => selectedTeam.displayName : undefined}
            >
              {teams.map((team) => (
                <MenuItem key={team.id} value={team.id}>
                  {getTeamProfileLabel(team)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="outlined" onClick={onRefresh} disabled={refreshDisabled}>
            Refresh
          </Button>
        </Box>
      </CardContent>
    </Card>
  )
}
