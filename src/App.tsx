import { useState } from 'react'
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Toolbar,
  Typography,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgAdd from '@stratakit/icons/add.svg'
import svgCheckmark from '@stratakit/icons/checkmark.svg'
import svgClock from '@stratakit/icons/clock.svg'
import svgChat from '@stratakit/icons/chat.svg'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgAiSparkle from '@stratakit/icons/ai-sparkle.svg'
import { teamProfiles } from './teamProfiles'

const standupSections = [
  {
    title: 'Yesterday',
    icon: svgCheckmark,
    placeholder: 'What did you accomplish yesterday?',
  },
  {
    title: 'Today',
    icon: svgClock,
    placeholder: 'What will you work on today?',
  },
  {
    title: 'Blockers',
    icon: svgChat,
    placeholder: 'Any impediments or blockers?',
  },
]

type AppProps = {
  patConfigured: boolean
}

function App({ patConfigured }: AppProps) {
  const [selectedTeamId, setSelectedTeamId] = useState(teamProfiles[0].id)
  const selectedTeam =
    teamProfiles.find((team) => team.id === selectedTeamId) ?? teamProfiles[0]

  const handleTeamChange = (event: SelectChangeEvent<string>) => {
    setSelectedTeamId(event.target.value)
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <Icon href={svgCalendar} />
          <Typography variant="body-lg" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Daily Standup
          </Typography>
          <Icon href={svgAiSparkle} />
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <FormControl fullWidth>
              <InputLabel id="team-select-label">Team</InputLabel>
              <Select
                labelId="team-select-label"
                value={selectedTeamId}
                label="Team"
                onChange={handleTeamChange}
              >
                {teamProfiles.map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.displayName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ mt: 2, display: 'grid', gap: 0.5 }}>
              <Typography variant="body-sm">
                <strong>Area Path:</strong> {selectedTeam.areaPath}
              </Typography>
              <Typography variant="body-sm">
                <strong>Iteration Path:</strong> {selectedTeam.iterationPath}
              </Typography>
              <Typography variant="body-sm">
                <strong>Team Name:</strong> {selectedTeam.teamName}
              </Typography>
              <Typography variant="body-sm">
                <strong>Repo Name:</strong> {selectedTeam.repoName}
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {!patConfigured ? (
          <Card
            sx={{
              mb: 2,
              border: '1px solid',
              borderColor: 'warning.outline',
              bgcolor: 'warning.background',
            }}
          >
            <CardContent>
              <Typography variant="body-md" sx={{ fontWeight: 700 }}>
                Azure DevOps PAT: Missing
              </Typography>
              <Typography variant="body-sm" color="text.secondary">
                Update AZDO_PAT in .env.local, then restart npm run dev.
              </Typography>
            </CardContent>
          </Card>
        ) : null}

        <Box
          sx={{
            mb: 3,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="body-lg" sx={{ fontWeight: 700 }}>
            Today's Standup
          </Typography>
          <Button variant="contained" startIcon={<Icon href={svgAdd} />}>
            New Entry
          </Button>
        </Box>

        <Box sx={{ display: 'grid', gap: 2 }}>
          {standupSections.map(({ title, icon, placeholder }) => (
            <Card key={title}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Icon href={icon} />
                  <Typography variant="body-md" sx={{ fontWeight: 700 }}>
                    {title}
                  </Typography>
                </Box>
                <Typography variant="body-sm" color="text.secondary">
                  {placeholder}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

export default App
