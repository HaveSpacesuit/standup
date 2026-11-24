import { Alert, Box, Button, Radio, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgAdd from '@stratakit/icons/add.svg'
import { useEffect, useId, useRef, useState } from 'react'
import type { IdentityRef } from '../../../ado/identity'
import type { QuickAssignController } from '../hooks/useQuickAssign'
import { EffortBadge, WorkItemTypeIcon } from './WorkItemCardParts'
import { visuallyHiddenSx } from './developmentCardDisplay'

const isSameDeveloper = (a: IdentityRef, b: IdentityRef) => a.uniqueName ? a.uniqueName === b.uniqueName : a.displayName === b.displayName

export function QuickAssignCell({ developer, controller }: { developer: IdentityRef; controller: QuickAssignController }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const picker = useRef<HTMLElement>(null)
  const wasOpen = useRef(false)
  const [selected, setSelected] = useState<number | null>(null)
  const open = controller.developer !== null && isSameDeveloper(developer, controller.developer)
  const name = developer.displayName ?? developer.uniqueName ?? 'developer'
  const selectedItem = controller.groups.flatMap((group) => group.items).find((item) => item.id === selected)
  const announcement = controller.success && isSameDeveloper(developer, controller.success.developer) ? controller.success.message : ''

  useEffect(() => {
    setSelected(null)
    if (!open && wasOpen.current) trigger.current?.focus()
    wasOpen.current = open
  }, [open])

  useEffect(() => {
    if (open && !controller.busy) {
      const control = picker.current?.querySelector<HTMLInputElement>('input:checked')
        ?? picker.current?.querySelector<HTMLInputElement>('input')
        ?? picker.current?.querySelector<HTMLButtonElement>('button')
      control?.focus()
    }
  }, [open, controller.busy])

  return (
    <Box sx={{ mt: 'auto', pt: 0.5 }}>
      {/* Stays mounted so the assignment is announced after the picker closes. */}
      <Box role="status" sx={visuallyHiddenSx}>{announcement}</Box>
      <Button
        ref={trigger}
        className="quick-assign-trigger"
        size="small"
        variant="text"
        startIcon={<Icon href={svgAdd} />}
        aria-label={`Quick assign to ${name}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={controller.busy}
        onClick={() => controller.open(developer)}
        sx={{ display: open ? 'none' : undefined }}
      >
        Quick assign
      </Button>
      {open ? (
        <Box
          component="section"
          ref={picker}
          id={id}
          aria-label={`Quick assign to ${name}`}
          aria-busy={controller.busy}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !controller.busy) {
              event.stopPropagation()
              controller.close()
            }
          }}
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper', overflow: 'hidden', mt: 0.5 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 1.5, py: 1 }}>
            <Typography render={<h3 />} variant="body-sm" sx={{ fontWeight: 700 }}>Assign to {name}</Typography>
            <Button size="small" variant="text" disabled={controller.busy} onClick={controller.close}>Close</Button>
          </Box>
          {controller.error ? <Alert severity="error" role="alert">{controller.error}</Alert> : null}
          <Box role="radiogroup" aria-label="Available work items" sx={{ maxHeight: 320, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {controller.groups.length === 0 ? (
              <Typography role="status" variant="body-sm" color="text.secondary" sx={{ p: 1.5 }}>
                No unassigned, unblocked PBIs or bugs in New for this board scope.
              </Typography>
            ) : controller.groups.map((group) => (
              <Box component="section" key={group.key} aria-label={`Sprint ${group.label}`}>
                <Typography
                  render={<h4 />}
                  variant="body-sm"
                  sx={{
                    position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.default',
                    px: 1.5, py: 1, fontWeight: 600, color: 'text.secondary',
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1,
                    borderBlock: '1px solid var(--stratakit-color-border-neutral-muted)',
                  }}
                >
                  {group.label}
                  {group.detail ? (
                    <Box component="span" sx={{ ml: 'auto', color: 'text.secondary', fontSize: 12, fontWeight: 400, whiteSpace: 'nowrap' }}>
                      {group.detail}
                    </Box>
                  ) : null}
                </Typography>
                {group.items.map((item) => (
                  <Box
                    component="label"
                    key={item.id}
                    sx={{
                      // MUI gives the radio input z-index 1; contain it so it scrolls beneath the sticky sprint header.
                      isolation: 'isolate',
                      display: 'flex', gap: 1.25, alignItems: 'center', px: 1, py: 1.25, m: 0.5,
                      borderRadius: 1, cursor: controller.busy ? 'default' : 'pointer',
                      bgcolor: item.id === selected ? 'var(--stratakit-color-bg-glow-on-surface-accent-hover)' : undefined,
                      '&:hover': {
                        bgcolor: controller.busy ? undefined : item.id === selected
                          ? 'var(--stratakit-color-bg-glow-on-surface-accent-hover)' : 'action.hover',
                      },
                      '&:has(input:focus-visible)': { outline: '2px solid var(--stratakit-color-border-info-base)', outlineOffset: -2 },
                    }}
                  >
                    <Radio name={id} value={item.id} checked={selected === item.id} disabled={controller.busy} onChange={() => setSelected(item.id)} sx={{ flexShrink: 0, alignSelf: 'baseline' }} />
                    <Typography component="span" variant="body-sm" sx={{ flex: 1, minWidth: 0, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                      <WorkItemTypeIcon item={item} />
                      {!item.workItemIconUrl ? <Box component="span" sx={visuallyHiddenSx}>{item.workItemType} </Box> : null}
                      <Box component="strong" sx={{ fontWeight: 600, color: 'text.secondary', mr: 0.5, fontVariantNumeric: 'tabular-nums' }}>{item.id}</Box>
                      {' '}{item.title}
                    </Typography>
                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      {typeof item.effort === 'number' && Number.isFinite(item.effort)
                        ? <EffortBadge effort={item.effort} />
                        : <Typography component="span" variant="caption-md" color="text.secondary">Not estimated</Typography>}
                    </Box>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1.5, py: 1, borderTop: '1px solid var(--stratakit-color-border-neutral-muted)' }}>
            <Button
              size="small"
              color="primary"
              disabled={!selectedItem || controller.busy}
              onClick={() => { if (selectedItem) void controller.assign(selectedItem.id) }}
            >
              {controller.busy ? 'Assigning...' : `Assign to ${name}`}
            </Button>
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}
