import { useCallback, useEffect, useState, type RefObject } from 'react'

export type AppView = 'team-assignments' | 'qa-activity'

type UseAppNavigationArgs = {
  patConfigured: boolean
  memberFilterOptions: string[]
  selectedMemberFilter: string
  onMemberFilterChange: (memberLabel: string) => void
  quickFilterInputRefs: Partial<Record<AppView, RefObject<HTMLInputElement | null>>>
}

type UseAppNavigationResult = {
  activeView: AppView
  onMemberFilterCycle: (direction: -1 | 1) => void
}

function getViewFromHash(hash: string): AppView {
  if (hash === '#qa-activity') {
    return 'qa-activity'
  }

  if (hash === '#team-assignments' || !hash) {
    return 'team-assignments'
  }

  return 'team-assignments'
}

export function useAppNavigation({
  patConfigured,
  memberFilterOptions,
  selectedMemberFilter,
  onMemberFilterChange,
  quickFilterInputRefs,
}: UseAppNavigationArgs): UseAppNavigationResult {
  const [activeView, setActiveView] = useState<AppView>(() => getViewFromHash(window.location.hash))

  const onMemberFilterCycle = useCallback((direction: -1 | 1) => {
    if (!patConfigured || memberFilterOptions.length === 0) {
      return
    }

    const cycleValues = ['', ...memberFilterOptions]
    const currentIndex = cycleValues.indexOf(selectedMemberFilter)
    const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex
    const nextIndex = (safeCurrentIndex + direction + cycleValues.length) % cycleValues.length
    onMemberFilterChange(cycleValues[nextIndex])
  }, [memberFilterOptions, onMemberFilterChange, patConfigured, selectedMemberFilter])

  useEffect(() => {
    const handleHashChange = () => {
      setActiveView(getViewFromHash(window.location.hash))
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  useEffect(() => {
    document.title =
      activeView === 'qa-activity'
        ? 'Quality Assurance'
        : 'Team Assignments'
  }, [activeView])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isTypingTarget =
        tagName === 'input'
        || tagName === 'textarea'
        || target?.isContentEditable === true

      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f'
      if (!isShortcut) {
        const isCycleUpShortcut = event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'ArrowUp'
        const isCycleDownShortcut = event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'ArrowDown'

        if (!isTypingTarget && (isCycleUpShortcut || isCycleDownShortcut)) {
          event.preventDefault()
          onMemberFilterCycle(isCycleUpShortcut ? -1 : 1)
        }

        return
      }

      event.preventDefault()
      const quickFilterInputRef = quickFilterInputRefs[activeView] ?? quickFilterInputRefs['team-assignments']
      quickFilterInputRef?.current?.focus()
      quickFilterInputRef?.current?.select()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeView, onMemberFilterCycle, quickFilterInputRefs])

  return {
    activeView,
    onMemberFilterCycle,
  }
}
