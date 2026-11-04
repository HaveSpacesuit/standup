import { Alert, Box } from '@mui/material'
import type { TeamIterationOption, TeamMember, WorkItemSummary, WorkItemUpdate } from '../../../ado/queryEngine'
import { AdoErrorNotice } from './AdoErrorNotice'
import { QualityAssuranceLoadingState } from './QualityAssuranceLoadingState'
import { QaFlowBoard } from './QaFlowBoard'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import type { QaOptions } from '../utils/qaOptions'

type QualityAssuranceListProps = {
  isLoading: boolean
  error: string | null
  historyWarning: string | null
  buckets: QualityAssuranceBucket[]
  updatesByItemId: Record<number, WorkItemUpdate[]>
  boardItems: WorkItemSummary[]
  currentIterationName: string | null
  teamIterations: TeamIterationOption[]
  teamMembers: TeamMember[]
  options: QaOptions
  lookbackDays: number
  compactCards: boolean
  colorScheme: 'light' | 'dark'
  cardHighlightOptions: CardHighlightOptions
  view: 'flow' | 'testers'
  standupActive: boolean
  onStandupEnd: () => void
}

export function QualityAssuranceList({
  isLoading,
  error,
  historyWarning,
  buckets,
  updatesByItemId,
  boardItems,
  currentIterationName,
  teamIterations,
  teamMembers,
  options,
  lookbackDays,
  compactCards,
  colorScheme,
  cardHighlightOptions,
  view,
  standupActive,
  onStandupEnd,
}: QualityAssuranceListProps) {
  if (isLoading) {
    return <QualityAssuranceLoadingState colorScheme={colorScheme} />
  }

  if (error) {
    return (
      <Box component="main" sx={{ flex: 1, minHeight: 0, bgcolor: 'background.paper' }}>
        <AdoErrorNotice title="Unable to load QA activity" message={error} />
      </Box>
    )
  }

  return (
    <Box component="main" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {historyWarning ? <Alert severity="warning" role="alert" sx={{ flex: '0 0 auto' }}>{historyWarning}</Alert> : null}
      <QaFlowBoard
        buckets={buckets}
        updatesByItemId={updatesByItemId}
        boardItems={boardItems}
        currentIterationName={currentIterationName}
        teamIterations={teamIterations}
        teamMembers={teamMembers}
        options={options}
        lookbackDays={lookbackDays}
        compactCards={compactCards}
        cardHighlightOptions={cardHighlightOptions}
        view={view}
        standupActive={standupActive}
        onStandupEnd={onStandupEnd}
      />
    </Box>
  )
}
