import { useCallback, useEffect, useState } from 'react'
import type { SprintReplayDay, SprintReplayTimeline } from '../utils/sprintReplay'

/** How long Play shows each day. */
export const REPLAY_STEP_MS = 1000

export type SprintReplay = {
  /** The day the board shows; null while it shows today. */
  pastDay: SprintReplayDay | null
  /** The shown day's index in the timeline: the past day's, or today's. */
  index: number
  playing: boolean
  goTo: (index: number) => void
  step: (delta: number) => void
  togglePlay: () => void
  /** Plays the sprint from its first day. */
  start: () => void
  /** Stops and returns to today. */
  exit: () => void
  /** Returns to today without animating, for when the board is about to change anyway. */
  reset: () => void
}

/**
 * Which day of the sprint the Sprint view shows, and Play, which steps through one day a second
 * until it reaches today. `onBeforeChange` runs just before the shown day changes, while the board
 * still shows the old one. A null `timeline` (history still loading, or nothing to replay) shows today.
 */
export function useSprintReplay(timeline: SprintReplayTimeline | null, onBeforeChange?: () => void): SprintReplay {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [playRequested, setPlayRequested] = useState(false)
  const todayIndex = timeline?.todayIndex ?? 0
  const pastIndex = timeline && selectedIndex !== null && selectedIndex < todayIndex ? Math.max(selectedIndex, 0) : null
  const index = pastIndex ?? todayIndex
  const playing = playRequested && timeline !== null

  const show = useCallback((next: number) => {
    const clamped = Math.min(Math.max(Math.round(next), 0), todayIndex)
    if (!timeline || clamped === index) {
      return
    }

    onBeforeChange?.()
    setSelectedIndex(clamped >= todayIndex ? null : clamped)
  }, [index, onBeforeChange, timeline, todayIndex])

  useEffect(() => {
    if (!playing) {
      return
    }

    const timer = window.setTimeout(() => {
      show(index + 1)
      if (index + 1 >= todayIndex) {
        setPlayRequested(false)
      }
    }, REPLAY_STEP_MS)
    return () => window.clearTimeout(timer)
  }, [index, playing, show, todayIndex])

  const goTo = useCallback((next: number) => {
    setPlayRequested(false)
    show(next)
  }, [show])

  const start = useCallback(() => {
    show(0)
    setPlayRequested(todayIndex > 0)
  }, [show, todayIndex])

  return {
    pastDay: pastIndex === null ? null : timeline!.days[pastIndex],
    index,
    playing,
    goTo,
    step: useCallback((delta: number) => goTo(index + delta), [goTo, index]),
    togglePlay: useCallback(() => {
      if (playing) {
        setPlayRequested(false)
      } else if (index >= todayIndex) {
        start()
      } else {
        setPlayRequested(true)
      }
    }, [index, playing, start, todayIndex]),
    start,
    exit: useCallback(() => goTo(todayIndex), [goTo, todayIndex]),
    reset: useCallback(() => {
      setPlayRequested(false)
      setSelectedIndex(null)
    }, []),
  }
}
