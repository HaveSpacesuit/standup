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
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import { unstable_NavigationRail as NavigationRail } from '@stratakit/structures'
import svgUsers from '@stratakit/icons/users.svg'
import svgClipboard from '@stratakit/icons/clipboard.svg'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgConfiguration from '@stratakit/icons/configuration.svg'
import type { TeamProfile } from '../../../teamConfig'
import type { AppView } from '../hooks/useAppNavigation'

type AppNavigationRailProps = {
  activeView: AppView
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
  selectedTeamId: string
  teamProfiles: TeamProfile[]
  onTeamProfilesChange: (teamProfiles: TeamProfile[]) => void
}

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
  selectedTeamId,
  teamProfiles,
  onTeamProfilesChange,
}: AppNavigationRailProps) {
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string>(selectedTeamId)
  const [draftTeamProfile, setDraftTeamProfile] = useState<TeamProfile>(() => resolveEditableTeamProfile(teamProfiles, selectedTeamId))
  const [isCreatingTeam, setIsCreatingTeam] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSettingsDialogOpen) {
      return
    }

    const activeTeamProfile = resolveEditableTeamProfile(teamProfiles, selectedTeamId)
    setEditingTeamId(activeTeamProfile.id)
    setDraftTeamProfile(activeTeamProfile)
    setIsCreatingTeam(false)
    setTeamError(null)
  }, [isSettingsDialogOpen, selectedTeamId, teamProfiles])

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
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch
                size="small"
                checked={colorScheme === 'dark'}
                onChange={onToggleColorScheme}
              />
            }
            label={<Typography variant="body-sm">Dark mode</Typography>}
          />

          <Divider />

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
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button size="small" color="error" onClick={handleRemoveTeam}>
            {isCreatingTeam ? 'Discard team' : 'Remove team'}
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="contained" onClick={handleSaveTeam}>
            Save team
          </Button>
          <Button size="small" onClick={() => setIsSettingsDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </NavigationRail.Root>
  )
}
