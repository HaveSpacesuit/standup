import { Box } from '@mui/material'
import type { ComponentProps } from 'react'
import type { AppView } from '../hooks/useAppNavigation'
import { QualityAssurancePage } from '../pages/QualityAssurancePage'
import { TeamAssignmentsPage } from '../pages/TeamAssignmentsPage'
import { TestsPage } from '../pages/TestsPage'

type TeamAssignmentsPageProps = ComponentProps<typeof TeamAssignmentsPage>
type QualityAssurancePageProps = ComponentProps<typeof QualityAssurancePage>

type StandupContentProps = {
  activeView: AppView
  teamAssignmentsPageProps: TeamAssignmentsPageProps
  qualityAssurancePageProps: QualityAssurancePageProps
  testsPageProps: ComponentProps<typeof TestsPage>
}

export function StandupContent({
  activeView,
  teamAssignmentsPageProps,
  qualityAssurancePageProps,
  testsPageProps,
}: StandupContentProps) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {activeView === 'development' ? (
        <TeamAssignmentsPage {...teamAssignmentsPageProps} />
      ) : activeView === 'qa-activity' ? (
        <QualityAssurancePage {...qualityAssurancePageProps} />
      ) : (
        <TestsPage {...testsPageProps} />
      )}
    </Box>
  )
}
