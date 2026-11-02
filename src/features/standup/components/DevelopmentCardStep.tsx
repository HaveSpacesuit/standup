import Box from '@mui/material/Box'
import { Icon } from '@stratakit/mui'
import type { ReactNode } from 'react'
import { AdoAvatar } from './AdoAvatar'
import { AppTooltip } from './AppTooltip'
import { getToneColor, visuallyHiddenSx, type NextStep, type StepOwner } from './developmentCardDisplay'

const ownerChipSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  flex: '0 1 auto',
  minWidth: 0,
  maxWidth: 110,
  height: 18,
  px: 1.5,
  borderRadius: 999,
  bgcolor: 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)',
  color: 'text.secondary',
  fontSize: 10,
  fontWeight: 500,
  lineHeight: 1,
  whiteSpace: 'nowrap',
} as const

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

function StepOwnerChip({ owner }: { owner: StepOwner }) {
  if (owner.kind === 'pipeline') {
    return <AppTooltip title="Waiting on the build pipeline"><Box component="span" tabIndex={0} sx={ownerChipSx}>Pipeline</Box></AppTooltip>
  }

  if (owner.kind === 'reviewers') {
    return <AppTooltip title="Waiting on reviewers"><Box component="span" tabIndex={0} sx={ownerChipSx}>Reviewers</Box></AppTooltip>
  }

  const name = owner.identity.displayName ?? owner.identity.uniqueName ?? 'someone else'
  return (
    <AppTooltip title={`Currently assigned to ${name}`}>
      <Box
        component="span"
        aria-label={`Currently assigned to ${name}`}
        tabIndex={0}
        sx={{ ...ownerChipSx, pl: 0.25, bgcolor: 'var(--stratakit-color-bg-info-transparent)' }}
      >
        <AdoAvatar alt="" src={owner.identity.imageUrl} sx={{ width: 14, height: 14, fontSize: 8, flex: '0 0 auto' }}>
          {name.trim().charAt(0).toUpperCase()}
        </AdoAvatar>
        <Box component="span" sx={visuallyHiddenSx}>Assigned to </Box>
        <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{getFirstName(name)}</Box>
      </Box>
    </AppTooltip>
  )
}

/** One short line saying what has to happen next and, when known, who it is waiting on. */
export function DevelopmentCardStep({ step, trailing }: { step: NextStep; trailing?: ReactNode }) {
  const emphasized = step.tone !== 'neutral'

  return (
    <Box
      data-card-step={step.tone}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        mt: 0.75,
        minWidth: 0,
        fontSize: 11,
        lineHeight: 1.3,
        fontWeight: emphasized ? 500 : 400,
        color: getToneColor(step.tone),
      }}
    >
      <Box component="span" sx={{ display: 'inline-flex', flex: '0 0 auto' }}>
        <Icon href={step.iconHref} />
      </Box>
      <AppTooltip title={step.tooltip && step.tooltip !== step.text ? `${step.text}\n${step.tooltip}` : step.text}>
        <Box
          component="span"
          tabIndex={0}
          sx={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {step.text}
        </Box>
      </AppTooltip>
      {step.owner ? <StepOwnerChip owner={step.owner} /> : null}
      {trailing}
    </Box>
  )
}
