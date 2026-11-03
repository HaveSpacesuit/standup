import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

const FLIP_ANIMATION_ID = 'card-flip'
const MOVE_MS = 480
const MOVE_EASING = 'cubic-bezier(0.2, 0.7, 0.2, 1)'
const ENTER_MS = 360

type CardPosition = { left: number; top: number }

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function cardsIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-card-id]')]
}

/**
 * Slides cards from where they were to where they now are (FLIP), and fades in cards that weren't on
 * the board. Call the returned `capture` just before a change that moves cards; the next render then
 * animates every card in view. Cards are matched by `data-card-id`, so a card moving to another cell
 * still slides. Nothing animates when reduced motion is preferred.
 */
export function useCardFlip(containerRef: RefObject<HTMLElement | null>): () => void {
  const capturedRef = useRef<Map<string, CardPosition> | null>(null)

  const capture = useCallback(() => {
    const container = containerRef.current
    if (!container || typeof container.animate !== 'function' || prefersReducedMotion()) {
      capturedRef.current = null
      return
    }

    // A card still sliding from the last change starts from where it is drawn right now.
    const positions = new Map<string, CardPosition>()
    for (const card of cardsIn(container)) {
      const id = card.dataset.cardId
      if (id && !positions.has(id)) {
        const rect = card.getBoundingClientRect()
        positions.set(id, { left: rect.left, top: rect.top })
      }
    }
    capturedRef.current = positions
  }, [containerRef])

  useLayoutEffect(() => {
    const before = capturedRef.current
    const container = containerRef.current
    capturedRef.current = null
    if (!before || !container) {
      return
    }

    const cards = cardsIn(container)
    for (const card of cards) {
      for (const animation of card.getAnimations()) {
        if (animation.id === FLIP_ANIMATION_ID) {
          animation.cancel()
        }
      }
    }

    const view = container.getBoundingClientRect()
    for (const card of cards) {
      const rect = card.getBoundingClientRect()
      if (rect.bottom < view.top || rect.top > view.bottom || rect.right < view.left || rect.left > view.right) {
        continue
      }

      const from = before.get(card.dataset.cardId ?? '')
      if (!from) {
        card.animate(
          [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }],
          { id: FLIP_ANIMATION_ID, duration: ENTER_MS, easing: 'ease-out' },
        )
        continue
      }

      const dx = from.left - rect.left
      const dy = from.top - rect.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        continue
      }

      card.animate(
        [{ transform: `translate(${dx}px, ${dy}px)`, zIndex: 3 }, { transform: 'none', zIndex: 3 }],
        { id: FLIP_ANIMATION_ID, duration: MOVE_MS, easing: MOVE_EASING },
      )
    }
  })

  return capture
}
