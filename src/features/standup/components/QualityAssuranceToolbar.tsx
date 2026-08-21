import { type RefObject } from 'react'
import { Box, IconButton, InputAdornment, TextField } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgCloudSync from '@stratakit/icons/cloud-sync.svg'
import svgClipboard from '@stratakit/icons/clipboard.svg'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgSettings from '@stratakit/icons/settings.svg'
import { PageToolbar } from './PageToolbar'
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
  return (
    <PageToolbar iconHref={svgClipboard} title="Quality Assurance">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
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
      </Box>

      <TeamToolbarControls
        teamOptions={teamOptions}
        selectedTeamId={selectedTeamId}
        onTeamChange={onTeamChange}
        teamManagementUrl={teamManagementUrl}
      >
        <IconButton
          size="small"
          label="QA options"
          onClick={onOpenOptions}
          disabled={!patConfigured}
        >
          <Icon href={svgSettings} />
        </IconButton>
        <IconButton
          size="small"
          label="Refresh"
          onClick={onRefresh}
          disabled={!patConfigured || isLoading}
        >
          <Icon href={svgCloudSync}  />
        </IconButton>
      </TeamToolbarControls>
    </PageToolbar>
  )
}
