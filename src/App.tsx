import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import { unstable_NavigationRail as NavigationRail } from '@stratakit/structures'
import svgUsers from '@stratakit/icons/users.svg'
import svgGitBranch from '@stratakit/icons/git-branch.svg'
import svgCalendar from '@stratakit/icons/calendar.svg'
import { teamProfiles } from './teamProfiles'
import { KanbanBoard } from './features/standup/components/KanbanBoard'
import { HiddenTagsDialog } from './features/standup/components/HiddenTagsDialog'
import { SprintSummaryBar } from './features/standup/components/SprintSummaryBar'
import { StandupToolbar } from './features/standup/components/StandupToolbar'
import { useBoardViewModel } from './features/standup/hooks/useBoardViewModel'

type AppView = 'standup' | 'pull-requests'

function getViewFromHash(hash: string): AppView {
  return hash === '#pull-requests' ? 'pull-requests' : 'standup'
}

type AppProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
}

function App({ patConfigured, colorScheme, onToggleColorScheme }: AppProps) {
  const [tagRulesDialogOpen, setTagRulesDialogOpen] = useState(false)
  const [activeView, setActiveView] = useState<AppView>(() => getViewFromHash(window.location.hash))
  const quickFilterInputRef = useRef<HTMLInputElement | null>(null)

  const {
    selectedTeamId,
    onTeamChange,
    onRefresh,
    tagRules,
    setTagRules,
    quickFilterInput,
    setQuickFilterInput,
    selectedMemberFilter,
    onMemberFilterChange,
    memberFilterOptions,
    teamManagementUrl,
    isTeamDataLoading,
    membersError,
    workItemsError,
    assigneesError,
    members,
    visibleBoardItems,
    currentIterationName,
    iterationWindow,
    iterationLoading,
    changeHighlightsByItemId,
    workItemAssignees,
  } = useBoardViewModel({ patConfigured })

  const handleOpenTagRulesDialog = () => {
    setTagRulesDialogOpen(true)
  }

  const handleCloseTagRulesDialog = () => {
    setTagRulesDialogOpen(false)
  }

  const handleCycleMemberFilter = (direction: -1 | 1) => {
    if (!patConfigured || memberFilterOptions.length === 0) {
      return
    }

    const cycleValues = ['', ...memberFilterOptions]
    const currentIndex = cycleValues.indexOf(selectedMemberFilter)
    const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex
    const nextIndex = (safeCurrentIndex + direction + cycleValues.length) % cycleValues.length
    onMemberFilterChange(cycleValues[nextIndex])
  }

  useEffect(() => {
    const handleHashChange = () => {
      setActiveView(getViewFromHash(window.location.hash))
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  useEffect(() => {
    document.title = activeView === 'pull-requests' ? 'Pull Requests' : 'Standup'
  }, [activeView])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isTypingTarget =
        tagName === 'input'
        || tagName === 'textarea'
        || target?.isContentEditable === true

      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f'
      if (!isShortcut) {
        const isCycleUpShortcut = event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'ArrowUp'
        const isCycleDownShortcut = event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'ArrowDown'

        if (!isTypingTarget && (isCycleUpShortcut || isCycleDownShortcut)) {
          event.preventDefault()
          handleCycleMemberFilter(isCycleUpShortcut ? -1 : 1)
        }

        return
      }

      event.preventDefault()
      if (activeView !== 'standup') {
        window.location.hash = '#standup'
      }
      quickFilterInputRef.current?.focus()
      quickFilterInputRef.current?.select()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeView, handleCycleMemberFilter])

  return (
    <Box sx={{ height: '100vh', display: 'flex', bgcolor: 'background.paper' }}>
      <NavigationRail.Root>
        <NavigationRail.Header>
          <Icon href={svgCalendar} alt="Standup app" size="large" />
          <NavigationRail.ToggleButton />
        </NavigationRail.Header>

        <NavigationRail.Content>
          <NavigationRail.List>
            <NavigationRail.ListItem>
              <NavigationRail.Anchor
                href="#standup"
                label="Standup"
                icon={svgUsers}
                active={activeView === 'standup'}
              />
            </NavigationRail.ListItem>
            <NavigationRail.ListItem>
              <NavigationRail.Anchor
                href="#pull-requests"
                label="Pull requests"
                icon={svgGitBranch}
                active={activeView === 'pull-requests'}
              />
            </NavigationRail.ListItem>
          </NavigationRail.List>
          <NavigationRail.Footer />
        </NavigationRail.Content>
      </NavigationRail.Root>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {activeView === 'standup' ? (
          <>
            <StandupToolbar
              patConfigured={patConfigured}
              quickFilterInput={quickFilterInput}
              onQuickFilterInputChange={setQuickFilterInput}
              onQuickFilterClear={() => setQuickFilterInput('')}
              quickFilterInputRef={quickFilterInputRef}
              selectedMemberFilter={selectedMemberFilter}
              memberFilterOptions={memberFilterOptions}
              onMemberFilterChange={onMemberFilterChange}
              onMemberFilterCycle={handleCycleMemberFilter}
              teamOptions={teamProfiles}
              selectedTeamId={selectedTeamId}
              onTeamChange={onTeamChange}
              teamManagementUrl={teamManagementUrl}
              onRefresh={onRefresh}
              onOpenTagRulesDialog={handleOpenTagRulesDialog}
              isTeamDataLoading={isTeamDataLoading}
            />

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
                  currentIterationName={currentIterationName}
                  changeHighlightsByItemId={changeHighlightsByItemId}
                  workItemAssignees={workItemAssignees}
                />
              </Box>

              <SprintSummaryBar
                iterationWindow={iterationWindow}
                isLoading={iterationLoading}
                colorScheme={colorScheme}
                onToggleColorScheme={onToggleColorScheme}
              />

              <HiddenTagsDialog
                open={tagRulesDialogOpen}
                tagRules={tagRules}
                onChange={setTagRules}
                onClose={handleCloseTagRulesDialog}
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
          </>
        ) : (
          <Box component="main" sx={{ flex: 1, minHeight: 0, bgcolor: 'background.paper' }} />
        )}
      </Box>
    </Box>
  )
}

export default App
