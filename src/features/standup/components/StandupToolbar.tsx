import {
  Avatar,
  Box,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  type SelectChangeEvent,
} from '@mui/material'
import type { RefObject } from 'react'
import { Icon } from '@stratakit/mui'
import type { TeamMember } from '../../../ado/queryEngine'
import svgUsers from '@stratakit/icons/users.svg'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgTag from '@stratakit/icons/tag.svg'
import svgArrowUp from '@stratakit/icons/arrow-up.svg'
import svgArrowDown from '@stratakit/icons/arrow-down.svg'
import { PageToolbar } from './PageToolbar'
import { TeamToolbarControls, type TeamOption } from './TeamToolbarControls'

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
  onMemberFilterCycle: (direction: -1 | 1) => void
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  onRefresh: () => void
  onOpenTagRulesDialog: () => void
  isTeamDataLoading: boolean
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
  onMemberFilterCycle,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  onRefresh,
  onOpenTagRulesDialog,
  isTeamDataLoading,
}: StandupToolbarProps) {
  const handleMemberFilterChange = (event: SelectChangeEvent<string>) => {
    onMemberFilterChange(event.target.value)
  }

  const getMember = (memberName: string) =>
    members.find((member) => member.displayName.localeCompare(memberName, undefined, { sensitivity: 'accent' }) === 0)

  const getCycleTarget = (direction: -1 | 1): string => {
    const cycleValues = ['', ...memberFilterOptions]
    const currentIndex = cycleValues.indexOf(selectedMemberFilter)
    const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex
    const nextIndex = (safeCurrentIndex + direction + cycleValues.length) % cycleValues.length
    return cycleValues[nextIndex]
  }

  const renderMemberFilterOption = (memberName: string, size: number) => {
    const member = getMember(memberName)
    const isAllMembers = !memberName

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Avatar
          alt=""
          src={isAllMembers ? undefined : member?.imageUrl}
          sx={{ width: size, height: size, fontSize: 10 }}
        >
          {isAllMembers ? <Icon href={svgUsers} size="regular" /> : null}
        </Avatar>
        {isAllMembers ? 'All team members' : memberName}
      </Box>
    )
  }

  const previousMemberFilter = getCycleTarget(-1)
  const nextMemberFilter = getCycleTarget(1)
  const isMemberCycleDisabled = !patConfigured || memberFilterOptions.length === 0

  return (
    <PageToolbar iconHref={svgUsers} title="Team Assignments">
        <TextField
          size="small"
          placeholder="Quick filter cards"
          value={quickFilterInput}
          onChange={(event) => onQuickFilterInputChange(event.target.value)}
          inputRef={quickFilterInputRef}
          disabled={!patConfigured}
          sx={{ minWidth: 230, maxWidth: 320 }}
          slotProps={{
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

        <FormControl size="small" sx={{ minWidth: 210, maxWidth: 270 }}>
          <Select
            displayEmpty
            value={selectedMemberFilter}
            onChange={handleMemberFilterChange}
            disabled={!patConfigured || memberFilterOptions.length === 0}
            renderValue={(value) => {
              if (!value || typeof value !== 'string') {
                return renderMemberFilterOption('', 20)
              }

              return renderMemberFilterOption(value, 20)
            }}
          >
            <MenuItem value="">{renderMemberFilterOption('', 24)}</MenuItem>
            {memberFilterOptions.map((memberName) => {
              return (
                <MenuItem key={memberName} value={memberName}>
                  {renderMemberFilterOption(memberName, 24)}
                </MenuItem>
              )
            })}
          </Select>
        </FormControl>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <Tooltip title={renderMemberFilterOption(previousMemberFilter, 24)}>
            <Box component="span">
              <IconButton
                size="small"
                aria-label="Select previous team member filter"
                aria-keyshortcuts="Ctrl+ArrowUp"
                onClick={() => onMemberFilterCycle(-1)}
                disabled={isMemberCycleDisabled}
              >
                <Icon href={svgArrowUp} />
              </IconButton>
            </Box>
          </Tooltip>

          <Tooltip title={renderMemberFilterOption(nextMemberFilter, 24)}>
            <Box component="span">
              <IconButton
                size="small"
                aria-label="Select next team member filter"
                aria-keyshortcuts="Ctrl+ArrowDown"
                onClick={() => onMemberFilterCycle(1)}
                disabled={isMemberCycleDisabled}
              >
                <Icon href={svgArrowDown} />
              </IconButton>
            </Box>
          </Tooltip>
        </Box>

        <TeamToolbarControls
          teamOptions={teamOptions}
          selectedTeamId={selectedTeamId}
          onTeamChange={onTeamChange}
          teamManagementUrl={teamManagementUrl}
        >
          <IconButton
            size="small"
            label="Tag rules"
            onClick={onOpenTagRulesDialog}
            disabled={!patConfigured}
          >
            <Icon href={svgTag} />
          </IconButton>
          <IconButton
            size="small"
            label="Refresh"
            onClick={onRefresh}
            disabled={!patConfigured || isTeamDataLoading}
          >
            <Icon href={svgCloudSync} />
          </IconButton>
        </TeamToolbarControls>
    </PageToolbar>
  )
}
