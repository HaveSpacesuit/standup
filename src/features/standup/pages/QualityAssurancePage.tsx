import { useState, type RefObject } from 'react'
import { Alert, AlertTitle, Button } from '@mui/material'
import type { TeamOption } from '../components/TeamToolbarControls'
import { QualityAssuranceList } from '../components/QualityAssuranceList'
import { QualityAssuranceToolbar } from '../components/QualityAssuranceToolbar'
import { QaOptionsDialog } from '../components/QaOptionsDialog'
import { TeamConfigurationEmptyState } from '../components/TeamConfigurationEmptyState'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import type { QaOptions } from '../utils/qaOptions'
import type { ProjectWorkItemState, TeamIterationOption } from '../../../ado/queryEngine'

type QualityAssurancePageProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  buckets: QualityAssuranceBucket[]
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
}

export function QualityAssurancePage({
  patConfigured,
  colorScheme,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  quickFilterInput,
  onQuickFilterInputChange,
  onQuickFilterClear,
  quickFilterInputRef,
  buckets,
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
}: QualityAssurancePageProps) {
  const [optionsOpen, setOptionsOpen] = useState(false)
  const hasConfiguredTeams = teamOptions.length > 0
  const recoveryWarning = qaOptionsUnreadable
    ? `Saved QA options for this team could not be read. Defaults are in use: all work item types, a 21-day lookback, no sprint restrictions or hidden-tag filters, and default state/tag classification. The stored data has been kept. Back up this team’s “standup:qa-options:${selectedTeamId}” entry in browser local storage, then import a backup via Settings > Teams, edit QA Options and close to save, or choose Use default QA options to reset. Closing without changes keeps the unreadable data.`

    : undefined

  return (
    <>
      <QualityAssuranceToolbar
        patConfigured={patConfigured}
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
        quickFilterInput={quickFilterInput}
        onQuickFilterInputChange={onQuickFilterInputChange}
        onQuickFilterClear={onQuickFilterClear}
        quickFilterInputRef={quickFilterInputRef}
        onRefresh={onRefresh}
        onOpenOptions={() => setOptionsOpen(true)}
        isLoading={isLoading}
      />

      {recoveryWarning ? <Alert severity="warning" role="alert">{recoveryWarning}</Alert> : null}

      {!hasConfiguredTeams ? (
        <TeamConfigurationEmptyState pageLabel="Quality Assurance" />
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

          isLoading={isLoading}
          error={newItemsError}
          historyWarning={historyWarning}
          buckets={buckets}
          colorScheme={colorScheme}
          cardHighlightOptions={cardHighlightOptions}
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
        />
      ) : null}
    </>
  )
}
