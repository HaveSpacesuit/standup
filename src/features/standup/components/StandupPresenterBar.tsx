import { Box, Button, ButtonBase, Divider, FormControl, MenuItem, Select, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgArrowDown from '@stratakit/icons/arrow-down.svg'
import svgArrowUp from '@stratakit/icons/arrow-up.svg'
import svgCheckmark from '@stratakit/icons/checkmark.svg'
import svgStop from '@stratakit/icons/stop.svg'
import svgStopwatch from '@stratakit/icons/stopwatch.svg'
import { useEffect, useState } from 'react'
import { AdoAvatar } from './AdoAvatar'
import { AppTooltip } from './AppTooltip'
import { visuallyHiddenSx } from './developmentCardDisplay'
import type { BoardRowData } from './KanbanBoardGrid'
import {
  formatStandupTime,
  getFirstName,
  STANDUP_ORDER_OPTIONS,
  STANDUP_TURN_SECONDS,
  type StandupOrderMode,
} from './standupOrder'

const PAGE_BACKGROUND = 'var(--stratakit-color-bg-page-base)'
const ACCENT_BORDER = 'var(--stratakit-color-border-accent-base)'

function isStandupOrderMode(value: unknown): value is StandupOrderMode {
  return STANDUP_ORDER_OPTIONS.some((option) => option.value === value)
}

/** Counts up from when its speaker's turn began; remount it to restart. */
function TurnTimer() {
  const [startedAt] = useState(() => Date.now())
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => window.clearInterval(interval)
  }, [startedAt])

  const over = elapsedSeconds >= STANDUP_TURN_SECONDS

  return (
    <AppTooltip title={`Time this turn. Turns amber after ${formatStandupTime(STANDUP_TURN_SECONDS)}.`}>
      <Typography
        component="span"
        role="timer"
        variant="body-sm"
        tabIndex={0}
        data-turn-timer={over ? 'over' : ''}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.625, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
        style={over ? { color: 'var(--stratakit-color-text-attention-base)' } : undefined}
      >
        <Icon
          href={svgStopwatch}
          style={{ color: over ? 'var(--stratakit-color-icon-attention-base)' : 'var(--stratakit-color-icon-neutral-secondary)' }}
        />
        <Box component="span" sx={visuallyHiddenSx}>Turn time </Box>
        {formatStandupTime(elapsedSeconds)}
      </Typography>
    </AppTooltip>
  )
}

type QueueState = 'spoken' | 'current' | 'waiting'

function QueueButton({ speaker, state, onClick }: { speaker: BoardRowData; state: QueueState; onClick: () => void }) {
  return (
    <li>
      <AppTooltip title={state === 'current' ? `${speaker.label} (speaking)` : state === 'spoken' ? `${speaker.label} (done)` : speaker.label}>
        <ButtonBase
          nativeButton
          aria-label={state === 'spoken' ? `${speaker.label}, done` : speaker.label}
          aria-current={state === 'current' ? 'step' : undefined}
          data-queue-state={state}
          onClick={onClick}
          sx={{
            position: 'relative',
            display: 'block',
            p: 0,
            borderRadius: '50%',
            opacity: state === 'waiting' ? 0.5 : 1,
            '&:hover': { opacity: 1 },
            '&:focus-visible': { outline: `2px solid ${ACCENT_BORDER}`, outlineOffset: 3 },
          }}
        >
          <AdoAvatar
            alt={speaker.label}
            descriptor={speaker.avatarDescriptor}
            src={speaker.avatarUrl}
            sx={{
              width: 22,
              height: 22,
              fontSize: 10,
              boxShadow: state === 'current' ? `0 0 0 2px ${PAGE_BACKGROUND}, 0 0 0 4px ${ACCENT_BORDER}` : undefined,
            }}
          />
          {state === 'spoken' ? (
            <Box
              component="span"
              aria-hidden="true"
              sx={{
                position: 'absolute',
                right: -3,
                bottom: -3,
                width: 12,
                height: 12,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'var(--stratakit-color-bg-positive-base)',
                boxShadow: `0 0 0 1.5px ${PAGE_BACKGROUND}`,
              }}
            >
              <Icon href={svgCheckmark} style={{ width: 10, height: 10, color: PAGE_BACKGROUND }} />
            </Box>
          ) : null}
        </ButtonBase>
      </AppTooltip>
    </li>
  )
}

type StandupPresenterBarProps = {
  speakers: readonly BoardRowData[]
  currentIndex: number
  spokenKeys: ReadonlySet<string>
  orderMode: StandupOrderMode
  onOrderModeChange: (mode: StandupOrderMode) => void
  /** Moving past the last speaker finishes the standup. */
  onGoTo: (index: number) => void
  onEnd: () => void
}

/** Runs a standup: who is speaking, for how long, who is next, and the controls to move on. */
export function StandupPresenterBar({
  speakers,
  currentIndex,
  spokenKeys,
  orderMode,
  onOrderModeChange,
  onGoTo,
  onEnd,
}: StandupPresenterBarProps) {
  const current = speakers[currentIndex]
  const next = speakers[currentIndex + 1]

  useEffect(() => {
    if (!current) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
        return
      }

      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable || document.querySelector('[aria-modal="true"]')) {
        return
      }

      // Standup owns Ctrl+Up/Down while it runs; the member filter shortcut must not fire as well.
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'ArrowDown') {
        onGoTo(currentIndex + 1)
      } else if (currentIndex > 0) {
        onGoTo(currentIndex - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [current, currentIndex, onGoTo])

  return (
    <Box
      component="section"
      aria-label="Standup"
      data-standup-presenter=""
      sx={{
        position: 'relative',
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 1.5,
        rowGap: 0.75,
        px: 2,
        py: 0.75,
        minHeight: 44,
        background: `color-mix(in srgb, var(--stratakit-color-bg-accent-base) 10%, ${PAGE_BACKGROUND})`,
        borderBottom: '1px solid var(--stratakit-color-border-accent-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      <Typography
        component="span"
        variant="body-sm"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.875, fontWeight: 700, color: 'var(--stratakit-color-text-accent-strong)' }}
      >
        <Box
          component="span"
          aria-hidden="true"
          sx={{
            flexShrink: 0,
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: 'var(--stratakit-color-bg-critical-base)',
            boxShadow: '0 0 0 3px color-mix(in srgb, var(--stratakit-color-bg-critical-base) 25%, transparent)',
          }}
        />
        Standup
      </Typography>

      {current ? (
        <>
          <TurnTimer key={current.key} />
          <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />
          <Box aria-hidden="true" data-current-speaker="" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <AdoAvatar
              alt={current.label}
              descriptor={current.avatarDescriptor}
              src={current.avatarUrl}
              sx={{ width: 24, height: 24, fontSize: 11 }}
            />
            <Typography component="span" variant="body-md" sx={{ fontWeight: 700 }}>
              {current.label}
            </Typography>
            <Typography component="span" variant="body-sm" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {currentIndex + 1} of {speakers.length}
            </Typography>
          </Box>
          <Box role="status" sx={visuallyHiddenSx}>
            Now speaking: {current.label}, {currentIndex + 1} of {speakers.length}
          </Box>
          <Box
            component="ol"
            aria-label="Speaking order"
            sx={{ listStyle: 'none', m: 0, p: 0, pl: 0.5, display: 'flex', alignItems: 'center', gap: 0.75 }}
          >
            {speakers.map((speaker, index) => (
              <QueueButton
                key={speaker.key}
                speaker={speaker}
                state={index === currentIndex ? 'current' : spokenKeys.has(speaker.key) ? 'spoken' : 'waiting'}
                onClick={() => onGoTo(index)}
              />
            ))}
          </Box>
        </>
      ) : (
        <Typography component="span" variant="body-sm" sx={{ color: 'text.secondary' }}>
          Waiting for team members to appear on the board.
        </Typography>
      )}

      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography component="span" variant="body-sm" aria-hidden="true" sx={{ color: 'text.secondary' }}>
          Order
        </Typography>
        <FormControl size="small">
          <Select
            aria-label="Standup order"
            value={orderMode}
            onChange={(event) => {
              if (isStandupOrderMode(event.target.value)) {
                onOrderModeChange(event.target.value)
              }
            }}
          >
            {STANDUP_ORDER_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Icon href={svgArrowUp} />}
          aria-keyshortcuts="Control+ArrowUp"
          disabled={!current || currentIndex === 0}
          onClick={() => onGoTo(currentIndex - 1)}
        >
          Previous
        </Button>
        <Button
          size="small"
          variant="contained"
          color="primary"
          startIcon={<Icon href={next ? svgArrowDown : svgCheckmark} />}
          aria-keyshortcuts="Control+ArrowDown"
          disabled={!current}
          onClick={() => onGoTo(currentIndex + 1)}
        >
          {next ? `Next: ${getFirstName(next.label)}` : 'Finish'}
        </Button>
        <Button size="small" variant="outlined" startIcon={<Icon href={svgStop} />} onClick={onEnd}>
          End
        </Button>
      </Box>
    </Box>
  )
}
