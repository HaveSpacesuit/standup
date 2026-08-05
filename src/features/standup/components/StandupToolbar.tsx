import {
  AppBar,
  Box,
  Button,
  Chip,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Switch,
  TextField,
  Toolbar,
  Typography,
  type SelectChangeEvent,
} from '@mui/material'
import type { RefObject } from 'react'
import { Icon } from '@stratakit/mui'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgFilter from '@stratakit/icons/filter.svg'
import svgAssign from '@stratakit/icons/assign.svg'

type TeamOption = {
  id: string
  displayName: string
}

type StandupToolbarProps = {
  patConfigured: boolean
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
  quickFilterInput: string
  onQuickFilterInputChange: (value: string) => void
  onQuickFilterClear: () => void
  quickFilterInputRef: RefObject<HTMLInputElement | null>
  selectedMemberFilter: string
  memberFilterOptions: string[]
  onMemberFilterChange: (value: string) => void
  teamOptions: TeamOption[]
  selectedTeamId: string
  onTeamChange: (value: string) => void
  teamManagementUrl: string
  onRefresh: () => void
  onOpenHiddenTagsDialog: () => void
  isTeamDataLoading: boolean
  hiddenTagsCount: number
}

export function StandupToolbar({
  patConfigured,
  colorScheme,
  onToggleColorScheme,
  quickFilterInput,
  onQuickFilterInputChange,
  onQuickFilterClear,
  quickFilterInputRef,
  selectedMemberFilter,
  memberFilterOptions,
  onMemberFilterChange,
  teamOptions,
  selectedTeamId,
  onTeamChange,
  teamManagementUrl,
  onRefresh,
  onOpenHiddenTagsDialog,
  isTeamDataLoading,
  hiddenTagsCount,
}: StandupToolbarProps) {
  const handleMemberFilterChange = (event: SelectChangeEvent<string>) => {
    onMemberFilterChange(event.target.value)
  }

  const handleTeamChange = (event: SelectChangeEvent<string>) => {
    onTeamChange(event.target.value)
  }

  return (
    <AppBar position="static">
      <Toolbar sx={{ gap: 1.5 }}>
        <Icon href={svgCalendar} size="large" />
        <Typography variant="body-lg" sx={{ fontWeight: 700 }}>
          Team Standup
        </Typography>

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
            renderValue={(value) =>
              value && typeof value === 'string' ? value : 'All team members'
            }
          >
            <MenuItem value="">All team members</MenuItem>
            {memberFilterOptions.map((memberName) => (
              <MenuItem key={memberName} value={memberName}>
                {memberName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 420 }}>
          <Typography variant="body-sm" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            Team
          </Typography>

          <FormControl size="small" sx={{ minWidth: 260, flex: 1 }}>
            <Select value={selectedTeamId} onChange={handleTeamChange}>
              {teamOptions.map((team) => (
                <MenuItem key={team.id} value={team.id}>
                  {team.displayName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            size="small"
            variant="outlined"
            component="a"
            href={teamManagementUrl}
            target="_blank"
            rel="noreferrer noopener"
            startIcon={<Icon href={svgAssign} />}
          >
            Manage team
          </Button>

          <Button
            size="small"
            variant="outlined"
            startIcon={<Icon href={svgCloudSync} />}
            onClick={onRefresh}
            disabled={!patConfigured || isTeamDataLoading}
          >
            Refresh
          </Button>

          <Button
            size="small"
            variant="outlined"
            startIcon={<Icon href={svgFilter} />}
            onClick={onOpenHiddenTagsDialog}
            disabled={!patConfigured}
          >
            Hidden tags
          </Button>
        </Box>

        {hiddenTagsCount > 0 ? (
          <Chip
            size="small"
            variant="outlined"
            label={`${hiddenTagsCount} hidden tag${hiddenTagsCount === 1 ? '' : 's'}`}
            sx={{
              borderColor: 'warning.main',
              color: 'warning.main',
            }}
          />
        ) : null}

        <FormControlLabel
          sx={{ ml: 0.25 }}
          control={
            <Switch
              size="small"
              checked={colorScheme === 'dark'}
              onChange={onToggleColorScheme}
            />
          }
          label={<Typography variant="body-sm">Dark mode</Typography>}
        />
      </Toolbar>
    </AppBar>
  )
}
