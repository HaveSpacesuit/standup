import { Box } from '@mui/material'
import type { ComponentProps } from 'react'
import type { AppView } from '../hooks/useAppNavigation'
import { QualityAssurancePage } from '../pages/QualityAssurancePage'
import { SprintSummaryPage } from '../pages/SprintSummaryPage'
import { TeamAssignmentsPage } from '../pages/TeamAssignmentsPage'

type TeamAssignmentsPageProps = ComponentProps<typeof TeamAssignmentsPage>
type QualityAssurancePageProps = ComponentProps<typeof QualityAssurancePage>
type SprintSummaryPageProps = ComponentProps<typeof SprintSummaryPage>

type StandupContentProps = {
  activeView: AppView
  teamAssignmentsPageProps: TeamAssignmentsPageProps
  qualityAssurancePageProps: QualityAssurancePageProps
  sprintSummaryPageProps: SprintSummaryPageProps
}

export function StandupContent({
  activeView,
  teamAssignmentsPageProps,
  qualityAssurancePageProps,
  sprintSummaryPageProps,
}: StandupContentProps) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {activeView === 'team-assignments' ? (
        <TeamAssignmentsPage {...teamAssignmentsPageProps} />
      ) : activeView === 'qa-activity' ? (
        <QualityAssurancePage {...qualityAssurancePageProps} />
      ) : (
        <SprintSummaryPage {...sprintSummaryPageProps} />
      )}
    </Box>
  )
}
