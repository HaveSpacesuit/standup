import type { Ref, RefObject } from 'react'
import { Box, Button, CircularProgress, IconButton, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { AppTooltip as Tooltip } from './AppTooltip'
import { Icon } from '@stratakit/mui'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgGraphScatterChart from '@stratakit/icons/graph-scatter-chart.svg'
import svgIssueReport from '@stratakit/icons/issue-report.svg'
import svgList from '@stratakit/icons/list.svg'
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
  /** Whether Plan a sprint is open; its strip then takes the place of the button, as the presenter bar does for standup. */
  planning?: boolean
  onPlan?: () => void
  planButtonRef?: Ref<HTMLButtonElement>
  /** Whether there are bugs to plan with; Plan a sprint stays disabled until there are. */
  canPlan?: boolean
  /** The ranked list or the Value map. */
  view?: BacklogView
  onViewChange?: (view: BacklogView) => void
}

export type BacklogView = 'list' | 'map'

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
  planning = false,
  onPlan,
  planButtonRef,
  canPlan = false,
  view = 'list',
  onViewChange,
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

      {onPlan && !planning ? (
        <Tooltip title="Pick the highest-Value bugs that fit an effort budget">
          <span>
            <Button
              ref={planButtonRef}
              size="small"
              variant="contained"
              color="primary"
              startIcon={<Icon href={svgCalendar} />}
              onClick={onPlan}
              disabled={!canPlan}
              sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Plan a sprint
            </Button>
          </span>
        </Tooltip>
      ) : null}

      <TeamToolbarControls
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
        beforeChildren={onViewChange ? (
          <>
            <Typography variant="body-sm" sx={{ fontWeight: 700, whiteSpace: 'nowrap', '@container (max-width: 960px)': { display: 'none' } }}>
              View
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_event, value: BacklogView | null) => {
                if (value) onViewChange(value)
              }}
              aria-label="Backlog view"
            >
              <ToggleButton value="list" render={<Button size="small" startIcon={<Icon href={svgList} />} />}>
                List
              </ToggleButton>
              <ToggleButton value="map" render={<Button size="small" startIcon={<Icon href={svgGraphScatterChart} />} />}>
                Map
              </ToggleButton>
            </ToggleButtonGroup>
          </>
        ) : undefined}
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
