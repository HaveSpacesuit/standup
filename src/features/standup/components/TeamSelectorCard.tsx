import { Button, Card, CardContent, FormControl, MenuItem, Select, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import type { SelectChangeEvent } from '@mui/material'
import type { TeamProfile } from '../../../teamProfiles'

type TeamSelectorCardProps = {
  teams: TeamProfile[]
  selectedTeamId: string
  onTeamChange: (event: SelectChangeEvent<string>) => void
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
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body-md" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            Team
          </Typography>
          <FormControl sx={{ minWidth: 260, flex: 1 }}>
            <Select value={selectedTeamId} onChange={onTeamChange}>
              {teams.map((team) => (
                <MenuItem key={team.id} value={team.id}>
                  {team.displayName}
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
