import { Alert, Box } from '@mui/material'
import type { TeamIterationOption, TeamMember, WorkItemSummary, WorkItemUpdate } from '../../../ado/queryEngine'
import { AdoErrorNotice } from './AdoErrorNotice'
import { QualityAssuranceLoadingState } from './QualityAssuranceLoadingState'
import { QaFlowBoard } from './QaFlowBoard'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'

type QualityAssuranceListProps = {
  isLoading: boolean
  error: string | null
  historyWarning: string | null
  buckets: QualityAssuranceBucket[]
  updatesByItemId: Record<number, WorkItemUpdate[]>
  boardItems: WorkItemSummary[]
  currentIterationName: string | null
  teamIterations: TeamIterationOption[]
  testers: TeamMember[]
  testersInferred: boolean
  onChooseTesters?: () => void
  lookbackDays: number
  compactCards: boolean
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
  testers,
  testersInferred,
  onChooseTesters,
  lookbackDays,
  compactCards,
  cardHighlightOptions,
  view,
  standupActive,
  onStandupEnd,
}: QualityAssuranceListProps) {
  if (isLoading) {
    return <QualityAssuranceLoadingState view={view} />
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
        testers={testers}
        testersInferred={testersInferred}
        onChooseTesters={onChooseTesters}
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
