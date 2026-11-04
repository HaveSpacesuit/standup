import { type RefObject } from 'react'
import { Box, Button, IconButton, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { AppTooltip as Tooltip } from './AppTooltip'
import { Icon } from '@stratakit/mui'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgInspection from '@stratakit/icons/inspection.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import svgPlay from '@stratakit/icons/play.svg'
import svgTimeline from '@stratakit/icons/timeline.svg'
import svgUsers from '@stratakit/icons/users.svg'
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
  view: 'flow' | 'testers'
  onViewChange: (view: 'flow' | 'testers') => void
  onStartStandup: () => void
  standupActive: boolean
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
  view,
  onViewChange,
  onStartStandup,
  standupActive,
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
        beforeChildren={
          <>
            {!standupActive ? (
              <Button
                size="small"
                variant="contained"
                startIcon={<Icon href={svgPlay} />}
                onClick={onStartStandup}
                disabled={!patConfigured || !hasConfiguredTeams || isLoading}
                sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                Start QA standup
              </Button>
            ) : null}
            <Typography variant="body-sm" sx={{ fontWeight: 700, whiteSpace: 'nowrap', '@container (max-width: 960px)': { display: 'none' } }}>
              View
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_event, value: 'flow' | 'testers' | null) => {
                if (value) onViewChange(value)
              }}
              aria-label="QA board view"
            >
              <ToggleButton value="flow" render={<Button size="small" startIcon={<Icon href={svgTimeline} />} />}>
                Flow
              </ToggleButton>
              <ToggleButton value="testers" render={<Button size="small" startIcon={<Icon href={svgUsers} />} />}>
                Testers
              </ToggleButton>
            </ToggleButtonGroup>
          </>
        }
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
