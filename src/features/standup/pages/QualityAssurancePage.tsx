import { useMemo, useState, type RefObject } from 'react'
import { Alert, AlertTitle, Button } from '@mui/material'
import type { TeamOption } from '../components/TeamToolbarControls'
import { QualityAssuranceList } from '../components/QualityAssuranceList'
import { QualityAssuranceToolbar } from '../components/QualityAssuranceToolbar'
import { QaOptionsDialog } from '../components/QaOptionsDialog'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'
import { useRememberedView } from '../hooks/useRememberedView'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import type { QaOptions } from '../utils/qaOptions'
import type { ProjectWorkItemState, TeamIterationOption, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import type { WorkItemUpdate } from '../../../ado/types'
import type { ProjectWorkItemTypeInfo } from '../../../ado/workItemTypesApi'
import type { AttentionItemsState } from '../hooks/useAttentionItems'
import type { WorkItemPreviewSource } from '../hooks/useWorkItemPreview'
import { QaAttentionTagsContext } from '../components/qaAttentionTagsContext'
import { QaAttentionSummary } from '../components/QaAttentionSummary'
import { QaAttentionView } from '../components/QaAttentionView'
import { getQaComingItems, type QaPageView } from '../components/qaBoardModel'
import { DEFAULT_ATTENTION_TAGS } from '../utils/attentionTags'

const QA_VIEWS = ['testers', 'flow', 'attention'] as const
const EMPTY_ATTENTION: AttentionItemsState = { items: [], loading: false, error: null, syncedAt: null }
const EMPTY_STATES: ProjectWorkItemTypeInfo['statesByType'] = {}

type QualityAssurancePageProps = {
  attention?: AttentionItemsState
  attentionPreview?: WorkItemPreviewSource | null
  projectWorkItemStatesByType?: ProjectWorkItemTypeInfo['statesByType']
  boardCoverageUnavailable?: boolean
  patConfigured: boolean
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  buckets: QualityAssuranceBucket[]
  updatesByItemId: Record<number, WorkItemUpdate[]>
  boardItems: WorkItemSummary[]
  currentIterationName: string | null
  teamMembers: TeamMember[]
  /** The team's QA testers, chosen in QA options or inferred from QA activity. */
  testers: TeamMember[]
  /** No testers are chosen in QA options, so testers were inferred. */
  testersInferred: boolean
  compactCards: boolean
  lookbackDays: number
  onRefresh: () => void
  isLoading: boolean
  newItemsError: string | null
  historyWarning: string | null
  qaOptions: QaOptions
  qaOptionsUnreadable?: boolean
  onQaOptionsChange: (next: QaOptions) => void
  cardHighlightOptions: CardHighlightOptions
  onCardHighlightOptionsChange: (next: CardHighlightOptions) => void
  projectWorkItemStates: ProjectWorkItemState[]
  projectWorkItemTypes: string[]
  projectWorkItemStatesLoading: boolean
  projectWorkItemStatesError?: string | null
  retryProjectWorkItemStates?: () => void
  teamIterations: TeamIterationOption[]
  teamIterationsLoading: boolean
  teamIterationsError?: string | null
  /** Open on the view used last (Testers or Flow) instead of Testers. */
  rememberLastView?: boolean
}

export function QualityAssurancePage({
  attention = EMPTY_ATTENTION,
  attentionPreview = null,
  projectWorkItemStatesByType = EMPTY_STATES,
  boardCoverageUnavailable = false,
  patConfigured,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  quickFilterInput,
  onQuickFilterInputChange,
  onQuickFilterClear,
  quickFilterInputRef,
  buckets,
  updatesByItemId,
  boardItems,
  currentIterationName,
  teamMembers,
  testers,
  testersInferred,
  compactCards,
  lookbackDays,
  onRefresh,
  isLoading,
  newItemsError,
  historyWarning,
  qaOptions,
  qaOptionsUnreadable,
  onQaOptionsChange,
  cardHighlightOptions,
  onCardHighlightOptionsChange,
  projectWorkItemStates,
  projectWorkItemTypes,
  projectWorkItemStatesLoading,
  projectWorkItemStatesError,
  retryProjectWorkItemStates,
  teamIterations,
  teamIterationsLoading,
  teamIterationsError,
  rememberLastView = false,
}: QualityAssurancePageProps) {
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [optionsInitialTab, setOptionsInitialTab] = useState<'testers' | 'attention' | undefined>(undefined)
  const [view, setView] = useRememberedView('qa-activity', QA_VIEWS, rememberLastView)
  const [lens, setLens] = useState({ teamId: selectedTeamId, tag: null as string | null, search: '' })
  if (lens.teamId !== selectedTeamId) setLens({ teamId: selectedTeamId, tag: null, search: '' })
  const tags = qaOptions.attentionTags ?? DEFAULT_ATTENTION_TAGS
  const selectedTag = lens.teamId === selectedTeamId && lens.tag && tags.includes(lens.tag) ? lens.tag : null
  const attentionSearch = lens.teamId === selectedTeamId ? lens.search : ''
  const attentionContext = useMemo(() => ({ tags, statesByType: projectWorkItemStatesByType }), [tags, projectWorkItemStatesByType])
  const representedIds = useMemo(() => boardCoverageUnavailable || isLoading || newItemsError || historyWarning || teamIterationsError
    ? null
    : new Set([...buckets.flatMap((bucket) => bucket.items), ...getQaComingItems(buckets, boardItems, currentIterationName)].map((item) => item.id)),
  [boardCoverageUnavailable, isLoading, newItemsError, historyWarning, teamIterationsError, buckets, boardItems, currentIterationName])
  const manageAttention = () => { setOptionsInitialTab('attention'); setOptionsOpen(true) }
  const [standupActive, setStandupActive] = useState(false)
  const hasConfiguredTeams = teamOptions.length > 0
  const handleTeamChange = (teamId: string) => {
    setStandupActive(false)
    onTeamChange(teamId)
  }
  const handleViewChange = (nextView: QaPageView) => {
    if (nextView !== 'testers') setStandupActive(false)
    setView(nextView)
  }
  const startStandup = () => {
    setView('testers')
    setStandupActive(true)
  }
  const recoveryWarning = qaOptionsUnreadable
    ? `Saved QA options for this team could not be read. Defaults are in use: all work item types, a 21-day lookback, no sprint restrictions or hidden-tag filters, default state/tag classification, and E2E/Release attention tags. The stored data has been kept. Back up this team’s “standup:qa-options:${selectedTeamId}” entry in browser local storage, then import a backup via Settings > Teams, edit QA Options and choose Save, or choose Use default QA options to reset. Closing without changes keeps the unreadable data.`

    : undefined

  return (
    <QaAttentionTagsContext.Provider value={attentionContext}>
      <QualityAssuranceToolbar
        patConfigured={patConfigured}
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={handleTeamChange}
        teamManagementUrl={teamManagementUrl}
        quickFilterInput={view === 'attention' ? attentionSearch : quickFilterInput}
        onQuickFilterInputChange={view === 'attention' ? (search) => setLens((current) => ({ ...current, search })) : onQuickFilterInputChange}
        onQuickFilterClear={view === 'attention' ? () => setLens((current) => ({ ...current, search: '' })) : onQuickFilterClear}
        quickFilterInputRef={quickFilterInputRef}
        onRefresh={onRefresh}
        onOpenOptions={() => {
          setOptionsInitialTab(undefined)
          setOptionsOpen(true)
        }}
        isLoading={isLoading || attention.loading}
        attentionCount={!attention.loading && !attention.error && attention.syncedAt !== null ? attention.items.length : undefined}
        view={view}
        onViewChange={handleViewChange}
        onStartStandup={startStandup}
        standupActive={standupActive}
      />

      {recoveryWarning ? <Alert severity="warning" role="alert">{recoveryWarning}</Alert> : null}

      {hasConfiguredTeams && view !== 'attention' ? (
        <QaAttentionSummary attention={attention} tags={tags} representedIds={representedIds}
          onManage={manageAttention} onRetry={onRefresh}
          onReview={(tag) => {
            setLens({ teamId: selectedTeamId, tag, search: '' })
            handleViewChange('attention')
          }} />
      ) : null}
      {!hasConfiguredTeams ? (
        <TeamConfigurationEmptyState pageLabel="Quality Assurance" />
      ) : view === 'attention' ? (
        <QaAttentionView
          attention={attention} tags={tags} representedIds={representedIds}
          selectedTag={selectedTag} onTagChange={(tag) => setLens((current) => ({ ...current, tag }))}
          search={attentionSearch} onManage={manageAttention} onRetry={onRefresh}
          previewSource={attentionPreview} scope={selectedTeamId}
          teamIterations={teamIterationsLoading || teamIterationsError ? undefined : teamIterations}
        />
      ) : teamIterationsError ? (
        <Alert
          role="alert"
          severity="error"
          action={<Button size="small" onClick={onRefresh}>Retry</Button>}
          sx={{ m: 1 }}
        >
          <AlertTitle>Unable to load team iterations</AlertTitle>
          Azure DevOps team settings/iterations request failed: {teamIterationsError} QA results are withheld because the sprint selection could not be verified. Refresh to retry.
        </Alert>
      ) : (
        <QualityAssuranceList
          isLoading={isLoading || teamIterationsLoading}
          error={newItemsError}
          historyWarning={historyWarning}
          buckets={buckets}
          updatesByItemId={updatesByItemId}
          boardItems={boardItems}
          currentIterationName={currentIterationName}
          testers={testers}
          testersInferred={testersInferred}
          onChooseTesters={() => {
            setOptionsInitialTab('testers')
            setOptionsOpen(true)
          }}
          compactCards={compactCards}
          lookbackDays={lookbackDays}
          teamIterations={teamIterations}
          cardHighlightOptions={cardHighlightOptions}
          view={view}
          standupActive={standupActive}
          onStandupEnd={() => setStandupActive(false)}
        />
      )}

      {hasConfiguredTeams ? (
        <QaOptionsDialog
          open={optionsOpen}
          options={qaOptions}
          recoveryWarning={recoveryWarning}
          onClose={() => setOptionsOpen(false)}
          onChange={onQaOptionsChange}
          cardHighlightOptions={cardHighlightOptions}
          onCardHighlightOptionsChange={onCardHighlightOptionsChange}
          projectWorkItemStates={projectWorkItemStates}
          projectWorkItemTypes={projectWorkItemTypes}
          projectWorkItemStatesLoading={projectWorkItemStatesLoading}
          projectWorkItemStatesError={projectWorkItemStatesError}
          retryProjectWorkItemStates={retryProjectWorkItemStates}
          teamIterations={teamIterations}
          teamIterationsLoading={teamIterationsLoading}
          teamMembers={teamMembers}
          initialTab={optionsInitialTab}
        />
      ) : null}
    </QaAttentionTagsContext.Provider>
  )
}
