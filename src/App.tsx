import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
import type { WorkItemSummary } from './ado/queryEngine'

type AppProps = {
  patConfigured: boolean
}

const HIDDEN_TAGS_STORAGE_KEY = 'standup:hidden-tags'

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

function App({ patConfigured }: AppProps) {
  const [selectedTeamId, setSelectedTeamId] = useState(teamProfiles[0].id)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [hiddenTagsDialogOpen, setHiddenTagsDialogOpen] = useState(false)
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

  useEffect(() => {
    localStorage.setItem(HIDDEN_TAGS_STORAGE_KEY, JSON.stringify(hiddenTags))
  }, [hiddenTags])

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
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.paper' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1.5 }}>
          <Icon href={svgCalendar} size="large"/>
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
          workItems={boardItems}
          currentIterationName={currentIteration?.name ?? null}
          workItemAssignees={workItemAssignees}
        />

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
