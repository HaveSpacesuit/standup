import { useRef, useState } from 'react'
import { clearStoredPat, loadStoredPat, saveStoredPat, type StoredPatState } from '../../../adoAuth'
import type { TeamProfile } from '../../../appSettings'
import { saveTeamProfiles, TEAM_PROFILES_STORAGE_KEY } from '../../../appSettings'
import { loadTeamProfilesWithDefaults } from '../../../defaultTeamSeed'
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
import { parseStoredQaOptions, qaOptionsStorageKey, serializeQaOptions } from '../utils/qaOptions'
import { SELECTED_TEAM_STORAGE_KEY, tagRulesStorageKey } from './useBoardPreferences'

type UseStandupAppStateResult = {
  teamProfiles: TeamProfile[]
  storedPatState: StoredPatState | null
  patConfigured: boolean
  qaOptionsByTeam: Record<string, QaOptions>
  qaCardHighlightOptionsByTeam: Record<string, CardHighlightOptions>
  assignmentCardHighlightOptions: CardHighlightOptions
  assignmentOptionsByTeam: Record<string, AssignmentOptions>
  handleTeamProfilesChange: (nextTeamProfiles: TeamProfile[]) => Promise<void>
  replaceTeamProfiles: (nextTeamProfiles: TeamProfile[]) => Promise<void>
  handlePatSave: (pat: string) => void
  handlePatClear: () => void
  setQaOptionsForTeam: (teamId: string, next: QaOptions) => void
  setQaCardHighlightOptionsPersisted: (teamId: string, next: CardHighlightOptions) => void
  setAssignmentCardHighlightOptionsPersisted: (next: CardHighlightOptions) => void
  setAssignmentOptionsForTeam: (teamId: string, next: AssignmentOptions) => void
}

function buildQaOptionsByTeam(teamProfiles: TeamProfile[]): Record<string, QaOptions> {
  return Object.fromEntries(
    teamProfiles.map((team) => [
      team.id,
      parseStoredQaOptions(localStorage.getItem(qaOptionsStorageKey(team.id))),
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
  const [initialTeamProfiles] = useState(loadTeamProfilesWithDefaults)
  const [teamProfiles, setTeamProfiles] = useState<TeamProfile[]>(initialTeamProfiles.teamProfiles)
  const teamProfilesSnapshot = useRef(initialTeamProfiles.snapshot)
  const [storedPatState, setStoredPatState] = useState<StoredPatState | null>(() => loadStoredPat())
  const [qaOptionsByTeam, setQaOptionsByTeam] = useState<Record<string, QaOptions>>(() =>
    buildQaOptionsByTeam(teamProfiles),
  )
  const [qaCardHighlightOptionsByTeam, setQaCardHighlightOptionsByTeam] = useState<Record<string, CardHighlightOptions>>(() =>
    buildQaCardHighlightOptionsByTeam(teamProfiles),
  )
  const [assignmentCardHighlightOptions, setAssignmentCardHighlightOptions] = useState<CardHighlightOptions>(() =>
    loadCardHighlightOptions(ASSIGNMENTS_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY),
  )
  const [assignmentOptionsByTeam, setAssignmentOptionsByTeam] = useState<Record<string, AssignmentOptions>>(() =>
    buildAssignmentOptionsByTeam(teamProfiles),
  )

  const persistTeamProfiles = async (nextTeamProfiles: TeamProfile[]) => {
    await navigator.locks.request('standup:team-profiles', () => {
      if (localStorage.getItem(TEAM_PROFILES_STORAGE_KEY) !== teamProfilesSnapshot.current) {
        throw new Error('Team profiles changed in another tab. Reload this page before changing teams.')
      }

      saveTeamProfiles(nextTeamProfiles)
      teamProfilesSnapshot.current = JSON.stringify(nextTeamProfiles)
      setTeamProfiles(nextTeamProfiles)
    })
  }

  const handleTeamProfilesChange = async (nextTeamProfiles: TeamProfile[]) => {
    await persistTeamProfiles(nextTeamProfiles)
    const nextTeamIds = new Set(nextTeamProfiles.map((team) => team.id))

    for (const team of teamProfiles) {
      if (!nextTeamIds.has(team.id)) {
        localStorage.removeItem(qaOptionsStorageKey(team.id))
        localStorage.removeItem(qaCardHighlightOptionsStorageKey(team.id))
        localStorage.removeItem(assignmentOptionsStorageKey(team.id))
        localStorage.removeItem(tagRulesStorageKey(team.id))
      }
    }

    setQaOptionsByTeam((previous) => Object.fromEntries(
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
    setQaOptionsByTeam((previous) => ({ ...previous, [teamId]: next }))
    localStorage.setItem(qaOptionsStorageKey(teamId), serializeQaOptions(next))
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
