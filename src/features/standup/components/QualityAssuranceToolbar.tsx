import { type RefObject } from 'react'
import { Box, IconButton } from '@mui/material'
import { AppTooltip as Tooltip } from './AppTooltip'
import { Icon } from '@stratakit/mui'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgInspection from '@stratakit/icons/inspection.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import { PageToolbar } from './PageToolbar'
import { QuickFilterField } from './QuickFilterField'
import { TeamToolbarControls, type TeamOption } from './TeamToolbarControls'

type QualityAssuranceToolbarProps = {
  patConfigured: boolean
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  onRefresh: () => void
  onOpenOptions: () => void
  isLoading: boolean
}

export function QualityAssuranceToolbar({
  patConfigured,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  quickFilterInput,
  onQuickFilterInputChange,
  onQuickFilterClear,
  quickFilterInputRef,
  onRefresh,
  onOpenOptions,
  isLoading,
}: QualityAssuranceToolbarProps) {
  const hasConfiguredTeams = teamOptions.length > 0

  return (
    <PageToolbar iconHref={svgInspection} title="Quality Assurance" isPageTitle wrap>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <QuickFilterField
          label="Quick filter cards"
          value={quickFilterInput}
          onChange={onQuickFilterInputChange}
          onClear={onQuickFilterClear}
          inputRef={quickFilterInputRef}
          disabled={!patConfigured}
        />
      </Box>

      <TeamToolbarControls
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
      >
        <Tooltip title="QA options">
          <span>
            <IconButton
              size="small"
              aria-label="QA options"
              onClick={onOpenOptions}
              disabled={!patConfigured || !hasConfiguredTeams}
            >
              <Icon href={svgSettings} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Refresh">
          <span>
            <IconButton
              size="small"
              aria-label="Refresh"
              onClick={onRefresh}
              disabled={!patConfigured || !hasConfiguredTeams || isLoading}
            >
              <Icon href={svgCloudSync}  />
            </IconButton>
          </span>
        </Tooltip>
      </TeamToolbarControls>
    </PageToolbar>
  )
}
