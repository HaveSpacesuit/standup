import { useMemo, useRef, useState } from 'react'
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  MenuItem,
  Select,
  Toolbar,
  Typography,
  type SelectChangeEvent,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import { getAppConfig } from './config'
import { teamProfiles } from './teamProfiles'
import { AdoQueryEngine } from './ado/queryEngine'
import { KanbanBoard } from './features/standup/components/KanbanBoard'
import { useTeamData } from './features/standup/hooks/useTeamData'
import { useWorkItemAssignees } from './features/standup/hooks/useWorkItemAssignees'

type AppProps = {
  patConfigured: boolean
}

function App({ patConfigured }: AppProps) {
  const [selectedTeamId, setSelectedTeamId] = useState(teamProfiles[0].id)
  const [reloadNonce, setReloadNonce] = useState(0)
  const forceRefreshRef = useRef(false)
  const selectedTeam =
    teamProfiles.find((team) => team.id === selectedTeamId) ?? teamProfiles[0]

  const adoQueryEngine = useMemo(() => {
    if (!patConfigured) {
      return null
    }

    const config = getAppConfig()
    return new AdoQueryEngine(config.azdoPat, config.azdoApiVersion)
  }, [patConfigured])

  const handleTeamChange = (event: SelectChangeEvent<string>) => {
    setSelectedTeamId(event.target.value)
  }

  const handleRefresh = () => {
    forceRefreshRef.current = true
    setReloadNonce((current) => current + 1)
  }

  const {
    members,
    membersLoading,
    membersError,
    workItems,
    workItemsLoading,
    workItemsError,
  } = useTeamData({
    adoQueryEngine,
    selectedTeam,
    reloadNonce,
    forceRefreshRef,
  })

  const { workItemAssignees, assigneesLoading, assigneesError } = useWorkItemAssignees({
    adoQueryEngine,
    orgName: selectedTeam.orgName,
    members,
    membersLoading,
    membersError,
    workItems,
    workItemsLoading,
    workItemsError,
  })

  const isTeamDataLoading = membersLoading || workItemsLoading || assigneesLoading

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1.5 }}>
          <Icon href={svgCalendar} />
          <Typography variant="body-lg" sx={{ fontWeight: 700 }}>
            Team Standup
          </Typography>

          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 420 }}>
            <Typography variant="body-sm" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
              Team
            </Typography>

            <FormControl size="small" sx={{ minWidth: 260, flex: 1 }}>
              <Select value={selectedTeamId} onChange={handleTeamChange}>
                {teamProfiles.map((team) => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.displayName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
                size="small"
                variant="outlined"
                startIcon={<Icon href={svgCloudSync} />}
              onClick={handleRefresh}
              disabled={!patConfigured || isTeamDataLoading}
            >
              Refresh
            </Button>
          </Box>

        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ p: 2.5 }}>

        <KanbanBoard
          patConfigured={patConfigured}
          isLoading={isTeamDataLoading}
          membersError={membersError}
          workItemsError={workItemsError}
          assigneesError={assigneesError}
          members={members}
          workItems={workItems}
          workItemAssignees={workItemAssignees}
        />

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

      </Box>
    </Box>
  )
}

export default App
