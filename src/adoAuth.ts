export type StoredPatState = {
  pat: string
}

export const DEFAULT_AZDO_API_VERSION = '7.1'
export const QUICK_ASSIGN_PAT_SCOPE = 'Work Items (Read & write)'
export const QUICK_ASSIGN_PAT_REQUIREMENT =
  'Work Items (Read) is enough to view the boards. Quick assign needs Work Items (Read & write) plus permission to edit the work item in Azure DevOps.'
// Editing a PAT's scopes keeps its token value, so the user can retry without pasting it again.
export const QUICK_ASSIGN_PAT_FIX =
  'In Azure DevOps, open User settings > Personal access tokens, edit this PAT to set Work Items to Read & write, then try again.'

export const PAT_SCOPES = [
  'Build (Read)',
  'Code (Read)',
  'Graph (Read)',
  'Project and Team (Read)',
  'Release (Read)',
  'Test Management (Read)',
  QUICK_ASSIGN_PAT_SCOPE,
] as const

// Legacy key — PATs were previously persisted to localStorage. Migrated to sessionStorage.
const LOCAL_STORAGE_PAT_KEY = 'standup:azdo-pat'
const SESSION_STORAGE_PAT_KEY = 'standup:azdo-pat-session'

let patSessionController = new AbortController()

export function getPatSessionSignal(): AbortSignal {
  return patSessionController.signal
}

function normalizePat(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized ? normalized : null
}

export function loadStoredPat(): StoredPatState | null {
  // Migrate any PAT that was previously saved to localStorage into sessionStorage,
  // then clear it from localStorage so it is no longer persisted across sessions.
  const localPat = normalizePat(localStorage.getItem(LOCAL_STORAGE_PAT_KEY))
  if (localPat) {
    sessionStorage.setItem(SESSION_STORAGE_PAT_KEY, localPat)
    localStorage.removeItem(LOCAL_STORAGE_PAT_KEY)
  }

  const sessionPat = normalizePat(sessionStorage.getItem(SESSION_STORAGE_PAT_KEY))
  if (sessionPat) {
    return { pat: sessionPat }
  }

  return null
}

export function saveStoredPat(pat: string): StoredPatState {
  const normalizedPat = normalizePat(pat)
  if (!normalizedPat) {
    throw new Error('Azure DevOps PAT is required.')
  }

  sessionStorage.setItem(SESSION_STORAGE_PAT_KEY, normalizedPat)

  return { pat: normalizedPat }
}

export function clearStoredPat(): void {
  patSessionController.abort()
  patSessionController = new AbortController()
  localStorage.removeItem(LOCAL_STORAGE_PAT_KEY)
  sessionStorage.removeItem(SESSION_STORAGE_PAT_KEY)
}
