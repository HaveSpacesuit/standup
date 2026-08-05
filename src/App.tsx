import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Switch,
  TextField,
  Toolbar,
  Typography,
  type SelectChangeEvent,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgFilter from '@stratakit/icons/filter.svg'
import svgAssign from '@stratakit/icons/assign.svg'
import { getAppConfig } from './config'
import { teamProfiles } from './teamProfiles'
import { AdoQueryEngine } from './ado/queryEngine'
import { KanbanBoard } from './features/standup/components/KanbanBoard'
import { HiddenTagsDialog } from './features/standup/components/HiddenTagsDialog'
import { usePullRequestBoardItems } from './features/standup/hooks/usePullRequestBoardItems'
import { useTeamData } from './features/standup/hooks/useTeamData'
import { useWorkItemAssignees } from './features/standup/hooks/useWorkItemAssignees'
import type { ResolvedWorkItemAssignee, WorkItemSummary } from './ado/queryEngine'

type AppProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
}

const HIDDEN_TAGS_STORAGE_KEY = 'standup:hidden-tags'
const SELECTED_TEAM_STORAGE_KEY = 'standup:selected-team-id'

function getInitialSelectedTeamId(): string {
  const storedTeamId = localStorage.getItem(SELECTED_TEAM_STORAGE_KEY)
  if (storedTeamId && teamProfiles.some((team) => team.id === storedTeamId)) {
    return storedTeamId
  }

  return teamProfiles[0].id
}

function buildTeamManagementUrl(
  orgName: string,
  projectName: string,
  teamName: string,
  subjectDescriptor?: string | null,
): string {
  const baseUrl = `https://dev.azure.com/${encodeURIComponent(orgName)}/${encodeURIComponent(projectName)}/_settings/teams`
  const params = new URLSearchParams(
    subjectDescriptor ? { subjectDescriptor } : { team: teamName },
  )
  return `${baseUrl}?${params.toString()}`
}

function normalizeTag(tag: string): string {
  return tag.trim()
}

function normalizeTagKey(tag: string): string {
  return normalizeTag(tag).toLowerCase()
}

function parseStoredHiddenTags(value: string | null): string[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    const deduped = new Map<string, string>()
    for (const entry of parsed) {
      if (typeof entry !== 'string') {
        continue
      }

      const normalized = normalizeTag(entry)
      if (!normalized) {
        continue
      }

      deduped.set(normalizeTagKey(normalized), normalized)
    }

    return [...deduped.values()]
  } catch {
    return []
  }
}

function shouldHideByTag(item: WorkItemSummary, hiddenTagKeys: Set<string>): boolean {
  if (hiddenTagKeys.size === 0) {
    return false
  }

  return (item.tags ?? []).some((tag) => hiddenTagKeys.has(normalizeTagKey(tag)))
}

function normalizeQuickFilterText(value: string): string {
  return value.trim().toLowerCase()
}

function matchesQuickFilter(
  item: WorkItemSummary,
  filterText: string,
  assignee: ResolvedWorkItemAssignee | undefined,
): boolean {
  if (!filterText) {
    return true
  }

  const values: string[] = [
    String(item.id),
    item.title,
    item.workItemType ?? '',
    item.sprintName ?? '',
    assignee?.label ?? '',
    ...(item.tags ?? []),
    ...(item.activePullRequests ?? []).flatMap((pullRequest) => [
      String(pullRequest.id),
      pullRequest.title,
    ]),
  ]

  if (item.kind === 'pull-request' && item.pullRequest) {
    values.push(String(item.pullRequest.id), item.pullRequest.title)
  }

  return values.some((value) => value.toLowerCase().includes(filterText))
}

function App({ patConfigured, colorScheme, onToggleColorScheme }: AppProps) {
  const [selectedTeamId, setSelectedTeamId] = useState(getInitialSelectedTeamId)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [hiddenTagsDialogOpen, setHiddenTagsDialogOpen] = useState(false)
  const [quickFilterInput, setQuickFilterInput] = useState('')
  const [teamSubjectDescriptor, setTeamSubjectDescriptor] = useState<string | null>(null)
  const [hiddenTags, setHiddenTags] = useState<string[]>(() =>
    parseStoredHiddenTags(localStorage.getItem(HIDDEN_TAGS_STORAGE_KEY)),
  )
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

  const handleOpenHiddenTagsDialog = () => {
    setHiddenTagsDialogOpen(true)
  }

  const handleCloseHiddenTagsDialog = () => {
    setHiddenTagsDialogOpen(false)
  }

  const {
    members,
    membersLoading,
    membersError,
    workItems,
    workItemsLoading,
    workItemsError,
    currentIteration,
  } = useTeamData({
    adoQueryEngine,
    selectedTeam,
    reloadNonce,
    forceRefreshRef,
  })

  const hiddenTagKeys = useMemo(
    () => new Set(hiddenTags.map((tag) => normalizeTagKey(tag))),
    [hiddenTags],
  )

  const filteredWorkItems = useMemo(
    () => workItems.filter((item) => !shouldHideByTag(item, hiddenTagKeys)),
    [workItems, hiddenTagKeys],
  )

  const { pullRequestBoardItems, pullRequestBoardItemsLoading } = usePullRequestBoardItems({
    adoQueryEngine,
    selectedTeam,
    currentIteration,
    members,
    membersLoading,
    membersError,
    workItems: filteredWorkItems,
    workItemsLoading,
    workItemsError,
  })

  const boardItems = useMemo(
    () => [...filteredWorkItems, ...pullRequestBoardItems],
    [filteredWorkItems, pullRequestBoardItems],
  )

  const normalizedQuickFilterText = useMemo(
    () => normalizeQuickFilterText(quickFilterInput),
    [quickFilterInput],
  )

  const { workItemAssignees, assigneesLoading, assigneesError } = useWorkItemAssignees({
    adoQueryEngine,
    orgName: selectedTeam.orgName,
    members,
    membersLoading,
    membersError,
    workItems: boardItems,
    workItemsLoading: workItemsLoading || pullRequestBoardItemsLoading,
    workItemsError,
  })

  const visibleBoardItems = useMemo(
    () =>
      boardItems.filter((item) =>
        matchesQuickFilter(item, normalizedQuickFilterText, workItemAssignees[item.id]),
      ),
    [boardItems, normalizedQuickFilterText, workItemAssignees],
  )

  useEffect(() => {
    localStorage.setItem(HIDDEN_TAGS_STORAGE_KEY, JSON.stringify(hiddenTags))
  }, [hiddenTags])

  useEffect(() => {
    localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, selectedTeamId)
  }, [selectedTeamId])

  useEffect(() => {
    let isDisposed = false
    const abortController = new AbortController()

    setTeamSubjectDescriptor(null)

    if (!adoQueryEngine || !patConfigured) {
      return () => {
        isDisposed = true
        abortController.abort()
      }
    }

    adoQueryEngine
      .getTeamSubjectDescriptor(
        {
          orgName: selectedTeam.orgName,
          projectName: selectedTeam.projectName,
          teamName: selectedTeam.teamName,
        },
        abortController.signal,
      )
      .then((descriptor) => {
        if (!isDisposed) {
          setTeamSubjectDescriptor(descriptor)
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setTeamSubjectDescriptor(null)
        }
      })

    return () => {
      isDisposed = true
      abortController.abort()
    }
  }, [adoQueryEngine, patConfigured, selectedTeam.orgName, selectedTeam.projectName, selectedTeam.teamName])

  const teamManagementUrl = useMemo(
    () =>
      buildTeamManagementUrl(
        selectedTeam.orgName,
        selectedTeam.projectName,
        selectedTeam.teamName,
        teamSubjectDescriptor,
      ),
    [selectedTeam.orgName, selectedTeam.projectName, selectedTeam.teamName, teamSubjectDescriptor],
  )

  const isTeamDataLoading = membersLoading || workItemsLoading || pullRequestBoardItemsLoading || assigneesLoading

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1.5 }}>
          <Icon href={svgCalendar} size="large"/>
          <Typography variant="body-lg" sx={{ fontWeight: 700 }}>
            Team Standup
          </Typography>

          <TextField
            size="small"
            placeholder="Quick filter cards"
            value={quickFilterInput}
            onChange={(event) => setQuickFilterInput(event.target.value)}
            disabled={!patConfigured}
            sx={{ minWidth: 230, maxWidth: 320 }}
            slotProps={{
              input: {
                endAdornment: quickFilterInput ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      edge="end"
                      aria-label="Clear quick filter"
                      onClick={() => setQuickFilterInput('')}
                    >
                      <Icon href={svgDismiss} />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />

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
              component="a"
              href={teamManagementUrl}
              target="_blank"
              rel="noreferrer noopener"
              startIcon={<Icon href={svgAssign} />}
            >
              Manage team
            </Button>

            <Button
              size="small"
              variant="outlined"
              startIcon={<Icon href={svgCloudSync} />}
              onClick={handleRefresh}
              disabled={!patConfigured || isTeamDataLoading}
            >
              Refresh
            </Button>

            <Button
              size="small"
              variant="outlined"
              startIcon={<Icon href={svgFilter} />}
              onClick={handleOpenHiddenTagsDialog}
              disabled={!patConfigured}
            >
              Hidden tags
            </Button>

          </Box>

          {hiddenTags.length > 0 ? (
            <Chip
              size="small"
              variant="outlined"
              label={`${hiddenTags.length} hidden tag${hiddenTags.length === 1 ? '' : 's'}`}
              sx={{
                borderColor: 'warning.main',
                color: 'warning.main',
              }}
            />
          ) : null}

          <FormControlLabel
            sx={{ ml: 0.25 }}
            control={
              <Switch
                size="small"
                checked={colorScheme === 'dark'}
                onChange={onToggleColorScheme}
              />
            }
            label={<Typography variant="body-sm">Dark mode</Typography>}
          />

        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flex: 1, minHeight: 0, p: 0, display: 'flex', flexDirection: 'column' }}>

        <Box sx={{ flex: 1, minHeight: 0 }}>
          <KanbanBoard
            patConfigured={patConfigured}
            isLoading={isTeamDataLoading}
            colorScheme={colorScheme}
            membersError={membersError}
            workItemsError={workItemsError}
            assigneesError={assigneesError}
            members={members}
            workItems={visibleBoardItems}
            currentIterationName={currentIteration?.name ?? null}
            workItemAssignees={workItemAssignees}
          />
        </Box>

        <HiddenTagsDialog
          open={hiddenTagsDialogOpen}
          hiddenTags={hiddenTags}
          onChange={setHiddenTags}
          onClose={handleCloseHiddenTagsDialog}
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
