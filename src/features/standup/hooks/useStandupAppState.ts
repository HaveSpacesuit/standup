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
import type { QaOptions } from '../utils/qaOptions'
import { parseStoredQaOptionsWithRecovery, qaOptionsStorageKey, serializeQaOptions } from '../utils/qaOptions'
import { SELECTED_TEAM_STORAGE_KEY, tagRulesStorageKey } from './useBoardPreferences'

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
  handleTeamProfilesChange: (nextTeamProfiles: TeamProfile[]) => void
  replaceTeamProfiles: (nextTeamProfiles: TeamProfile[]) => void
  handlePatSave: (pat: string) => void
  handlePatClear: () => void
  setQaOptionsForTeam: (teamId: string, next: QaOptions) => void
  setQaCardHighlightOptionsPersisted: (teamId: string, next: CardHighlightOptions) => void
  setAssignmentCardHighlightOptionsPersisted: (next: CardHighlightOptions) => void
  setAssignmentOptionsForTeam: (teamId: string, next: AssignmentOptions) => void
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
    handleTeamProfilesChange,
    replaceTeamProfiles: persistTeamProfiles,
    handlePatSave,
    handlePatClear,
    setQaOptionsForTeam,
    setQaCardHighlightOptionsPersisted,
    setAssignmentCardHighlightOptionsPersisted,
    setAssignmentOptionsForTeam,
  }
}
