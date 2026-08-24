import { useState, type RefObject } from 'react'
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
  qaOptions: QaOptions
  onQaOptionsChange: (next: QaOptions) => void
  cardHighlightOptions: CardHighlightOptions
  onCardHighlightOptionsChange: (next: CardHighlightOptions) => void
  projectWorkItemStates: ProjectWorkItemState[]
  projectWorkItemTypes: string[]
  projectWorkItemStatesLoading: boolean
  teamIterations: TeamIterationOption[]
  teamIterationsLoading: boolean
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
  qaOptions,
  onQaOptionsChange,
  cardHighlightOptions,
  onCardHighlightOptionsChange,
  projectWorkItemStates,
  projectWorkItemTypes,
  projectWorkItemStatesLoading,
  teamIterations,
  teamIterationsLoading,
}: QualityAssurancePageProps) {
  const [optionsOpen, setOptionsOpen] = useState(false)
  const hasConfiguredTeams = teamOptions.length > 0

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

      {!hasConfiguredTeams ? (
        <TeamConfigurationEmptyState pageLabel="Quality assurance" />
      ) : (
        <QualityAssuranceList
          isLoading={isLoading}
          error={newItemsError}
          buckets={buckets}
          colorScheme={colorScheme}
          cardHighlightOptions={cardHighlightOptions}
        />
      )}

      {hasConfiguredTeams ? (
        <QaOptionsDialog
          open={optionsOpen}
          options={qaOptions}
          onClose={() => setOptionsOpen(false)}
          onChange={onQaOptionsChange}
          cardHighlightOptions={cardHighlightOptions}
          onCardHighlightOptionsChange={onCardHighlightOptionsChange}
          projectWorkItemStates={projectWorkItemStates}
          projectWorkItemTypes={projectWorkItemTypes}
          projectWorkItemStatesLoading={projectWorkItemStatesLoading}
          teamIterations={teamIterations}
          teamIterationsLoading={teamIterationsLoading}
        />
      ) : null}
    </>
  )
}
