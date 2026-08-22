import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import { unstable_NavigationRail as NavigationRail } from '@stratakit/structures'
import svgUsers from '@stratakit/icons/users.svg'
import svgClipboard from '@stratakit/icons/clipboard.svg'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgConfiguration from '@stratakit/icons/configuration.svg'
import { REQUIRED_PAT_SCOPES } from '../../../adoAuth'
import type { TeamProfile } from '../../../teamConfig'
import type { AppView } from '../hooks/useAppNavigation'

type AppNavigationRailProps = {
  activeView: AppView
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
  patConfigured: boolean
  patValue: string
  rememberPatOnThisMachine: boolean
  onPatSave: (pat: string, rememberOnThisMachine: boolean) => void
  onPatClear: () => void
  selectedTeamId: string
  teamProfiles: TeamProfile[]
  onTeamProfilesChange: (teamProfiles: TeamProfile[]) => void
}

type SettingsTab = 'azure-devops' | 'teams' | 'display'

const EMPTY_TEAM_PROFILE_FIELDS = {
  orgName: '',
  projectName: '',
  displayName: '',
  areaPath: '',
  iterationPath: '',
  teamName: '',
  repoName: '',
}

type TeamProfileFormField = keyof typeof EMPTY_TEAM_PROFILE_FIELDS

function createDraftTeamProfile(): TeamProfile {
  return {
    id: `team-${crypto.randomUUID()}`,
    ...EMPTY_TEAM_PROFILE_FIELDS,
  }
}

function validateTeamProfile(teamProfile: TeamProfile): string | null {
  const requiredFields: Array<[keyof typeof EMPTY_TEAM_PROFILE_FIELDS, string]> = [
    ['displayName', 'Display name'],
    ['orgName', 'Organization'],
    ['projectName', 'Project'],
    ['teamName', 'Azure DevOps team name'],
    ['repoName', 'Repository name'],
    ['areaPath', 'Area path'],
    ['iterationPath', 'Iteration path'],
  ]

  const missingField = requiredFields.find(([field]) => !teamProfile[field].trim())
  return missingField ? `${missingField[1]} is required.` : null
}

function resolveEditableTeamProfile(teamProfiles: TeamProfile[], selectedTeamId: string): TeamProfile {
  return teamProfiles.find((team) => team.id === selectedTeamId) ?? teamProfiles[0] ?? createDraftTeamProfile()
}

export function AppNavigationRail({
  activeView,
  colorScheme,
  onToggleColorScheme,
  patConfigured,
  patValue,
  rememberPatOnThisMachine,
  onPatSave,
  onPatClear,
  selectedTeamId,
  teamProfiles,
  onTeamProfilesChange,
}: AppNavigationRailProps) {
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string>(selectedTeamId)
  const [draftTeamProfile, setDraftTeamProfile] = useState<TeamProfile>(() => resolveEditableTeamProfile(teamProfiles, selectedTeamId))
  const [isCreatingTeam, setIsCreatingTeam] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [draftPatValue, setDraftPatValue] = useState(patValue)
  const [draftRememberPat, setDraftRememberPat] = useState(rememberPatOnThisMachine)
  const [patError, setPatError] = useState<string | null>(null)
  const [hasAutoOpenedForMissingPat, setHasAutoOpenedForMissingPat] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTab>('azure-devops')

  useEffect(() => {
    if (patConfigured || hasAutoOpenedForMissingPat) {
      return
    }

    setIsSettingsDialogOpen(true)
    setHasAutoOpenedForMissingPat(true)
  }, [hasAutoOpenedForMissingPat, patConfigured])

  useEffect(() => {
    if (!isSettingsDialogOpen) {
      return
    }

    const activeTeamProfile = resolveEditableTeamProfile(teamProfiles, selectedTeamId)
    setEditingTeamId(activeTeamProfile.id)
    setDraftTeamProfile(activeTeamProfile)
    setIsCreatingTeam(false)
    setTeamError(null)
    setDraftPatValue(patValue)
    setDraftRememberPat(rememberPatOnThisMachine)
    setPatError(null)
    setActiveTab('azure-devops')
  }, [isSettingsDialogOpen, patValue, rememberPatOnThisMachine, selectedTeamId, teamProfiles])

  const handleTeamSelection = (teamId: string) => {
    const nextTeamProfile = teamProfiles.find((team) => team.id === teamId)
    if (!nextTeamProfile) {
      return
    }

    setEditingTeamId(teamId)
    setDraftTeamProfile(nextTeamProfile)
    setIsCreatingTeam(false)
    setTeamError(null)
  }

  const handleDraftFieldChange = (field: TeamProfileFormField, value: string) => {
    setDraftTeamProfile((current) => ({
      ...current,
      [field]: value,
    }))
    setTeamError(null)
  }

  const handleAddTeam = () => {
    const nextDraft = createDraftTeamProfile()
    setEditingTeamId(nextDraft.id)
    setDraftTeamProfile(nextDraft)
    setIsCreatingTeam(true)
    setTeamError(null)
  }

  const handleSavePat = () => {
    const trimmedPat = draftPatValue.trim()
    if (!trimmedPat) {
      setPatError('Azure DevOps PAT is required.')
      return
    }

    onPatSave(trimmedPat, draftRememberPat)
    setDraftPatValue(trimmedPat)
    setPatError(null)
  }

  const handleClearPat = () => {
    onPatClear()
    setDraftPatValue('')
    setDraftRememberPat(false)
    setPatError(null)
  }

  const handleSaveTeam = () => {
    const trimmedTeamProfile: TeamProfile = {
      ...draftTeamProfile,
      displayName: draftTeamProfile.displayName.trim(),
      orgName: draftTeamProfile.orgName.trim(),
      projectName: draftTeamProfile.projectName.trim(),
      teamName: draftTeamProfile.teamName.trim(),
      repoName: draftTeamProfile.repoName.trim(),
      areaPath: draftTeamProfile.areaPath.trim(),
      iterationPath: draftTeamProfile.iterationPath.trim(),
    }

    const validationError = validateTeamProfile(trimmedTeamProfile)
    if (validationError) {
      setTeamError(validationError)
      return
    }

    const nextTeamProfiles = isCreatingTeam
      ? [...teamProfiles, trimmedTeamProfile]
      : teamProfiles.map((team) => (team.id === trimmedTeamProfile.id ? trimmedTeamProfile : team))

    onTeamProfilesChange(nextTeamProfiles)
    setEditingTeamId(trimmedTeamProfile.id)
    setDraftTeamProfile(trimmedTeamProfile)
    setIsCreatingTeam(false)
    setTeamError(null)
  }

  const handleRemoveTeam = () => {
    if (isCreatingTeam) {
      const fallbackTeam = resolveEditableTeamProfile(teamProfiles, selectedTeamId)
      setEditingTeamId(fallbackTeam.id)
      setDraftTeamProfile(fallbackTeam)
      setIsCreatingTeam(false)
      setTeamError(null)
      return
    }

    if (teamProfiles.length === 1) {
      setTeamError('Keep at least one team configured. Edit the current team instead of removing it.')
      return
    }

    const nextTeamProfiles = teamProfiles.filter((team) => team.id !== draftTeamProfile.id)
    onTeamProfilesChange(nextTeamProfiles)

    const fallbackTeam = resolveEditableTeamProfile(nextTeamProfiles, selectedTeamId)
    setEditingTeamId(fallbackTeam.id)
    setDraftTeamProfile(fallbackTeam)
    setIsCreatingTeam(false)
    setTeamError(null)
  }

  return (
    <NavigationRail.Root>
      <NavigationRail.Header>
        <Icon href={`${svgCalendar}#icon-large`} alt="Standup app" size="large" />
        <NavigationRail.ToggleButton />
      </NavigationRail.Header>

      <NavigationRail.Content>
        <NavigationRail.List>
          <NavigationRail.ListItem>
            <NavigationRail.Anchor
              href="#team-assignments"
              label="Team assignments"
              icon={`${svgUsers}#icon-large`}
              active={activeView === 'team-assignments'}
            />
          </NavigationRail.ListItem>
          <NavigationRail.ListItem>
            <NavigationRail.Anchor
              href="#qa-activity"
              label="Quality assurance"
              icon={`${svgClipboard}#icon-large`}
              active={activeView === 'qa-activity'}
            />
          </NavigationRail.ListItem>
        </NavigationRail.List>
        <NavigationRail.Footer>
          <NavigationRail.ListItem>
            <NavigationRail.Button
              icon={`${svgConfiguration}#icon-large`}
              label="Settings"
              onClick={() => setIsSettingsDialogOpen(true)}
            />
          </NavigationRail.ListItem>
        </NavigationRail.Footer>
      </NavigationRail.Content>

      <Dialog open={isSettingsDialogOpen} onClose={() => setIsSettingsDialogOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>Settings</DialogTitle>
      <DialogContent sx={{ display: 'flex', gap: 2, pt: 1, minHeight: 420 }}>
        <Tabs
            orientation="vertical"
            value={activeTab}
            onChange={(_event, value: SettingsTab) => setActiveTab(value)}
            sx={{
              borderRight: 1,
              borderColor: 'divider',
              minWidth: 140,
              flexShrink: 0,
              '& .MuiTabs-flexContainer': {
                alignItems: 'stretch',
              },
              '& .MuiTab-root': {
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                textAlign: 'left',
                textTransform: 'none',
                minHeight: 44,
                px: 1.5,
              },
            }}
          >
            <Tab label="ADO" value="azure-devops" />
            <Tab label="Teams" value="teams" />
            <Tab label="Display" value="display" />
          </Tabs>

          <Box sx={{ flex: 1, minWidth: 0, maxHeight: 480, overflowY: 'auto', pr: 0.5 }}>
            {activeTab === 'azure-devops' ? (
              <Stack spacing={1.5}>
                {!patConfigured ? (
                  <Alert severity="warning">
                    Add an Azure DevOps personal access token to load standup data in this browser.
                  </Alert>
                ) : null}

                <Box>
                  <Typography variant="body-md" component="h2" sx={{ mb: 0.5, fontWeight: 700 }}>
                    Azure DevOps access
                  </Typography>
                  <Typography variant="body-sm" color="text.secondary">
                    Paste your own Azure DevOps PAT. Leave &quot;Remember on this machine&quot; off to keep it only for this browser session.
                  </Typography>
                </Box>

                {patError ? <Alert severity="error">{patError}</Alert> : null}

                <TextField
                  label="Personal access token"
                  type="password"
                  value={draftPatValue}
                  onChange={(event) => {
                    setDraftPatValue(event.target.value)
                    setPatError(null)
                  }}
                  fullWidth
                  placeholder="Paste your Azure DevOps PAT"
                />

                <FormControlLabel
                  sx={{ m: 0 }}
                  control={(
                    <Switch
                      size="small"
                      checked={draftRememberPat}
                      onChange={(event) => setDraftRememberPat(event.target.checked)}
                    />
                  )}
                  label={<Typography variant="body-sm">Remember on this machine</Typography>}
                />

                <Box>
                  <Typography variant="body-sm" sx={{ fontWeight: 700, mb: 0.5 }}>
                    Required PAT scopes
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary' }}>
                    {REQUIRED_PAT_SCOPES.map((scope) => (
                      <Typography key={scope} component="li" variant="body-sm">
                        {scope}
                      </Typography>
                    ))}
                  </Box>
                </Box>

                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="contained" onClick={handleSavePat}>
                    Save PAT
                  </Button>
                  <Button size="small" color="error" onClick={handleClearPat}>
                    Clear PAT
                  </Button>
                </Stack>

                {patConfigured ? (
                  <Typography variant="body-sm" color="text.secondary">
                    Current storage: {draftRememberPat ? 'remembered on this machine' : 'browser session only'}.
                  </Typography>
                ) : null}
              </Stack>
            ) : null}

            {activeTab === 'teams' ? (
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="body-md" component="h2" sx={{ mb: 0.5, fontWeight: 700 }}>
                    Teams
                  </Typography>
                  <Typography variant="body-sm" color="text.secondary">
                    Team settings are stored in this browser&apos;s local storage.
                  </Typography>
                </Box>

                {teamError ? <Alert severity="error">{teamError}</Alert> : null}

                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: '240px minmax(0, 1fr)',
                    },
                  }}
                >
                  <Stack spacing={1.25}>
                    <Button variant="outlined" onClick={handleAddTeam}>
                      Add team
                    </Button>

                    <List sx={{ border: 1, borderColor: 'divider', borderRadius: 1, py: 0, overflow: 'hidden', width: '100%' }}>
                      {teamProfiles.map((team) => (
                        <ListItemButton
                          key={team.id}
                          selected={!isCreatingTeam && team.id === editingTeamId}
                          onClick={() => handleTeamSelection(team.id)}
                          divider
                          sx={{ width: '100%' }}
                        >
                          <ListItemText
                            sx={{ width: '100%', m: 0 }}
                            primary={<Typography component="span" sx={{ display: 'block' }}>{team.displayName}</Typography>}
                          />
                        </ListItemButton>
                      ))}
                    </List>
                  </Stack>

                  <Stack spacing={1.5}>
                    <Typography variant="body-md" component="h3" sx={{ fontWeight: 700 }}>
                      {isCreatingTeam ? 'New team' : 'Edit team'}
                    </Typography>

                    <Box
                      sx={{
                        display: 'grid',
                        gap: 1.5,
                        gridTemplateColumns: {
                          xs: '1fr',
                          sm: '1fr 1fr',
                        },
                      }}
                    >
                      <TextField
                        label="Display name"
                        value={draftTeamProfile.displayName}
                        onChange={(event) => handleDraftFieldChange('displayName', event.target.value)}
                        fullWidth
                      />
                      <TextField
                        label="Organization"
                        value={draftTeamProfile.orgName}
                        onChange={(event) => handleDraftFieldChange('orgName', event.target.value)}
                        fullWidth
                      />
                      <TextField
                        label="Project"
                        value={draftTeamProfile.projectName}
                        onChange={(event) => handleDraftFieldChange('projectName', event.target.value)}
                        fullWidth
                      />
                      <TextField
                        label="Azure DevOps team name"
                        value={draftTeamProfile.teamName}
                        onChange={(event) => handleDraftFieldChange('teamName', event.target.value)}
                        fullWidth
                      />
                      <TextField
                        label="Repository name"
                        value={draftTeamProfile.repoName}
                        onChange={(event) => handleDraftFieldChange('repoName', event.target.value)}
                        fullWidth
                      />
                      <Box />
                      <TextField
                        label="Area path"
                        value={draftTeamProfile.areaPath}
                        onChange={(event) => handleDraftFieldChange('areaPath', event.target.value)}
                        fullWidth
                        sx={{ gridColumn: { sm: '1 / -1' } }}
                      />
                      <TextField
                        label="Iteration path"
                        value={draftTeamProfile.iterationPath}
                        onChange={(event) => handleDraftFieldChange('iterationPath', event.target.value)}
                        fullWidth
                        sx={{ gridColumn: { sm: '1 / -1' } }}
                      />
                    </Box>

                    <Stack direction="row" spacing={1}>
                      <Button size="small" color="error" onClick={handleRemoveTeam}>
                        {isCreatingTeam ? 'Discard team' : 'Remove team'}
                      </Button>
                      <Button size="small" variant="contained" onClick={handleSaveTeam}>
                        Save team
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              </Stack>
            ) : null}

            {activeTab === 'display' ? (
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="body-md" component="h2" sx={{ mb: 0.5, fontWeight: 700 }}>
                    Display
                  </Typography>
                  <Typography variant="body-sm" color="text.secondary">
                    Adjust app appearance for this browser.
                  </Typography>
                </Box>

                <Divider />

                <FormControlLabel
                  sx={{ m: 0 }}
                  control={(
                    <Switch
                      size="small"
                      checked={colorScheme === 'dark'}
                      onChange={onToggleColorScheme}
                    />
                  )}
                  label={<Typography variant="body-sm">Dark mode</Typography>}
                />
              </Stack>
            ) : null}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setIsSettingsDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </NavigationRail.Root>
  )
}
