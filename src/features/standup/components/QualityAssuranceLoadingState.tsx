import { Box } from '@mui/material'
import { LANE_COLUMN_WIDTH } from '../utils/boardLayout'
import { KanbanBoardLoadingState } from './KanbanBoardLoadingState'
import { QaSprintRibbonSkeleton } from './QaFlowBoard'
import { getQaBoardLayout, type QaColumnId, type QaView } from './qaBoardModel'

type QualityAssuranceLoadingStateProps = {
  view: QaView
}

const LOADING_COLUMNS: readonly QaColumnId[] = ['new', 'coming', 'needs-testing', 'needs-development', 'done']
// Counts are unknown while loading, so no column is drawn as a rail.
const LOADING_COLUMN_STATES = LOADING_COLUMNS.map((id) => ({ id, rail: false }))
const FLOW_LAYOUT = getQaBoardLayout(LOADING_COLUMN_STATES)
const TESTERS_LAYOUT = getQaBoardLayout(LOADING_COLUMN_STATES, LANE_COLUMN_WIDTH)

/** The QA board's placeholder: its sprint ribbon, then the open view's columns, with tester lanes in the Testers view. */
export function QualityAssuranceLoadingState({ view }: QualityAssuranceLoadingStateProps) {
  const lanes = view === 'testers'

  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.default',
      }}
    >
      <QaSprintRibbonSkeleton />
      <Box sx={{ flex: '1 1 auto', minHeight: 0 }}>
        <KanbanBoardLoadingState
          layout={lanes ? TESTERS_LAYOUT : FLOW_LAYOUT}
          columns={LOADING_COLUMNS}
          lanes={lanes}
          message="Loading QA activity..."
          detail="Fetching newly added, coming up, ready for QA, back in development, and recently completed items."
        />
      </Box>
    </Box>
  )
}
