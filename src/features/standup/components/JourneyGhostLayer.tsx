import Box from '@mui/material/Box'
import { useTheme, type Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgHistory from '@stratakit/icons/history.svg'
import { useEffect, useId, useState, type RefObject } from 'react'
import { getJourneyGhost, type SprintJourney } from '../utils/sprintJourney'
import { getStatusColumnColor } from '../utils/statusColumnStyles'

const GHOST_HEIGHT = 28
const GHOST_MAX_WIDTH = 210
/** Narrower columns, such as the empty Blocked rail, get an unlabeled ghost. */
const LABELED_COLUMN_MIN_WIDTH = 120

type GhostGeometry = {
  x: number
  y: number
  width: number
  label: string | null
  color: string
  path: string
}

function findJourneyCard(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-journey-id]') : null
}

function measureGhost(
  container: HTMLElement,
  card: HTMLElement,
  journeysByItemId: Record<number, SprintJourney>,
  palette: Theme['palette'],
): GhostGeometry | null {
  const journey = journeysByItemId[Number(card.dataset.journeyId)]
  const ghost = journey ? getJourneyGhost(journey) : null
  const column = ghost ? container.querySelector<HTMLElement>(`[data-board-column="${ghost.status}"]`) : null
  if (!ghost || !column) {
    return null
  }

  const box = container.getBoundingClientRect()
  const cardBox = card.getBoundingClientRect()
  const columnBox = column.getBoundingClientRect()
  const labeled = columnBox.width >= LABELED_COLUMN_MIN_WIDTH
  const width = labeled ? Math.min(columnBox.width - 20, GHOST_MAX_WIDTH) : Math.max(columnBox.width - 12, 16)
  const x = columnBox.left - box.left + (columnBox.width - width) / 2
  const y = cardBox.top - box.top + 4
  const cardLeft = cardBox.left - box.left
  const ghostIsLeft = x + width <= cardLeft
  const x1 = ghostIsLeft ? x + width : x
  const y1 = y + GHOST_HEIGHT / 2
  const x2 = ghostIsLeft ? cardLeft - 3 : cardBox.right - box.left + 3
  const y2 = cardBox.top - box.top + Math.min(cardBox.height / 2, 26)
  const lift = Math.min(y1, y2) - 22
  const middle = (x1 + x2) / 2

  return {
    x,
    y,
    width,
    label: labeled ? ghost.label : null,
    color: getStatusColumnColor(ghost.status, palette),
    path: `M${x1},${y1} C${middle},${lift} ${middle},${lift} ${x2},${y2}`,
  }
}

/**
 * While a card with a sprint journey is hovered or focused, marks where it started (or the column it
 * reached farthest from) with a dashed ghost joined to the card by a curved connector.
 * Purely visual: the card's trail already describes the journey to assistive technology.
 */
export function JourneyGhostLayer({
  containerRef,
  journeysByItemId,
}: {
  containerRef: RefObject<HTMLElement | null>
  journeysByItemId: Record<number, SprintJourney>
}) {
  const theme = useTheme()
  const markerId = `journey-ghost-arrow-${useId().replace(/[^\w-]/g, '')}`
  const [ghost, setGhost] = useState<GhostGeometry | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    let activeCard: HTMLElement | null = null
    const show = (card: HTMLElement | null) => {
      if (card === activeCard) {
        return
      }
      activeCard = card
      setGhost(card ? measureGhost(container, card, journeysByItemId, theme.palette) : null)
    }
    const handleEnter = (event: Event) => show(findJourneyCard(event.target))
    const handleLeave = () => show(null)
    const handleFocusOut = (event: FocusEvent) => {
      if (!findJourneyCard(event.relatedTarget)) {
        show(null)
      }
    }

    container.addEventListener('mouseover', handleEnter)
    container.addEventListener('mouseleave', handleLeave)
    container.addEventListener('focusin', handleEnter)
    container.addEventListener('focusout', handleFocusOut)
    return () => {
      container.removeEventListener('mouseover', handleEnter)
      container.removeEventListener('mouseleave', handleLeave)
      container.removeEventListener('focusin', handleEnter)
      container.removeEventListener('focusout', handleFocusOut)
      setGhost(null)
    }
  }, [containerRef, journeysByItemId, theme.palette])

  if (!ghost) {
    return null
  }

  const [lead, ...rest] = ghost.label?.split(' · ') ?? []
  const paper = (theme.vars || theme).palette.background.paper

  return (
    <Box
      aria-hidden="true"
      data-journey-ghost=""
      sx={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', overflow: 'visible' }}
    >
      <Box component="svg" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 Z" fill={ghost.color} />
          </marker>
        </defs>
        <path
          d={ghost.path}
          fill="none"
          stroke={ghost.color}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          markerEnd={`url(#${markerId})`}
        />
      </Box>
      <Box
        sx={{
          position: 'absolute',
          left: ghost.x,
          top: ghost.y,
          width: ghost.width,
          height: GHOST_HEIGHT,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: ghost.label ? 'flex-start' : 'center',
          gap: 0.75,
          px: ghost.label ? 1 : 0,
          border: `1.5px dashed ${ghost.color}`,
          borderRadius: 1.5,
          bgcolor: `color-mix(in srgb, ${ghost.color} 9%, ${paper})`,
          boxShadow: 'var(--stratakit-shadow-surface-sm)',
          color: 'text.secondary',
          fontSize: 11,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <Box component="span" sx={{ display: 'inline-flex', flex: '0 0 auto' }}>
          <Icon href={svgHistory} style={{ color: ghost.color }} />
        </Box>
        {ghost.label ? (
          <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Box component="b" sx={{ color: 'text.primary', fontWeight: 600 }}>{lead}</Box>
            {rest.length > 0 ? ` · ${rest.join(' · ')}` : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}
