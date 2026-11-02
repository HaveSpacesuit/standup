import { Box, IconButton, InputAdornment, TextField } from '@mui/material'
import type { RefObject } from 'react'
import { Icon } from '@stratakit/mui'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgSearch from '@stratakit/icons/search.svg'

type QuickFilterFieldProps = {
  /** Placeholder and accessible name, e.g. "Quick filter cards". */
  label: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  inputRef: RefObject<HTMLInputElement | null>
  disabled: boolean
}

/** Toolbar search box shared by the pages; "/" or Ctrl/Cmd+F focuses it (see useAppNavigation). */
export function QuickFilterField({ label, value, onChange, onClear, inputRef, disabled }: QuickFilterFieldProps) {
  return (
    <TextField
      size="small"
      placeholder={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputRef={inputRef}
      disabled={disabled}
      sx={{
        minWidth: 90,
        maxWidth: 320,
        flex: '1 1 auto',
      }}
      slotProps={{
        htmlInput: { 'aria-label': label, 'aria-keyshortcuts': '/ Control+F Meta+F' },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Icon href={svgSearch} style={{ color: 'var(--stratakit-color-icon-neutral-secondary)' }} />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                edge="end"
                aria-label="Clear quick filter"
                onClick={onClear}
              >
                <Icon href={svgDismiss} />
              </IconButton>
            </InputAdornment>
          ) : disabled ? undefined : (
            <InputAdornment
              position="end"
              aria-hidden="true"
              sx={{
                '@container (max-width: 650px)': {
                  display: 'none',
                },
              }}
            >
              <Box
                component="kbd"
                sx={{
                  minWidth: 18,
                  px: 0.75,
                  border: '1px solid var(--stratakit-color-border-neutral-muted)',
                  borderRadius: 'var(--stratakit-radius-sm)',
                  color: 'var(--stratakit-color-text-neutral-tertiary)',
                  font: 'inherit',
                  fontSize: 11,
                  lineHeight: '16px',
                  textAlign: 'center',
                }}
              >
                /
              </Box>
            </InputAdornment>
          ),
        },
      }}
    />
  )
}
