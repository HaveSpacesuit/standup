import type { AppView } from '../hooks/useAppNavigation'

export const REMEMBER_LAST_VIEW_STORAGE_KEY = 'standup:remember-last-view'
const LAST_VIEW_STORAGE_KEY_PREFIX = 'standup:last-view'

/** Pages with a View toggle: Developers or Sprint, Testers or Flow, and List or Map. */
export type RememberedViewPage = Extract<AppView, 'development' | 'qa-activity' | 'backlog'>

export function lastViewStorageKey(page: RememberedViewPage): string {
  return `${LAST_VIEW_STORAGE_KEY_PREFIX}:${page}`
}

// Reopening the last view is a convenience, so unavailable or full storage must never break a page.
function readStoredValue(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStoredValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // The page keeps working; this choice just isn't remembered.
  }
}

export function loadRememberLastView(): boolean {
  return readStoredValue(REMEMBER_LAST_VIEW_STORAGE_KEY) === 'true'
}

export function saveRememberLastView(rememberLastView: boolean): void {
  writeStoredValue(REMEMBER_LAST_VIEW_STORAGE_KEY, String(rememberLastView))
}

/** The page's saved view, or null when none is saved or it is no longer one of `views`. */
export function loadLastView<View extends string>(page: RememberedViewPage, views: readonly View[]): View | null {
  const stored = readStoredValue(lastViewStorageKey(page))
  return views.find((view) => view === stored) ?? null
}

export function saveLastView(page: RememberedViewPage, view: string): void {
  writeStoredValue(lastViewStorageKey(page), view)
}
