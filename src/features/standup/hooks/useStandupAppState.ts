import { useMemo, useState } from 'react'
import { clearStoredPat, loadStoredPat, saveStoredPat, type StoredPatState } from '../../../adoAuth'
import type { TeamProfile } from '../../../appSettings'
import { saveTeamProfiles } from '../../../appSettings'
import { loadTeamProfilesWithDefaultsAndRecovery } from '../../../defaultTeamSeed'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import {
  ASSIGNMENTS_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY,
  DEFAULT_CARD_HIGHLIGHT_OPTIONS,
  LEGACY_QA_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY,
  parseStoredCardHighlightOptions,
  qaCardHighlightOptionsStorageKey,
  serializeCardHighlightOptions,
} from '../utils/cardHighlightOptions'
import type { AssignmentOptions } from '../utils/assignmentOptions'
import {
  assignmentOptionsStorageKey,
  parseStoredAssignmentOptions,
  serializeAssignmentOptions,
} from '../utils/assignmentOptions'
import type { BacklogOptions } from '../utils/backlogOptions'
import { backlogOptionsStorageKey, parseStoredBacklogOptions, serializeBacklogOptions } from '../utils/backlogOptions'
import { loadRememberLastView, saveRememberLastView } from '../utils/lastViews'
import { DEFAULT_AUTO_REFRESH, loadAutoRefresh, saveAutoRefresh, type AutoRefreshOptions } from '../utils/autoRefresh'
import type { QaOptions } from '../utils/qaOptions'
import { parseStoredQaOptionsWithRecovery, qaOptionsStorageKey, serializeQaOptions } from '../utils/qaOptions'
import { SELECTED_TEAM_STORAGE_KEY, tagRulesStorageKey } from './useBoardPreferences'
import { loadTriageSettings, parseTriageOptions, triageOptionsStorageKey, type TriageOptions, type TriageSettings } from '../utils/triageOptions'
import { triageVisitStorageKey } from '../utils/triageVisits'

type UseStandupAppStateResult = {
  teamProfiles: TeamProfile[]
  teamProfilesUnreadable: boolean
  qaOptionsUnreadableByTeam: Record<string, boolean>
  storedPatState: StoredPatState | null
  patConfigured: boolean
  qaOptionsByTeam: Record<string, QaOptions>
  qaCardHighlightOptionsByTeam: Record<string, CardHighlightOptions>
  assignmentCardHighlightOptions: CardHighlightOptions
  assignmentOptionsByTeam: Record<string, AssignmentOptions>
  backlogOptionsByTeam: Record<string, BacklogOptions>
  triageSettingsByTeam: Record<string, TriageSettings>
  setTriageOptionsForTeam: (teamId: string, next: TriageOptions) => void
  rememberLastView: boolean
  autoRefresh: AutoRefreshOptions
  autoRefreshError: string | null
  setAutoRefreshPersisted: (next: AutoRefreshOptions) => void
  handleTeamProfilesChange: (nextTeamProfiles: TeamProfile[]) => void
  replaceTeamProfiles: (nextTeamProfiles: TeamProfile[]) => void
  handlePatSave: (pat: string) => void
  handlePatClear: () => void
  setQaOptionsForTeam: (teamId: string, next: QaOptions) => void
  setQaCardHighlightOptionsPersisted: (teamId: string, next: CardHighlightOptions) => void
  setAssignmentCardHighlightOptionsPersisted: (next: CardHighlightOptions) => void
  setAssignmentOptionsForTeam: (teamId: string, next: AssignmentOptions) => void
  setBacklogOptionsForTeam: (teamId: string, next: BacklogOptions) => void
  setRememberLastViewPersisted: (next: boolean) => void
}

function buildQaOptionsByTeam(teamProfiles: TeamProfile[]): Record<string, ReturnType<typeof parseStoredQaOptionsWithRecovery>> {
  return Object.fromEntries(
    teamProfiles.map((team) => [
      team.id,
      parseStoredQaOptionsWithRecovery(localStorage.getItem(qaOptionsStorageKey(team.id))),
    ]),
  )
}

function buildAssignmentOptionsByTeam(teamProfiles: TeamProfile[]): Record<string, AssignmentOptions> {
  return Object.fromEntries(
    teamProfiles.map((team) => [
      team.id,
      parseStoredAssignmentOptions(localStorage.getItem(assignmentOptionsStorageKey(team.id))),
    ]),
  )
}

function buildBacklogOptionsByTeam(teamProfiles: TeamProfile[]): Record<string, BacklogOptions> {
  return Object.fromEntries(
    teamProfiles.map((team) => [
      team.id,
      parseStoredBacklogOptions(localStorage.getItem(backlogOptionsStorageKey(team.id))),
    ]),
  )
}

function loadCardHighlightOptions(storageKey: string): CardHighlightOptions {
  const existing = localStorage.getItem(storageKey)
  return existing ? parseStoredCardHighlightOptions(existing) : { ...DEFAULT_CARD_HIGHLIGHT_OPTIONS }
}

function buildQaCardHighlightOptionsByTeam(teamProfiles: TeamProfile[]): Record<string, CardHighlightOptions> {
  const storedTeamId = localStorage.getItem(SELECTED_TEAM_STORAGE_KEY)
  const migrationTeamId = teamProfiles.some((team) => team.id === storedTeamId)
    ? storedTeamId
    : teamProfiles[0]?.id
  const legacyOptions = localStorage.getItem(LEGACY_QA_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY)

  if (legacyOptions !== null && migrationTeamId) {
    const storageKey = qaCardHighlightOptionsStorageKey(migrationTeamId)
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, legacyOptions)
    }
    localStorage.removeItem(LEGACY_QA_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY)
  }

  return Object.fromEntries(
    teamProfiles.map((team) => [
      team.id,
      loadCardHighlightOptions(qaCardHighlightOptionsStorageKey(team.id)),
    ]),
  )
}

export function useStandupAppState(): UseStandupAppStateResult {
  const [{ profiles: teamProfiles, unreadable: teamProfilesUnreadable }, setTeamProfiles] = useState(loadTeamProfilesWithDefaultsAndRecovery)
  const [storedPatState, setStoredPatState] = useState<StoredPatState | null>(() => loadStoredPat())
  const [qaSettingsByTeam, setQaSettingsByTeam] = useState(() =>
    buildQaOptionsByTeam(teamProfiles),
  )
  const qaOptionsByTeam = useMemo(() => Object.fromEntries(
    Object.entries(qaSettingsByTeam).map(([teamId, result]) => [teamId, result.options]),
  ), [qaSettingsByTeam])
  const qaOptionsUnreadableByTeam = useMemo(() => Object.fromEntries(
    Object.entries(qaSettingsByTeam).map(([teamId, result]) => [teamId, result.unreadable]),
  ), [qaSettingsByTeam])
  const [qaCardHighlightOptionsByTeam, setQaCardHighlightOptionsByTeam] = useState<Record<string, CardHighlightOptions>>(() =>
    buildQaCardHighlightOptionsByTeam(teamProfiles),
  )
  const [assignmentCardHighlightOptions, setAssignmentCardHighlightOptions] = useState<CardHighlightOptions>(() =>
    loadCardHighlightOptions(ASSIGNMENTS_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY),
  )
  const [assignmentOptionsByTeam, setAssignmentOptionsByTeam] = useState<Record<string, AssignmentOptions>>(() =>
    buildAssignmentOptionsByTeam(teamProfiles),
  )
  const [backlogOptionsByTeam, setBacklogOptionsByTeam] = useState<Record<string, BacklogOptions>>(() =>
    buildBacklogOptionsByTeam(teamProfiles),
  )
  const [triageSettingsByTeam, setTriageSettingsByTeam] = useState<Record<string, TriageSettings>>(() =>
    Object.fromEntries(teamProfiles.map((team) => [team.id, loadTriageSettings(team.id)])),
  )
  const [rememberLastView, setRememberLastView] = useState(loadRememberLastView)
  const [storedAutoRefresh] = useState(() => {
    try {
      return { options: loadAutoRefresh(), error: null }
    } catch (cause) {
      return { options: { ...DEFAULT_AUTO_REFRESH }, error: `Unable to load auto-refresh settings: ${cause instanceof Error ? cause.message : String(cause)}` }
    }
  })
  const [autoRefresh, setAutoRefresh] = useState(storedAutoRefresh.options)
  const [autoRefreshError, setAutoRefreshError] = useState<string | null>(storedAutoRefresh.error)

  const setAutoRefreshPersisted = (next: AutoRefreshOptions) => {
    try {
      saveAutoRefresh(next)
      setAutoRefresh(next)
      setAutoRefreshError(null)
    } catch (cause) {
      setAutoRefreshError(`Unable to save auto-refresh settings: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  const persistTeamProfiles = (nextTeamProfiles: TeamProfile[]) => {
    saveTeamProfiles(nextTeamProfiles)
    setTeamProfiles({ profiles: nextTeamProfiles, unreadable: false })
  }

  const handleTeamProfilesChange = (nextTeamProfiles: TeamProfile[]) => {
    const nextTeamIds = new Set(nextTeamProfiles.map((team) => team.id))

    for (const team of teamProfiles) {
      if (!nextTeamIds.has(team.id)) {
        localStorage.removeItem(qaOptionsStorageKey(team.id))
        localStorage.removeItem(qaCardHighlightOptionsStorageKey(team.id))
        localStorage.removeItem(assignmentOptionsStorageKey(team.id))
        localStorage.removeItem(backlogOptionsStorageKey(team.id))
        localStorage.removeItem(triageOptionsStorageKey(team.id))
        localStorage.removeItem(triageVisitStorageKey(team.id))
        localStorage.removeItem(tagRulesStorageKey(team.id))
      }
    }

    persistTeamProfiles(nextTeamProfiles)
    setQaSettingsByTeam((previous) => Object.fromEntries(
      Object.entries(previous).filter(([teamId]) => nextTeamIds.has(teamId)),
    ))
    setQaCardHighlightOptionsByTeam((previous) => Object.fromEntries(
      Object.entries(previous).filter(([teamId]) => nextTeamIds.has(teamId)),
    ))
    setAssignmentOptionsByTeam((previous) => Object.fromEntries(
      Object.entries(previous).filter(([teamId]) => nextTeamIds.has(teamId)),
    ))
    setBacklogOptionsByTeam((previous) => Object.fromEntries(
      Object.entries(previous).filter(([teamId]) => nextTeamIds.has(teamId)),
    ))
    setTriageSettingsByTeam((previous) => Object.fromEntries(
      Object.entries(previous).filter(([teamId]) => nextTeamIds.has(teamId)),
    ))
  }

  const handlePatSave = (pat: string) => {
    setStoredPatState(saveStoredPat(pat))
  }

  const handlePatClear = () => {
    clearStoredPat()
    setStoredPatState(null)
  }

  const setQaOptionsForTeam = (teamId: string, next: QaOptions) => {
    localStorage.setItem(qaOptionsStorageKey(teamId), serializeQaOptions(next))
    setQaSettingsByTeam((previous) => ({ ...previous, [teamId]: { options: next, unreadable: false } }))
  }

  const setQaCardHighlightOptionsPersisted = (teamId: string, next: CardHighlightOptions) => {
    if (!teamId) {
      return
    }
    setQaCardHighlightOptionsByTeam((previous) => ({ ...previous, [teamId]: next }))
    localStorage.setItem(qaCardHighlightOptionsStorageKey(teamId), serializeCardHighlightOptions(next))
  }

  const setAssignmentCardHighlightOptionsPersisted = (next: CardHighlightOptions) => {
    setAssignmentCardHighlightOptions(next)
    localStorage.setItem(ASSIGNMENTS_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY, serializeCardHighlightOptions(next))
  }

  const setAssignmentOptionsForTeam = (teamId: string, next: AssignmentOptions) => {
    setAssignmentOptionsByTeam((previous) => ({ ...previous, [teamId]: next }))
    localStorage.setItem(assignmentOptionsStorageKey(teamId), serializeAssignmentOptions(next))
  }

  const setBacklogOptionsForTeam = (teamId: string, next: BacklogOptions) => {
    setBacklogOptionsByTeam((previous) => ({ ...previous, [teamId]: next }))
    localStorage.setItem(backlogOptionsStorageKey(teamId), serializeBacklogOptions(next))
  }

  const setRememberLastViewPersisted = (next: boolean) => {
    setRememberLastView(next)
    saveRememberLastView(next)
  }

  const setTriageOptionsForTeam = (teamId: string, next: TriageOptions) => {
    try {
      const options = parseTriageOptions(next)
      localStorage.setItem(triageOptionsStorageKey(teamId), JSON.stringify(options))
      setTriageSettingsByTeam((previous) => ({ ...previous, [teamId]: { options, error: null } }))
    } catch (cause) {
      const error = `Unable to save Triage options: ${cause instanceof Error ? cause.message : String(cause)}`
      setTriageSettingsByTeam((previous) => ({
        ...previous,
        [teamId]: { options: previous[teamId]?.options ?? loadTriageSettings(teamId).options, error },
      }))
      throw new Error(error)
    }
  }

  return {
    teamProfiles,
    teamProfilesUnreadable,
    qaOptionsUnreadableByTeam,
    storedPatState,
    patConfigured: storedPatState !== null,
    qaOptionsByTeam,
    qaCardHighlightOptionsByTeam,
    assignmentCardHighlightOptions,
    assignmentOptionsByTeam,
    backlogOptionsByTeam,
    triageSettingsByTeam,
    setTriageOptionsForTeam,
    rememberLastView,
    autoRefresh,
    autoRefreshError,
    setAutoRefreshPersisted,
    handleTeamProfilesChange,
    replaceTeamProfiles: persistTeamProfiles,
    handlePatSave,
    handlePatClear,
    setQaOptionsForTeam,
    setQaCardHighlightOptionsPersisted,
    setAssignmentCardHighlightOptionsPersisted,
    setAssignmentOptionsForTeam,
    setBacklogOptionsForTeam,
    setRememberLastViewPersisted,
  }
}
