import {
  Avatar,
  Box,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  TextField,
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
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Avatar alt="" src={svgUsers} sx={{ width: 20, height: 20 }} />
                    All team members
                  </Box>
                )
              }

              const member = getMember(value)
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Avatar
                    alt=""
                    src={member?.imageUrl}
                    sx={{ width: 20, height: 20, fontSize: 10 }}
                  />
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {value}
                  </Box>
                </Box>
              )
            }}
          >
            <MenuItem value="">
              <Avatar alt="" src={svgUsers} sx={{ width: 24, height: 24, mr: 1 }} />
              All team members
            </MenuItem>
            {memberFilterOptions.map((memberName) => {
              const member = getMember(memberName)

              return (
                <MenuItem key={memberName} value={memberName}>
                  <Avatar
                    alt=""
                    src={member?.imageUrl}
                    sx={{ width: 24, height: 24, mr: 1, fontSize: 10 }}
                  />
                  {memberName}
                </MenuItem>
              )
            })}
          </Select>
        </FormControl>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            aria-label="Select previous team member filter"
            aria-keyshortcuts="Ctrl+ArrowUp"
            onClick={() => onMemberFilterCycle(-1)}
            disabled={!patConfigured || memberFilterOptions.length === 0}
          >
            <Icon href={svgArrowUp} />
          </IconButton>

          <IconButton
            size="small"
            aria-label="Select next team member filter"
            aria-keyshortcuts="Ctrl+ArrowDown"
            onClick={() => onMemberFilterCycle(1)}
            disabled={!patConfigured || memberFilterOptions.length === 0}
          >
            <Icon href={svgArrowDown} />
          </IconButton>
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
