import { useMemo, useRef, useState } from 'react'
import { LOCAL_STORAGE_PAT_KEY, SESSION_STORAGE_PAT_KEY, clearStoredPat, loadStoredPat, resetPatSession, saveStoredPat, type StoredPatState } from '../../../adoAuth'
import type { TeamProfile } from '../../../appSettings'
import { COLOR_SCHEME_STORAGE_KEY, TEAM_PROFILES_STORAGE_KEY, saveTeamProfiles } from '../../../appSettings'
import { parseImportedTeamData, type TeamDataExport } from '../../../teamDataTransfer'
import type { TagRule } from '../../../ado/workItemStatus'
import { validateTeamProfile } from '../utils/teamProfileValidation'
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
import { REMEMBER_LAST_VIEW_STORAGE_KEY, loadRememberLastView, saveRememberLastView } from '../utils/lastViews'
import { AUTO_REFRESH_STORAGE_KEY, DEFAULT_AUTO_REFRESH, isValidRefreshMinutes, loadAutoRefresh, saveAutoRefresh, type AutoRefreshOptions } from '../utils/autoRefresh'
import type { QaOptions } from '../utils/qaOptions'
import { parseStoredQaOptionsWithRecovery, qaOptionsStorageKey, serializeQaOptions } from '../utils/qaOptions'
import { SELECTED_TEAM_STORAGE_KEY, tagRulesStorageKey } from './useBoardPreferences'
import { loadTriageSettings, parseTriageOptions, triageOptionsStorageKey, type TriageOptions, type TriageSettings } from '../utils/triageOptions'
import { triageNotDuplicatesStorageKey } from '../utils/triageNotDuplicates'
import { triageVisitStorageKey } from '../utils/triageVisits'
import { createDefaultAssignmentOptions } from '../utils/standupOptionDefaults'

export type GlobalSettingsDraft = {
  teamProfiles: TeamProfile[]
  imports: TeamDataExport[]
  selectedTeamId: string
  rememberLastView: boolean
  autoRefresh: AutoRefreshOptions
  colorScheme?: 'light' | 'dark'
  pat?: string | null
}

export type GlobalSettingsCommit = {
  selectedTeamId: string
  importedTagRules: Record<string, TagRule[]>
}

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
  setAutoRefreshPersisted: (next: AutoRefreshOptions) => boolean
  handleTeamProfilesChange: (nextTeamProfiles: TeamProfile[]) => void
  replaceTeamProfiles: (nextTeamProfiles: TeamProfile[]) => void
  handlePatSave: (pat: string) => void
  handlePatClear: () => void
  setQaOptionsForTeam: (teamId: string, next: QaOptions) => void
  setQaCardHighlightOptionsPersisted: (teamId: string, next: CardHighlightOptions) => void
  setAssignmentCardHighlightOptionsPersisted: (next: CardHighlightOptions) => void
  setAssignmentOptionsForTeam: (teamId: string, next: AssignmentOptions | ((current: AssignmentOptions) => AssignmentOptions)) => void
  setBacklogOptionsForTeam: (teamId: string, next: BacklogOptions) => void
  setRememberLastViewPersisted: (next: boolean) => void
  saveGlobalSettings: (draft: GlobalSettingsDraft) => GlobalSettingsCommit
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
  const assignmentOptionsRef = useRef(assignmentOptionsByTeam)
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
      return true
    } catch (cause) {
      setAutoRefreshError(`Unable to save auto-refresh settings: ${cause instanceof Error ? cause.message : String(cause)}`)
      return false
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
        localStorage.removeItem(triageNotDuplicatesStorageKey(team.id))
        localStorage.removeItem(tagRulesStorageKey(team.id))
      }
    }

    persistTeamProfiles(nextTeamProfiles)
    assignmentOptionsRef.current = Object.fromEntries(
      Object.entries(assignmentOptionsRef.current).filter(([teamId]) => nextTeamIds.has(teamId)),
    )
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

  const setAssignmentOptionsForTeam = (teamId: string, update: AssignmentOptions | ((current: AssignmentOptions) => AssignmentOptions)) => {
    const next = typeof update === 'function' ? update(assignmentOptionsRef.current[teamId] ?? createDefaultAssignmentOptions()) : update
    localStorage.setItem(assignmentOptionsStorageKey(teamId), serializeAssignmentOptions(next))
    assignmentOptionsRef.current = { ...assignmentOptionsRef.current, [teamId]: next }
    setAssignmentOptionsByTeam((previous) => ({ ...previous, [teamId]: next }))
  }

  const setBacklogOptionsForTeam = (teamId: string, next: BacklogOptions) => {
    localStorage.setItem(backlogOptionsStorageKey(teamId), serializeBacklogOptions(next))
    setBacklogOptionsByTeam((previous) => ({ ...previous, [teamId]: next }))
  }

  const setRememberLastViewPersisted = (next: boolean) => {
    saveRememberLastView(next)
    setRememberLastView(next)
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

  const saveGlobalSettings = (draft: GlobalSettingsDraft): GlobalSettingsCommit => {
    const nextTeamIds = new Set<string>()
    for (const team of draft.teamProfiles) {
      const validationError = validateTeamProfile(team)
      if (validationError) throw new Error(validationError.message)
      if (!team.id.trim() || nextTeamIds.has(team.id)) throw new Error('Team IDs must be non-empty and unique.')
      nextTeamIds.add(team.id)
    }
    if (!isValidRefreshMinutes(draft.autoRefresh.minutes)) throw new Error('Enter a whole number of minutes greater than 0.')
    const pat = draft.pat === undefined || draft.pat === null ? draft.pat : draft.pat.trim()
    if (pat === '') throw new Error('Azure DevOps PAT is required.')
    const imports = draft.imports.map((data) => parseImportedTeamData(JSON.stringify(data)))
    const importedIds = new Set<string>()
    for (const data of imports) {
      if (!nextTeamIds.has(data.teamProfile.id)) throw new Error('The imported team must be included in the saved team profiles.')
      if (importedIds.has(data.teamProfile.id)) throw new Error('Each team can only be imported once per Save.')
      importedIds.add(data.teamProfile.id)
    }
    const selectedTeamId = imports.at(-1)?.teamProfile.id
      ?? (nextTeamIds.has(draft.selectedTeamId) ? draft.selectedTeamId : draft.teamProfiles[0]?.id ?? '')
    const changes: { storage: Storage; key: string; value: string | null }[] = []
    const write = (key: string, value: string | null, storage = localStorage) => changes.push({ storage, key, value })
    if (JSON.stringify(draft.teamProfiles) !== JSON.stringify(teamProfiles) || imports.length) {
      write(TEAM_PROFILES_STORAGE_KEY, JSON.stringify(draft.teamProfiles))
    }
    for (const team of teamProfiles) {
      if (!nextTeamIds.has(team.id)) {
        for (const key of [
          qaOptionsStorageKey(team.id), qaCardHighlightOptionsStorageKey(team.id), assignmentOptionsStorageKey(team.id),
          backlogOptionsStorageKey(team.id), triageOptionsStorageKey(team.id), triageVisitStorageKey(team.id),
          triageNotDuplicatesStorageKey(team.id), tagRulesStorageKey(team.id),
        ]) write(key, null)
      }
    }
    for (const data of imports) {
      const id = data.teamProfile.id
      write(assignmentOptionsStorageKey(id), serializeAssignmentOptions(data.assignmentOptions))
      write(qaOptionsStorageKey(id), serializeQaOptions(data.qaOptions))
      write(backlogOptionsStorageKey(id), serializeBacklogOptions(data.backlogOptions))
      write(triageOptionsStorageKey(id), JSON.stringify(data.triageOptions))
      write(tagRulesStorageKey(id), JSON.stringify(data.assignmentTagRules))
    }
    if (selectedTeamId !== draft.selectedTeamId) write(SELECTED_TEAM_STORAGE_KEY, selectedTeamId)
    if (draft.rememberLastView !== rememberLastView) write(REMEMBER_LAST_VIEW_STORAGE_KEY, String(draft.rememberLastView))
    if (draft.autoRefresh.enabled !== autoRefresh.enabled || draft.autoRefresh.minutes !== autoRefresh.minutes) {
      write(AUTO_REFRESH_STORAGE_KEY, JSON.stringify(draft.autoRefresh))
    }
    if (draft.colorScheme !== undefined) write(COLOR_SCHEME_STORAGE_KEY, draft.colorScheme)
    if (pat !== undefined) {
      write(SESSION_STORAGE_PAT_KEY, pat, sessionStorage)
      if (pat === null) write(LOCAL_STORAGE_PAT_KEY, null)
    }
    const committed = {
      selectedTeamId,
      importedTagRules: Object.fromEntries(imports.map((data) => [data.teamProfile.id, data.assignmentTagRules])),
    }
    if (!changes.length) return committed

    // Snapshot every affected entry before the first write; no runtime settings change until all writes succeed.
    const pending = changes.map((change) => ({ ...change, previous: change.storage.getItem(change.key) }))
      .filter((change) => change.previous !== change.value)
    const attempted: typeof pending = []
    try {
      for (const change of pending) {
        attempted.push(change)
        if (change.value === null) change.storage.removeItem(change.key)
        else change.storage.setItem(change.key, change.value)
      }
    } catch (cause) {
      const rollbackErrors: Error[] = []
      for (const change of attempted.reverse()) {
        try {
          if (change.previous === null) change.storage.removeItem(change.key)
          else change.storage.setItem(change.key, change.previous)
        } catch (rollbackCause) {
          rollbackErrors.push(new Error(`Could not restore ${change.key}: ${rollbackCause instanceof Error ? rollbackCause.message : String(rollbackCause)}`))
        }
      }
      const message = `Unable to save Settings: ${cause instanceof Error ? cause.message : String(cause)}`
      if (rollbackErrors.length) {
        throw new AggregateError([cause, ...rollbackErrors], `${message}. Rollback also failed: ${rollbackErrors.map((error) => error.message).join('; ')}`)
      }
      throw new Error(message, { cause })
    }

    if (JSON.stringify(draft.teamProfiles) !== JSON.stringify(teamProfiles) || imports.length) {
      setTeamProfiles({ profiles: draft.teamProfiles, unreadable: false })
    }
    const retained = <T,>(previous: Record<string, T>) => Object.fromEntries(
      Object.entries(previous).filter(([id]) => nextTeamIds.has(id)),
    )
    setQaSettingsByTeam((previous) => ({
      ...retained(previous),
      ...Object.fromEntries(imports.map((data) => [data.teamProfile.id, { options: data.qaOptions, unreadable: false }])),
    }))
    setQaCardHighlightOptionsByTeam((previous) => retained(previous))
    assignmentOptionsRef.current = {
      ...retained(assignmentOptionsRef.current), ...Object.fromEntries(imports.map((data) => [data.teamProfile.id, data.assignmentOptions])),
    }
    setAssignmentOptionsByTeam(assignmentOptionsRef.current)
    setBacklogOptionsByTeam((previous) => ({
      ...retained(previous), ...Object.fromEntries(imports.map((data) => [data.teamProfile.id, data.backlogOptions])),
    }))
    setTriageSettingsByTeam((previous) => ({
      ...retained(previous),
      ...Object.fromEntries(imports.map((data) => [data.teamProfile.id, { options: data.triageOptions, error: null }])),
    }))
    setRememberLastView(draft.rememberLastView)
    if (draft.autoRefresh.enabled !== autoRefresh.enabled || draft.autoRefresh.minutes !== autoRefresh.minutes) {
      setAutoRefresh(draft.autoRefresh)
      setAutoRefreshError(null)
    }
    if (pat !== undefined) {
      if (pat === null) resetPatSession()
      setStoredPatState(pat === null ? null : { pat })
    }
    return committed
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
    saveGlobalSettings,
  }
}
