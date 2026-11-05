import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { AppTooltip as Tooltip } from './AppTooltip'
import type { RefObject } from 'react'
import { Icon } from '@stratakit/mui'
import type { TeamMember } from '../../../ado/queryEngine'
import { AdoAvatar } from './AdoAvatar'
import svgUsers from '@stratakit/icons/users.svg'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import svgPlay from '@stratakit/icons/play.svg'
import svgTimeline from '@stratakit/icons/timeline.svg'
import svgDeveloper from '@stratakit/icons/developer.svg'
import { PageToolbar } from './PageToolbar'
import { QuickFilterField } from './QuickFilterField'
import { SyncStatus } from './SyncStatus'
import { TeamToolbarControls, type TeamOption } from './TeamToolbarControls'
import { readStringSelectValue } from '../utils/selectValues'

type StandupToolbarProps = {
  patConfigured: boolean
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  selectedMemberFilter: string
  memberFilterOptions: string[]
  members: TeamMember[]
  onMemberFilterChange: (value: string) => void
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  onRefresh: () => void
  onOpenTagRulesDialog: () => void
  isTeamDataLoading: boolean
  /** When the board data last loaded fresh; the "Synced" label stays hidden until then. */
  teamDataSyncedAt?: number | null
  isSprintView: boolean
  onSprintViewChange: (isSprintView: boolean) => void
  /** While standup runs it decides whose lane is shown, so the member filter is locked. */
  standupActive?: boolean
  onStartStandup?: () => void
  /** Sprint view's primary action, in place of Start standup: plays the sprint from its first day. */
  onReplaySprint?: () => void
  /** Replay waits for the sprint's history; until then its button is disabled. */
  replayAvailable?: boolean
}

export function StandupToolbar({
  patConfigured,
  quickFilterInput,
  onQuickFilterInputChange,
  onQuickFilterClear,
  quickFilterInputRef,
  selectedMemberFilter,
  memberFilterOptions,
  members,
  onMemberFilterChange,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  onRefresh,
  onOpenTagRulesDialog,
  isTeamDataLoading,
  teamDataSyncedAt = null,
  isSprintView,
  onSprintViewChange,
  standupActive = false,
  onStartStandup,
  onReplaySprint,
  replayAvailable = false,
}: StandupToolbarProps) {
  const hasConfiguredTeams = teamOptions.length > 0

  const handleMemberFilterChange = (value: unknown) => {
    onMemberFilterChange(readStringSelectValue(value))
  }

  const getMember = (memberName: string) =>
    members.find((member) => member.displayName.localeCompare(memberName, undefined, { sensitivity: 'accent' }) === 0)

  const renderMemberFilterOption = (memberName: string, size: number, hideTextOnNarrow = false) => {
    const member = getMember(memberName)
    const isAllMembers = !memberName

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <AdoAvatar
          alt=""
          descriptor={member?.descriptor}
          src={isAllMembers ? undefined : member?.imageUrl}
          sx={{ width: size, height: size, fontSize: 10, flexShrink: 0 }}
        >
          {isAllMembers ? <Icon href={svgUsers} size="regular" /> : null}
        </AdoAvatar>
        <Box
          component="span"
          sx={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            ...(hideTextOnNarrow
              ? {
                  '@container (max-width: 650px)': {
                    display: 'none',
                  },
                }
              : {}),
          }}
        >
          {isAllMembers ? 'All team members' : memberName}
        </Box>
      </Box>
    )
  }

  return (
    <PageToolbar iconHref={svgDeveloper} title="Development" isPageTitle wrap>
        <QuickFilterField
          label="Quick filter cards"
          value={quickFilterInput}
          onChange={onQuickFilterInputChange}
          onClear={onQuickFilterClear}
          inputRef={quickFilterInputRef}
          disabled={!patConfigured}
        />

        <FormControl
          size="small"
          sx={{
            minWidth: 52,
            maxWidth: 270,
            flex: '1 1 auto',
          }}
        >
          <Select
            aria-label="Filter by team member"
            displayEmpty
            value={selectedMemberFilter}
            onChange={(event) => handleMemberFilterChange(event.target.value)}
            disabled={!patConfigured || memberFilterOptions.length === 0 || standupActive}
            renderValue={(value) => {
              if (!value || typeof value !== 'string') {
                return renderMemberFilterOption('', 20, true)
              }

              return renderMemberFilterOption(value, 20, true)
            }}
          >
            <MenuItem value="">{renderMemberFilterOption('', 24, false)}</MenuItem>
            {memberFilterOptions.map((memberName) => {
              return (
                <MenuItem key={memberName} value={memberName}>
                  {renderMemberFilterOption(memberName, 24, false)}
                </MenuItem>
              )
            })}
          </Select>
        </FormControl>

        {isSprintView && onReplaySprint ? (
          <Tooltip title={replayAvailable ? 'Play the sprint from its first day to today' : 'Available once the sprint\u2019s history loads'}>
            <span>
              <Button
                size="small"
                variant="contained"
                color="primary"
                startIcon={<Icon href={svgPlay} />}
                onClick={onReplaySprint}
                disabled={!patConfigured || !replayAvailable}
                sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                Replay sprint
              </Button>
            </span>
          </Tooltip>
        ) : onStartStandup && !standupActive ? (
          <Button
            size="small"
            variant="contained"
            color="primary"
            startIcon={<Icon href={svgPlay} />}
            onClick={onStartStandup}
            disabled={!patConfigured || memberFilterOptions.length === 0}
            sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            Start standup
          </Button>
        ) : null}

        <TeamToolbarControls
          teamOptions={teamOptions}
          selectedTeamId={selectedTeamId}
          onTeamChange={onTeamChange}
          teamManagementUrl={teamManagementUrl}
          beforeChildren={
            <>
              <Typography
                variant="body-sm"
                sx={{
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  '@container (max-width: 960px)': {
                    display: 'none',
                  },
                }}
              >
                View
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={isSprintView ? 'sprint' : 'assignment'}
                onChange={(_event, value: 'assignment' | 'sprint' | null) => {
                  if (value) {
                    onSprintViewChange(value === 'sprint')
                  }
                }}
                aria-label="Assignments board view"
              >
                <ToggleButton value="assignment" render={<Button size="small" startIcon={<Icon href={svgUsers} />} />}>
                  Developers
                </ToggleButton>
                <ToggleButton value="sprint" render={<Button size="small" startIcon={<Icon href={svgTimeline} />} />}>
                  Sprint
                </ToggleButton>
              </ToggleButtonGroup>
            </>
          }
        >
          <Tooltip title="Development options">
            <span>
              <IconButton
                size="small"
                aria-label="Development options"
                onClick={onOpenTagRulesDialog}
                disabled={!patConfigured || !hasConfiguredTeams}
              >
                <Icon href={svgSettings} />
              </IconButton>
            </span>
          </Tooltip>
          <SyncStatus syncedAt={teamDataSyncedAt} isLoading={patConfigured && hasConfiguredTeams && isTeamDataLoading} />
          <Tooltip title="Refresh">
            <span>
              <IconButton
                size="small"
                aria-label="Refresh"
                aria-busy={isTeamDataLoading || undefined}
                onClick={onRefresh}
                disabled={!patConfigured || !hasConfiguredTeams || isTeamDataLoading}
              >
                {isTeamDataLoading && patConfigured && hasConfiguredTeams
                  ? <CircularProgress size={16} aria-hidden="true" />
                  : <Icon href={svgCloudSync} />}
              </IconButton>
            </span>
          </Tooltip>
        </TeamToolbarControls>
    </PageToolbar>
  )
}
