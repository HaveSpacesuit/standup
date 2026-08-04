import { useMemo, useRef, useState } from 'react'
import { AppBar, Box, Card, CardContent, Toolbar, Typography, type SelectChangeEvent } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgAiSparkle from '@stratakit/icons/ai-sparkle.svg'
import { getAppConfig } from './config'
import { teamProfiles } from './teamProfiles'
import { AdoQueryEngine } from './ado/queryEngine'
import { TeamSelectorCard } from './features/standup/components/TeamSelectorCard'
import { TeamMembersCard } from './features/standup/components/TeamMembersCard'
import { WorkItemsCard } from './features/standup/components/WorkItemsCard'
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
        <Toolbar sx={{ gap: 1 }}>
          <Icon href={svgCalendar} />
          <Typography variant="body-lg" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Daily Standup
          </Typography>
          <Icon href={svgAiSparkle} />
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
        <TeamSelectorCard
          teams={teamProfiles}
          selectedTeamId={selectedTeamId}
          onTeamChange={handleTeamChange}
          onRefresh={handleRefresh}
          refreshDisabled={!patConfigured || isTeamDataLoading}
        />

        <TeamMembersCard
          patConfigured={patConfigured}
          isLoading={isTeamDataLoading}
          membersError={membersError}
          members={members}
        />

        <WorkItemsCard
          patConfigured={patConfigured}
          isLoading={isTeamDataLoading}
          workItemsError={workItemsError}
          assigneesError={assigneesError}
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
