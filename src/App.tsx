import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
} from '@mui/material'
import { teamProfiles } from './teamProfiles'
import { KanbanBoard } from './features/standup/components/KanbanBoard'
import { HiddenTagsDialog } from './features/standup/components/HiddenTagsDialog'
import { SprintSummaryBar } from './features/standup/components/SprintSummaryBar'
import { StandupToolbar } from './features/standup/components/StandupToolbar'
import { useBoardViewModel } from './features/standup/hooks/useBoardViewModel'

type AppProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
}

function App({ patConfigured, colorScheme, onToggleColorScheme }: AppProps) {
  const [hiddenTagsDialogOpen, setHiddenTagsDialogOpen] = useState(false)
  const quickFilterInputRef = useRef<HTMLInputElement | null>(null)

  const {
    selectedTeamId,
    onTeamChange,
    onRefresh,
    hiddenTags,
    setHiddenTags,
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

  const handleOpenHiddenTagsDialog = () => {
    setHiddenTagsDialogOpen(true)
  }

  const handleCloseHiddenTagsDialog = () => {
    setHiddenTagsDialogOpen(false)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f'
      if (!isShortcut) {
        return
      }

      event.preventDefault()
      quickFilterInputRef.current?.focus()
      quickFilterInputRef.current?.select()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
      <StandupToolbar
        patConfigured={patConfigured}
        quickFilterInput={quickFilterInput}
        onQuickFilterInputChange={setQuickFilterInput}
        onQuickFilterClear={() => setQuickFilterInput('')}
        quickFilterInputRef={quickFilterInputRef}
        selectedMemberFilter={selectedMemberFilter}
        memberFilterOptions={memberFilterOptions}
        onMemberFilterChange={onMemberFilterChange}
        teamOptions={teamProfiles}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
        onRefresh={onRefresh}
        onOpenHiddenTagsDialog={handleOpenHiddenTagsDialog}
        isTeamDataLoading={isTeamDataLoading}
        hiddenTagsCount={hiddenTags.length}
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
