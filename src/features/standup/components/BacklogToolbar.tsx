import type { RefObject } from 'react'
import { Box, IconButton, InputAdornment, TextField, Tooltip } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgIssueReport from '@stratakit/icons/issue-report.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import { PageToolbar } from './PageToolbar'
import { TeamToolbarControls, type TeamOption } from './TeamToolbarControls'

type BacklogToolbarProps = {
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
  onOpenSettings: () => void
  isLoading: boolean
}

export function BacklogToolbar({
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
  onOpenSettings,
  isLoading,
}: BacklogToolbarProps) {
  const hasConfiguredTeams = teamOptions.length > 0

  return (
    <PageToolbar iconHref={svgIssueReport} title="Backlog" isPageTitle wrap>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <TextField
          size="small"
          placeholder="Quick filter bugs"
          value={quickFilterInput}
          onChange={(event) => onQuickFilterInputChange(event.target.value)}
          inputRef={quickFilterInputRef}
          disabled={!patConfigured}
          sx={{
            minWidth: 90,
            maxWidth: 320,
            flex: '1 1 auto',
          }}
          slotProps={{
            htmlInput: { 'aria-label': 'Quick filter bugs' },
            input: {
              endAdornment: quickFilterInput ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    edge="end"
                    aria-label="Clear quick filter"
                    onClick={onQuickFilterClear}
                  >
                    <Icon href={svgDismiss} />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
      </Box>

      <TeamToolbarControls
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
      >
        <Tooltip title="Backlog settings">
          <span>
            <IconButton
              size="small"
              aria-label="Backlog settings"
              onClick={onOpenSettings}
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
              <Icon href={svgCloudSync} />
            </IconButton>
          </span>
        </Tooltip>
      </TeamToolbarControls>
    </PageToolbar>
  )
}
