import { Alert, Box } from '@mui/material'
import type { ComponentProps } from 'react'
import type { AppView } from '../hooks/useAppNavigation'
import { BacklogPage } from '../pages/BacklogPage'
import { QualityAssurancePage } from '../pages/QualityAssurancePage'
import { TeamAssignmentsPage } from '../pages/TeamAssignmentsPage'
import { TestsPage } from '../pages/TestsPage'
import { ContentErrorBoundary } from './ContentErrorBoundary'

type TeamAssignmentsPageProps = ComponentProps<typeof TeamAssignmentsPage>
type QualityAssurancePageProps = ComponentProps<typeof QualityAssurancePage>

type StandupContentProps = {
  activeView: AppView
  teamProfilesUnreadable?: boolean
  teamAssignmentsPageProps: TeamAssignmentsPageProps
  qualityAssurancePageProps: QualityAssurancePageProps
  backlogPageProps: ComponentProps<typeof BacklogPage>
  testsPageProps: ComponentProps<typeof TestsPage>
}

export function StandupContent({
  activeView,
  teamProfilesUnreadable,
  teamAssignmentsPageProps,
  qualityAssurancePageProps,
  backlogPageProps,
  testsPageProps,
}: StandupContentProps) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {teamProfilesUnreadable ? (
        <Alert severity="warning" role="alert">
          Saved team profiles could not be read completely. Only readable profiles are shown; if none are readable, no teams are loaded.
          {' '}The stored data has been kept. Back up “standup:team-profiles” in browser local storage before recovery.
          {' '}In Settings &gt; Teams, import a backup or add a team to replace the unreadable profiles.
        </Alert>
      ) : null}
      <ContentErrorBoundary resetKey={`${activeView}:${teamAssignmentsPageProps.selectedTeamId}`}>
        {activeView === 'development' ? (
          <TeamAssignmentsPage {...teamAssignmentsPageProps} />
        ) : activeView === 'qa-activity' ? (
          <QualityAssurancePage {...qualityAssurancePageProps} />
        ) : activeView === 'backlog' ? (
          <BacklogPage {...backlogPageProps} />
        ) : (
          <TestsPage {...testsPageProps} />
        )}
      </ContentErrorBoundary>
    </Box>
  )
}
