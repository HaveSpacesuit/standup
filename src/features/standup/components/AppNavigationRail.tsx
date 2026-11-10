import { useEffect, useRef, useState, type ChangeEvent } from 'react'
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
  InputAdornment,
  Link,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { AppTooltip as Tooltip } from './AppTooltip'
import { Icon } from '@stratakit/mui'
import { unstable_NavigationRail as NavigationRail } from '@stratakit/structures'
import svgDeveloper from '@stratakit/icons/developer.svg'
import svgInspection from '@stratakit/icons/inspection.svg'
import svgCategory from '@stratakit/icons/category.svg'
import svgIssueReport from '@stratakit/icons/issue-report.svg'
import svgReport from '@stratakit/icons/report.svg'
import svgBinder from '@stratakit/icons/binder.svg'
import svgConfiguration from '@stratakit/icons/configuration.svg'
import svgArrowDown from '@stratakit/icons/arrow-down.svg'
import svgArrowUp from '@stratakit/icons/arrow-up.svg'
import svgHelp from '@stratakit/icons/help.svg'
import svgInfo from '@stratakit/icons/info.svg'
import { REQUIRED_PAT_SCOPES } from '../../../adoAuth'
import { getTeamProfileLabel, type TeamProfile } from '../../../appSettings'
import { validateTeamProfile, type TeamProfileFormField } from '../utils/teamProfileValidation'
import type { AppView } from '../hooks/useAppNavigation'
import { AutoRefreshSettings } from './AutoRefreshSettings'
import { DEFAULT_AUTO_REFRESH, type AutoRefreshOptions } from '../utils/autoRefresh'

function FieldHint({ tip }: { tip: string }) {
  return (
    <Tooltip title={tip} placement="top" arrow>
      <Box
        component="span"
        tabIndex={0}
        aria-label={tip}
        sx={{ display: 'inline-flex', alignItems: 'center', cursor: 'default', color: 'text.secondary', ml: 0.25 }}
      >
        <Icon href={`${svgInfo}#icon`} alt="" />
      </Box>
    </Tooltip>
  )
}

type AppNavigationRailProps = {
  activeView: AppView
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
  rememberLastView: boolean
  onRememberLastViewChange: (next: boolean) => void
  autoRefresh?: AutoRefreshOptions
  autoRefreshError?: string | null
  onAutoRefreshChange: (next: AutoRefreshOptions) => void
  patConfigured: boolean
  patValue: string
  onPatSave: (pat: string) => void
  onPatClear: () => void
  onExportTeamData: (teamId: string) => void
  onImportTeamData: (jsonText: string) => void
  selectedTeamId: string
  teamProfiles: TeamProfile[]
  onTeamProfilesChange: (teamProfiles: TeamProfile[]) => void
  patCreationUrl: string
}

type SettingsTab = 'azure-devops' | 'teams' | 'display'

const REMEMBER_LAST_VIEW_HELP_ID = 'settings-remember-last-view-help'

const EMPTY_TEAM_PROFILE_FIELDS = {
  orgName: '',
  projectName: '',
  displayName: '',
  areaPath: '',
  iterationPath: '',
  teamName: '',
  repoName: '',
}

const FIELD_HINTS: Record<TeamProfileFormField, string> = {
  displayName: 'The name shown in the team selector and as the board title. Use a short, recognisable label such as "ProjectWise Web".',
  orgName: 'Your Azure DevOps organisation name — the subdomain after dev.azure.com, e.g. "bentleycs".',
  projectName: 'The Azure DevOps project that contains your work items, e.g. "beconnect".',
  teamName: 'The exact Azure DevOps team name. This scopes the team-members list and the "Manage team" link. Find it under Project Settings › Teams.',
  repoName: 'The Git repository to query for pull requests. Only PRs from this repo appear as PR cards on the board.',
  areaPath: 'Limits work items to this area. Use the backslash-separated path shown in your ADO area settings, e.g. "beconnect\\\\My Area\\\\Sub-area".',
  iterationPath: 'Scopes sprint data to this path. Use the format shown in ADO iteration settings, e.g. "[beconnect]\\\\My Team".',
}

function createDraftTeamProfile(): TeamProfile {
  return {
    id: `team-${crypto.randomUUID()}`,
    ...EMPTY_TEAM_PROFILE_FIELDS,
  }
}

function resolveEditableTeamProfile(teamProfiles: TeamProfile[], selectedTeamId: string): TeamProfile {
  return teamProfiles.find((team) => team.id === selectedTeamId) ?? teamProfiles[0] ?? createDraftTeamProfile()
}

export function AppNavigationRail({
  activeView,
  colorScheme,
  onToggleColorScheme,
  rememberLastView,
  onRememberLastViewChange,
  autoRefresh = DEFAULT_AUTO_REFRESH,
  autoRefreshError = null,
  onAutoRefreshChange,
  patConfigured,
  patValue,
  onPatSave,
  onPatClear,
  onExportTeamData,
  onImportTeamData,
  selectedTeamId,
  teamProfiles,
  onTeamProfilesChange,
  patCreationUrl,
}: AppNavigationRailProps) {
  const isMobile = useMediaQuery('(max-width:599.95px)')
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string>(selectedTeamId)
  const [draftTeamProfile, setDraftTeamProfile] = useState<TeamProfile>(() => resolveEditableTeamProfile(teamProfiles, selectedTeamId))
  const [isCreatingTeam, setIsCreatingTeam] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [teamValidationField, setTeamValidationField] = useState<TeamProfileFormField | null>(null)
  const [draftPatValue, setDraftPatValue] = useState(patValue)
  const [patError, setPatError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTab>('azure-devops')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const patInputRef = useRef<HTMLInputElement | null>(null)
  const teamFieldRefs = useRef<Partial<Record<TeamProfileFormField, HTMLInputElement | null>>>({})

  useEffect(() => {
    if (!isSettingsDialogOpen) {
      return
    }

    const activeTeamProfile = resolveEditableTeamProfile(teamProfiles, selectedTeamId)
    setEditingTeamId(activeTeamProfile.id)
    setDraftTeamProfile(activeTeamProfile)
    setIsCreatingTeam(teamProfiles.length === 0)
    setTeamError(null)
    setTeamValidationField(null)
    setDraftPatValue(patValue)
    setPatError(null)
  }, [isSettingsDialogOpen, patValue, selectedTeamId, teamProfiles])

  const handleTeamSelection = (teamId: string) => {
    const nextTeamProfile = teamProfiles.find((team) => team.id === teamId)
    if (!nextTeamProfile) {
      return
    }

    setEditingTeamId(teamId)
    setDraftTeamProfile(nextTeamProfile)
    setIsCreatingTeam(false)
    setTeamError(null)
    setTeamValidationField(null)
  }

  const handleDraftFieldChange = (field: TeamProfileFormField, value: string) => {
    setDraftTeamProfile((current) => ({
      ...current,
      [field]: value,
    }))
    if (teamValidationField === field) {
      if (value.trim()) {
        setTeamError(null)
        setTeamValidationField(null)
      }
    } else if (!teamValidationField) {
      setTeamError(null)
    }
  }

  const handleAddTeam = () => {
    const nextDraft = createDraftTeamProfile()
    setEditingTeamId(nextDraft.id)
    setDraftTeamProfile(nextDraft)
    setIsCreatingTeam(true)
    setTeamError(null)
    setTeamValidationField(null)
  }

  const handleSavePat = () => {
    const trimmedPat = draftPatValue.trim()
    if (!trimmedPat) {
      setPatError('Azure DevOps PAT is required.')
      patInputRef.current?.focus()
      return
    }

    onPatSave(trimmedPat)
    setDraftPatValue(trimmedPat)
    setPatError(null)
  }

  const handleClearPat = () => {
    setIsSettingsDialogOpen(false)
    onPatClear()
    setDraftPatValue('')
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
      setTeamError(validationError.message)
      setTeamValidationField(validationError.field)
      teamFieldRefs.current[validationError.field]?.focus()
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
    setTeamValidationField(null)
  }

  const handleRemoveTeam = () => {
    if (isCreatingTeam) {
      const fallbackTeam = resolveEditableTeamProfile(teamProfiles, selectedTeamId)
      setEditingTeamId(fallbackTeam.id)
      setDraftTeamProfile(fallbackTeam)
      setIsCreatingTeam(false)
      setTeamError(null)
      setTeamValidationField(null)
      return
    }

    const nextTeamProfiles = teamProfiles.filter((team) => team.id !== draftTeamProfile.id)
    onTeamProfilesChange(nextTeamProfiles)

    const fallbackTeam = resolveEditableTeamProfile(nextTeamProfiles, selectedTeamId)
    setEditingTeamId(fallbackTeam.id)
    setDraftTeamProfile(fallbackTeam)
    setIsCreatingTeam(false)
    setTeamError(null)
    setTeamValidationField(null)
  }

  const handleExportCurrentTeam = () => {
    try {
      setTeamError(null)
      setTeamValidationField(null)
      onExportTeamData(editingTeamId)
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : 'Unable to export team data.')
    }
  }

  const handleImportButtonClick = () => {
    setTeamError(null)
    setTeamValidationField(null)
    fileInputRef.current?.click()
  }

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    try {
      const jsonText = await file.text()
      onImportTeamData(jsonText)
      setTeamError(null)
      setTeamValidationField(null)
      setActiveTab('teams')
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : 'Unable to import team data.')
      setTeamValidationField(null)
    }
  }

  const handleMoveTeam = (teamId: string, direction: 'up' | 'down') => {
    const currentIndex = teamProfiles.findIndex((team) => team.id === teamId)
    if (currentIndex < 0) {
      return
    }

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= teamProfiles.length) {
      return
    }

    const nextTeamProfiles = [...teamProfiles]
    const [movedTeam] = nextTeamProfiles.splice(currentIndex, 1)
    nextTeamProfiles.splice(targetIndex, 0, movedTeam)
    onTeamProfilesChange(nextTeamProfiles)
    setEditingTeamId(teamId)
    setDraftTeamProfile(movedTeam)
    setIsCreatingTeam(false)
    setTeamError(null)
    setTeamValidationField(null)
  }

  return (
    <NavigationRail.Root>
      <NavigationRail.Header>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0, flex: 1, mr: 1 }}>
          <Icon href={`${svgBinder}#icon-large`} alt="ADO Team Explorer" size="large" />
          <Typography
            variant="body-md"
            sx={{
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'none',
              '[data-_sk-expanded="true"] &': {
                display: 'block',
              },
            }}
          >
            ADO Team Explorer
          </Typography>
        </Box>
        <NavigationRail.ToggleButton />
      </NavigationRail.Header>

      <NavigationRail.Content>
        <NavigationRail.List>
          <NavigationRail.ListItem>
            <NavigationRail.Anchor
              href="#development"
              label="Development"
              icon={`${svgDeveloper}#icon-large`}
              active={activeView === 'development'}
              style={{inlineSize: 'unset'}}
            />
          </NavigationRail.ListItem>
          <NavigationRail.ListItem>
            <NavigationRail.Anchor
              href="#qa-activity"
              label="Quality Assurance"
              icon={`${svgInspection}#icon-large`}
              active={activeView === 'qa-activity'}
              style={{inlineSize: 'unset'}}
            />
          </NavigationRail.ListItem>
          <NavigationRail.ListItem>
            <NavigationRail.Anchor
              href="#triage"
              label="Triage"
              icon={`${svgCategory}#icon-large`}
              active={activeView === 'triage'}
              style={{inlineSize: 'unset'}}
            />
          </NavigationRail.ListItem>
          <NavigationRail.ListItem>
            <NavigationRail.Anchor
              href="#backlog"
              label="Backlog"
              icon={`${svgIssueReport}#icon-large`}
              active={activeView === 'backlog'}
              style={{inlineSize: 'unset'}}
            />
          </NavigationRail.ListItem>
          <NavigationRail.ListItem>
            <NavigationRail.Anchor
              href="#tests"
              label="Tests"
              icon={`${svgReport}#icon-large`}
              active={activeView === 'tests'}
              style={{inlineSize: 'unset'}}
            />
          </NavigationRail.ListItem>
        </NavigationRail.List>
        <NavigationRail.Footer>
          <NavigationRail.ListItem>
            <NavigationRail.Button
              icon={`${svgConfiguration}#icon-large`}
              label="Settings"
              onClick={() => {
                setActiveTab('azure-devops')
                setIsSettingsDialogOpen(true)
              }}
              style={{inlineSize: 'unset'}}
            />
          </NavigationRail.ListItem>
          <NavigationRail.ListItem>
            <NavigationRail.Button
              icon={`${svgHelp}#icon-large`}
              label="Help"
              onClick={() => setIsHelpDialogOpen(true)}
              style={{inlineSize: 'unset'}}
            />
          </NavigationRail.ListItem>
        </NavigationRail.Footer>
      </NavigationRail.Content>

      <Dialog open={isHelpDialogOpen} onClose={() => setIsHelpDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>ADO Team Explorer Help</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2, pt: 1 }}>
          <Box>
            <Typography variant="body-md" component="h2" sx={{ mb: 0.5, fontWeight: 700 }}>
              App structure
            </Typography>
            <Typography variant="body-sm" color="text.secondary">
              The app is organized around four main pages: Development, Quality Assurance, Backlog, and Tests.
            </Typography>
          </Box>

          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1.25, color: 'text.secondary' }}>
            <Typography component="li" variant="body-sm">
              <strong>Development</strong> provides Developers and Sprint views for the team&apos;s work items.
            </Typography>
            <Typography component="li" variant="body-sm">
              <strong>Quality Assurance</strong> focuses on sprint and work item health, including QA filters, state groups, tag groups, sprint lookback, and board highlights.
            </Typography>
            <Typography component="li" variant="body-sm">
              <strong>Triage</strong> lists unfinished tagged work items and, optionally, Proposed-state bugs outside excluded iterations, with why each is listed, what each still needs before it is ready to clear, and how many working days it has been in triage. Switch to the Inbox to see what is new since your last visit and what is waiting on others. Open items in Azure DevOps to triage them, or open the whole queue there as a query for bulk edits.
            </Typography>
            <Typography variant="body-md">
              <strong>Backlog</strong> ranks the team&apos;s open bugs, across all sprints, by development value: severity and impact (the Priority field) weighed against effort.
            </Typography>
            <Typography component="li" variant="body-sm">
              <strong>Tests</strong> charts e2e test pass rates across configured build and release pipeline stages.
            </Typography>
            <Typography component="li" variant="body-sm">
              <strong>Settings</strong> stores Azure DevOps credentials, team configuration, and display preferences in browser storage.
            </Typography>
          </Box>

          <Box>
            <Typography variant="body-md" component="h2" sx={{ mb: 0.5, fontWeight: 700 }}>
              Configuration overview
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1, color: 'text.secondary' }}>
              <Typography component="li" variant="body-sm">
                <strong>Azure DevOps access</strong> requires a PAT with Build, Code, Graph, Project and Team, Release, Test Management, and Work Items read scopes.
              </Typography>
              <Typography component="li" variant="body-sm">
                <strong>Teams</strong> lets you define an org, project, area path, iteration path, team name, and repository. Each team stores its own QA and development options.
              </Typography>
              <Typography component="li" variant="body-sm">
                <strong>Display</strong> toggles the app between light and dark mode, and can reopen Development and Quality Assurance on the view you used last. Neither changes your Azure DevOps data.
              </Typography>
            </Box>
          </Box>

          <Box>
            <Typography variant="body-md" component="h2" sx={{ mb: 0.5, fontWeight: 700 }}>
              Useful behavior
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 1, color: 'text.secondary' }}>
              <Typography component="li" variant="body-sm">
                Use the quick filter in the toolbar to match work item IDs, titles, sprint details, tags, PR titles, and team member names. On Backlog it matches any text shown in the table.
              </Typography>
              <Typography component="li" variant="body-sm">
                / or Ctrl+F (Cmd+F on macOS) focuses the quick filter on Development, Quality Assurance, and Backlog. The Development member filter can be cycled with Ctrl+Up and Ctrl+Down; during a standup the same keys move to the previous or next speaker.
              </Typography>
              <Typography component="li" variant="body-sm">
                Team profiles and saved per-team options persist in local storage so the app can restore the currently selected setup on reload.
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setIsHelpDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={isSettingsDialogOpen} onClose={() => setIsSettingsDialogOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>Settings</DialogTitle>
      <DialogContent sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 1, sm: 2 },
        pt: 1,
        minHeight: { xs: 0, sm: 420 },
      }}>
        <Tabs
            orientation={isMobile ? 'horizontal' : 'vertical'}
            variant={isMobile ? 'scrollable' : 'standard'}
            scrollButtons="auto"
            allowScrollButtonsMobile
            value={activeTab}
            onChange={(_event, value: SettingsTab) => setActiveTab(value)}
            sx={{
              width: { xs: '100%', sm: 'auto' },
              borderRight: { xs: 0, sm: 1 },
              borderBottom: { xs: 1, sm: 0 },
              borderColor: 'divider',
              minWidth: { xs: 0, sm: 140 },
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
                whiteSpace: 'nowrap',
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
                    Paste your own Azure DevOps PAT. It will be used for the current browser session only.
                  </Typography>
                  <Typography variant="body-sm" color="text.secondary">
                    Need one?{' '}
                    <Link href={patCreationUrl} target="_blank" rel="noreferrer noopener">
                      Create an Azure DevOps PAT
                    </Link>
                    .
                  </Typography>
                </Box>

                {patError ? <Alert severity="error" role="alert" aria-live="assertive">{patError}</Alert> : null}

                <TextField
                  label="Personal access token"
                  type="password"
                  inputRef={patInputRef}
                  value={draftPatValue}
                  onChange={(event) => {
                    setDraftPatValue(event.target.value)
                    if (event.target.value.trim()) {
                      setPatError(null)
                    }
                  }}
                  error={Boolean(patError)}
                  helperText={patError}
                  fullWidth
                  placeholder="Paste your Azure DevOps PAT"
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
                    Use PAT
                  </Button>
                  <Button size="small" color="error" onClick={handleClearPat}>
                    Clear PAT
                  </Button>
                </Stack>
              </Stack>
            ) : null}

            {activeTab === 'teams' ? (
              <Stack spacing={1.5}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    void handleImportFileChange(event)
                  }}
                  hidden
                />

                <Box>
                  <Typography variant="body-md" component="h2" sx={{ mb: 0.5, fontWeight: 700 }}>
                    Teams
                  </Typography>
                  <Typography variant="body-sm" color="text.secondary">
                    Team settings are stored in this browser&apos;s local storage. Import or export a team to share its configuration and per-team page options.
                  </Typography>
                </Box>

                {teamError ? <Alert severity="error" role="alert" aria-live="assertive">{teamError}</Alert> : null}

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
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <Button variant="outlined" onClick={handleAddTeam}>
                        Add team
                      </Button>
                      <Button variant="outlined" onClick={handleImportButtonClick}>
                        Import team data
                      </Button>
                    </Stack>

                    <List sx={{ border: 1, borderColor: 'divider', borderRadius: 1, py: 0, overflow: 'hidden', width: '100%' }}>
                      {teamProfiles.map((team) => (
                        <ListItemButton
                          key={team.id}
                          selected={!isCreatingTeam && team.id === editingTeamId}
                          onClick={() => handleTeamSelection(team.id)}
                          divider
                          sx={{ width: '100%' }}
                        >
                          <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <ListItemText
                              sx={{ width: '100%', m: 0 }}
                              primary={<Typography component="span" sx={{ display: 'block' }}>{getTeamProfileLabel(team)}</Typography>}
                            />
                            <Stack direction="row" spacing={0.25}>
                              <Button
                                size="small"
                                variant="text"
                                aria-label={`Move ${getTeamProfileLabel(team)} up`}
                                disabled={isCreatingTeam || teamProfiles[0]?.id === team.id}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleMoveTeam(team.id, 'up')
                                }}
                                sx={{ minWidth: 0, px: 0.5 }}
                              >
                                <Icon href={svgArrowUp} alt="" />
                              </Button>
                              <Button
                                size="small"
                                variant="text"
                                aria-label={`Move ${getTeamProfileLabel(team)} down`}
                                disabled={isCreatingTeam || teamProfiles[teamProfiles.length - 1]?.id === team.id}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleMoveTeam(team.id, 'down')
                                }}
                                sx={{ minWidth: 0, px: 0.5 }}
                              >
                                <Icon href={svgArrowDown} alt="" />
                              </Button>
                            </Stack>
                          </Box>
                        </ListItemButton>
                      ))}
                      {teamProfiles.length === 0 ? (
                        <Box sx={{ px: 1.5, py: 1 }}>
                          <Typography variant="body-sm" color="text.secondary">
                            No teams configured yet.
                          </Typography>
                        </Box>
                      ) : null}
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
                        inputRef={(element) => { teamFieldRefs.current.displayName = element }}
                        value={draftTeamProfile.displayName}
                        onChange={(event) => handleDraftFieldChange('displayName', event.target.value)}
                        error={teamValidationField === 'displayName'}
                        helperText={teamValidationField === 'displayName' ? teamError : undefined}
                        fullWidth
                        slotProps={{ input: { endAdornment: <InputAdornment position="end"><FieldHint tip={FIELD_HINTS.displayName} /></InputAdornment> } }}
                      />
                      <TextField
                        label="Organization"
                        inputRef={(element) => { teamFieldRefs.current.orgName = element }}
                        value={draftTeamProfile.orgName}
                        onChange={(event) => handleDraftFieldChange('orgName', event.target.value)}
                        error={teamValidationField === 'orgName'}
                        helperText={teamValidationField === 'orgName' ? teamError : undefined}
                        fullWidth
                        slotProps={{ input: { endAdornment: <InputAdornment position="end"><FieldHint tip={FIELD_HINTS.orgName} /></InputAdornment> } }}
                      />
                      <TextField
                        label="Project"
                        inputRef={(element) => { teamFieldRefs.current.projectName = element }}
                        value={draftTeamProfile.projectName}
                        onChange={(event) => handleDraftFieldChange('projectName', event.target.value)}
                        error={teamValidationField === 'projectName'}
                        helperText={teamValidationField === 'projectName' ? teamError : undefined}
                        fullWidth
                        slotProps={{ input: { endAdornment: <InputAdornment position="end"><FieldHint tip={FIELD_HINTS.projectName} /></InputAdornment> } }}
                      />
                      <TextField
                        label="Azure DevOps team name"
                        inputRef={(element) => { teamFieldRefs.current.teamName = element }}
                        value={draftTeamProfile.teamName}
                        onChange={(event) => handleDraftFieldChange('teamName', event.target.value)}
                        error={teamValidationField === 'teamName'}
                        helperText={teamValidationField === 'teamName' ? teamError : undefined}
                        fullWidth
                        slotProps={{ input: { endAdornment: <InputAdornment position="end"><FieldHint tip={FIELD_HINTS.teamName} /></InputAdornment> } }}
                      />
                      <TextField
                        label="Repository name"
                        inputRef={(element) => { teamFieldRefs.current.repoName = element }}
                        value={draftTeamProfile.repoName}
                        onChange={(event) => handleDraftFieldChange('repoName', event.target.value)}
                        error={teamValidationField === 'repoName'}
                        helperText={teamValidationField === 'repoName' ? teamError : undefined}
                        fullWidth
                        slotProps={{ input: { endAdornment: <InputAdornment position="end"><FieldHint tip={FIELD_HINTS.repoName} /></InputAdornment> } }}
                      />
                      <Box />
                      <TextField
                        label="Area path"
                        inputRef={(element) => { teamFieldRefs.current.areaPath = element }}
                        value={draftTeamProfile.areaPath}
                        onChange={(event) => handleDraftFieldChange('areaPath', event.target.value)}
                        error={teamValidationField === 'areaPath'}
                        helperText={teamValidationField === 'areaPath' ? teamError : undefined}
                        fullWidth
                        sx={{ gridColumn: { sm: '1 / -1' } }}
                        slotProps={{ input: { endAdornment: <InputAdornment position="end"><FieldHint tip={FIELD_HINTS.areaPath} /></InputAdornment> } }}
                      />
                      <TextField
                        label="Iteration path"
                        inputRef={(element) => { teamFieldRefs.current.iterationPath = element }}
                        value={draftTeamProfile.iterationPath}
                        onChange={(event) => handleDraftFieldChange('iterationPath', event.target.value)}
                        error={teamValidationField === 'iterationPath'}
                        helperText={teamValidationField === 'iterationPath' ? teamError : undefined}
                        fullWidth
                        sx={{ gridColumn: { sm: '1 / -1' } }}
                        slotProps={{ input: { endAdornment: <InputAdornment position="end"><FieldHint tip={FIELD_HINTS.iterationPath} /></InputAdornment> } }}
                      />
                    </Box>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <Button size="small" onClick={handleExportCurrentTeam} disabled={isCreatingTeam}>
                        Export team data
                      </Button>
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
                    Adjust how the app looks and opens in this browser.
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

                <Box>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={(
                      <Switch
                        size="small"
                        checked={rememberLastView}
                        onChange={(_event, checked) => onRememberLastViewChange(checked)}
                        slotProps={{ input: { 'aria-describedby': REMEMBER_LAST_VIEW_HELP_ID } }}
                      />
                    )}
                    label={<Typography variant="body-sm">Remember last page and view</Typography>}
                  />
                  <Typography id={REMEMBER_LAST_VIEW_HELP_ID} variant="body-sm" color="text.secondary" sx={{ mt: 0.5 }}>
                    When opening the site without a page route, return to your last page. Also reopen each page on its last view, such as Sprint, Flow, Inbox, Map, or Calendar. Explicit page routes take precedence. When off, the site defaults to Development and pages open on Developers, Testers, Table, List, and Rows.
                  </Typography>
                </Box>
                <AutoRefreshSettings options={autoRefresh} error={autoRefreshError} onChange={onAutoRefreshChange} />
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
