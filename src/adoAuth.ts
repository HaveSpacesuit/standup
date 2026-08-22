export type StoredPatState = {
  pat: string
  rememberOnThisMachine: boolean
}

export const DEFAULT_AZDO_API_VERSION = '7.1'

export const REQUIRED_PAT_SCOPES = [
  'Build (Read)',
  'Code (Read)',
  'Graph (Read)',
  'Project and Team (Read)',
  'Release (Read)',
  'Work Items (Read)',
] as const

const LOCAL_STORAGE_PAT_KEY = 'standup:azdo-pat'
const SESSION_STORAGE_PAT_KEY = 'standup:azdo-pat-session'

function normalizePat(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized ? normalized : null
}

export function loadStoredPat(): StoredPatState | null {
  const localPat = normalizePat(localStorage.getItem(LOCAL_STORAGE_PAT_KEY))
  if (localPat) {
    return {
      pat: localPat,
      rememberOnThisMachine: true,
    }
  }

  const sessionPat = normalizePat(sessionStorage.getItem(SESSION_STORAGE_PAT_KEY))
  if (sessionPat) {
    return {
      pat: sessionPat,
      rememberOnThisMachine: false,
    }
  }

  return null
}

export function saveStoredPat(pat: string, rememberOnThisMachine: boolean): StoredPatState {
  const normalizedPat = normalizePat(pat)
  if (!normalizedPat) {
    throw new Error('Azure DevOps PAT is required.')
  }

  if (rememberOnThisMachine) {
    localStorage.setItem(LOCAL_STORAGE_PAT_KEY, normalizedPat)
    sessionStorage.removeItem(SESSION_STORAGE_PAT_KEY)
  } else {
    sessionStorage.setItem(SESSION_STORAGE_PAT_KEY, normalizedPat)
    localStorage.removeItem(LOCAL_STORAGE_PAT_KEY)
  }

  return {
    pat: normalizedPat,
    rememberOnThisMachine,
  }
}

export function clearStoredPat(): void {
  localStorage.removeItem(LOCAL_STORAGE_PAT_KEY)
  sessionStorage.removeItem(SESSION_STORAGE_PAT_KEY)
}
