export type AutoRefreshOptions = {
  enabled: boolean
  minutes: number
}

export const AUTO_REFRESH_STORAGE_KEY = 'standup:auto-refresh'
export const DEFAULT_AUTO_REFRESH: Readonly<AutoRefreshOptions> = { enabled: false, minutes: 15 }

export function isValidRefreshMinutes(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

export function loadAutoRefresh(): AutoRefreshOptions {
  const stored = localStorage.getItem(AUTO_REFRESH_STORAGE_KEY)
  if (stored === null) return { ...DEFAULT_AUTO_REFRESH }
  const value: unknown = JSON.parse(stored)
  if (!value || typeof value !== 'object'
    || !('enabled' in value) || typeof value.enabled !== 'boolean'
    || !('minutes' in value) || typeof value.minutes !== 'number' || !isValidRefreshMinutes(value.minutes)) {
    throw new Error('Saved auto-refresh settings are invalid. Defaults are in use; change the setting to replace them.')
  }
  return { enabled: value.enabled, minutes: value.minutes }
}

export function saveAutoRefresh(options: AutoRefreshOptions): void {
  if (!isValidRefreshMinutes(options.minutes)) throw new Error('Enter a whole number of minutes greater than 0.')
  localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, JSON.stringify(options))
}
