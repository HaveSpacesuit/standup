import type { RefObject } from 'react'
import { Box, CircularProgress, IconButton, Typography } from '@mui/material'
import { AppTooltip as Tooltip } from './AppTooltip'
import { Icon } from '@stratakit/mui'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgIssueReport from '@stratakit/icons/issue-report.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import { PageToolbar } from './PageToolbar'
import { QuickFilterField } from './QuickFilterField'
import { SyncStatus } from './SyncStatus'
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
  /** "43 bugs" or "12 of 43 bugs"; null while there is no list to count. */
  countLabel: string | null
  syncedAt: number | null
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
  countLabel,
  syncedAt,
}: BacklogToolbarProps) {
  const hasConfiguredTeams = teamOptions.length > 0
  const canLoad = patConfigured && hasConfiguredTeams

  return (
    <PageToolbar iconHref={svgIssueReport} title="Backlog" isPageTitle wrap>
      {/* Polite, so screen readers hear the new count once filtering settles. */}
      <Typography
        variant="body-sm"
        color="text.secondary"
        aria-live="polite"
        sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
      >
        {countLabel}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <QuickFilterField
          label="Quick filter bugs"
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
        <Tooltip title="Backlog options">
          <span>
            <IconButton
              size="small"
              aria-label="Backlog options"
              onClick={onOpenSettings}
              disabled={!canLoad}
            >
              <Icon href={svgSettings} />
            </IconButton>
          </span>
        </Tooltip>
        <SyncStatus syncedAt={syncedAt} isLoading={canLoad && isLoading} />
        <Tooltip title="Refresh">
          <span>
            <IconButton
              size="small"
              aria-label="Refresh"
              aria-busy={isLoading || undefined}
              onClick={onRefresh}
              disabled={!canLoad || isLoading}
            >
              {isLoading && canLoad
                ? <CircularProgress size={16} aria-hidden="true" />
                : <Icon href={svgCloudSync} />}
            </IconButton>
          </span>
        </Tooltip>
      </TeamToolbarControls>
    </PageToolbar>
  )
}
