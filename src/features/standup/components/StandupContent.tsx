import { Box } from '@mui/material'
import type { ComponentProps } from 'react'
import type { AppView } from '../hooks/useAppNavigation'
import { QualityAssurancePage } from '../pages/QualityAssurancePage'
import { TeamAssignmentsPage } from '../pages/TeamAssignmentsPage'

type TeamAssignmentsPageProps = ComponentProps<typeof TeamAssignmentsPage>
type QualityAssurancePageProps = ComponentProps<typeof QualityAssurancePage>

type StandupContentProps = {
  activeView: AppView
  teamAssignmentsPageProps: TeamAssignmentsPageProps
  qualityAssurancePageProps: QualityAssurancePageProps
}

export function StandupContent({
  activeView,
  teamAssignmentsPageProps,
  qualityAssurancePageProps,
}: StandupContentProps) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {activeView === 'development' ? (
        <TeamAssignmentsPage {...teamAssignmentsPageProps} />
      ) : (
        <QualityAssurancePage {...qualityAssurancePageProps} />
      )}
    </Box>
  )
}
