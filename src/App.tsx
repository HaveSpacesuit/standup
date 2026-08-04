import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Toolbar,
  Typography,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgAiSparkle from '@stratakit/icons/ai-sparkle.svg'
import { getAppConfig } from './config'
import { teamProfiles } from './teamProfiles'
import { AdoQueryEngine, type TeamMember, type WorkItemSummary } from './ado/queryEngine'

type AppProps = {
  patConfigured: boolean
}

function App({ patConfigured }: AppProps) {
  const [selectedTeamId, setSelectedTeamId] = useState(teamProfiles[0].id)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [workItems, setWorkItems] = useState<WorkItemSummary[]>([])
  const [workItemsLoading, setWorkItemsLoading] = useState(false)
  const [workItemsError, setWorkItemsError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const forceRefreshRef = useRef(false)
  const selectedTeam =
    teamProfiles.find((team) => team.id === selectedTeamId) ?? teamProfiles[0]
  const isTeamDataLoading = membersLoading || workItemsLoading
  const sortedMembers = useMemo(() => {
    const getFirstName = (displayName: string) => displayName.trim().split(/\s+/)[0] ?? ''

    return [...members].sort((a, b) => {
      const firstNameCompare = getFirstName(a.displayName).localeCompare(getFirstName(b.displayName))
      if (firstNameCompare !== 0) {
        return firstNameCompare
      }

      return a.displayName.localeCompare(b.displayName)
    })
  }, [members])
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

  useEffect(() => {
    if (!adoQueryEngine) {
      setMembers([])
      setMembersError(null)
      setMembersLoading(false)
      setWorkItems([])
      setWorkItemsError(null)
      setWorkItemsLoading(false)
      return
    }

    const abortController = new AbortController()
    const forceRefresh = forceRefreshRef.current
    forceRefreshRef.current = false

    setMembersLoading(true)
    setMembersError(null)
    setWorkItemsLoading(true)
    setWorkItemsError(null)

    adoQueryEngine
      .getTeamMembers(selectedTeam, abortController.signal, { forceRefresh })
      .then((teamMembers) => {
        if (abortController.signal.aborted) {
          return
        }

        setMembers(teamMembers)
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted || (error as Error).name === 'AbortError') {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Unknown error while loading team members.'
        setMembersError(message)
        setMembers([])
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setMembersLoading(false)
        }
      })

    adoQueryEngine
      .getWorkItemsForCurrentAndNextIteration(selectedTeam, abortController.signal, { forceRefresh })
      .then((items) => {
        if (abortController.signal.aborted) {
          return
        }

        setWorkItems(items)
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted || (error as Error).name === 'AbortError') {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Unknown error while loading work items.'
        setWorkItemsError(message)
        setWorkItems([])
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setWorkItemsLoading(false)
        }
      })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, selectedTeam, reloadNonce])

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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="body-md" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                Team
              </Typography>
              <FormControl sx={{ minWidth: 260, flex: 1 }}>
                <Select value={selectedTeamId} onChange={handleTeamChange}>
                  {teamProfiles.map((team) => (
                    <MenuItem key={team.id} value={team.id}>
                      {team.displayName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                onClick={handleRefresh}
                disabled={!patConfigured || isTeamDataLoading}
              >
                Refresh
              </Button>
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="body-md" sx={{ fontWeight: 700, mb: 1 }}>
              Team Members
            </Typography>

            {!patConfigured ? (
              <Typography variant="body-sm" color="text.secondary">
                Add AZDO_PAT in .env.local to load team members.
              </Typography>
            ) : null}

            {patConfigured && isTeamDataLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={18} />
                <Typography variant="body-sm" color="text.secondary">
                  Loading team data...
                </Typography>
              </Box>
            ) : null}

            {patConfigured && !isTeamDataLoading && membersError ? (
              <Typography variant="body-sm" color="error.main">
                {membersError}
              </Typography>
            ) : null}

            {patConfigured && !isTeamDataLoading && !membersError ? (
              sortedMembers.length > 0 ? (
                <List sx={{ py: 0 }}>
                  {sortedMembers.map((member) => {
                    const key = member.descriptor ?? member.uniqueName ?? member.id ?? member.displayName
                    return (
                      <ListItem key={key} disableGutters>
                        <ListItemAvatar>
                          <Avatar alt={member.displayName} src={member.imageUrl} />
                        </ListItemAvatar>
                        <ListItemText
                          primary={member.displayName}
                          secondary={member.uniqueName}
                        />
                      </ListItem>
                    )
                  })}
                </List>
              ) : (
                <Typography variant="body-sm" color="text.secondary">
                  No team members returned for this team.
                </Typography>
              )
            ) : null}
          </CardContent>
        </Card>

        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="body-md" sx={{ fontWeight: 700, mb: 1 }}>
              Work Items
            </Typography>

            {!patConfigured ? (
              <Typography variant="body-sm" color="text.secondary">
                Add AZDO_PAT in .env.local to load work items.
              </Typography>
            ) : null}

            {patConfigured && isTeamDataLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={18} />
                <Typography variant="body-sm" color="text.secondary">
                  Loading team data...
                </Typography>
              </Box>
            ) : null}

            {patConfigured && !isTeamDataLoading && workItemsError ? (
              <Typography variant="body-sm" color="error.main">
                {workItemsError}
              </Typography>
            ) : null}

            {patConfigured && !isTeamDataLoading && !workItemsError ? (
              workItems.length > 0 ? (
                <List sx={{ py: 0 }}>
                  {workItems.map((item) => (
                    <ListItem key={item.id} disableGutters>
                      <ListItemText primary={item.title} secondary={`#${item.id}`} />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body-sm" color="text.secondary">
                  No work items returned for current or next iteration.
                </Typography>
              )
            ) : null}
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

      </Box>
    </Box>
  )
}

export default App
