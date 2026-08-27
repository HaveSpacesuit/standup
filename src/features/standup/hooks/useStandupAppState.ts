import { useState } from 'react'
import { clearStoredPat, loadStoredPat, saveStoredPat, type StoredPatState } from '../../../adoAuth'
import type { TeamProfile } from '../../../appSettings'
import { saveTeamProfiles } from '../../../appSettings'
import { loadTeamProfilesWithDefaults } from '../../../defaultTeamSeed'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import {
  ASSIGNMENTS_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY,
  DEFAULT_CARD_HIGHLIGHT_OPTIONS,
  QA_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY,
  parseStoredCardHighlightOptions,
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
import { tagRulesStorageKey } from './useBoardPreferences'

type UseStandupAppStateResult = {
  teamProfiles: TeamProfile[]
  storedPatState: StoredPatState | null
  patConfigured: boolean
  qaOptionsByTeam: Record<string, QaOptions>
  qaCardHighlightOptions: CardHighlightOptions
  assignmentCardHighlightOptions: CardHighlightOptions
  assignmentOptionsByTeam: Record<string, AssignmentOptions>
  handleTeamProfilesChange: (nextTeamProfiles: TeamProfile[]) => void
  replaceTeamProfiles: (nextTeamProfiles: TeamProfile[]) => void
  handlePatSave: (pat: string) => void
  handlePatClear: () => void
  setQaOptionsForTeam: (teamId: string, next: QaOptions) => void
  setQaCardHighlightOptionsPersisted: (next: CardHighlightOptions) => void
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
  return existing ? parseStoredCardHighlightOptions(existing) : DEFAULT_CARD_HIGHLIGHT_OPTIONS
}

export function useStandupAppState(): UseStandupAppStateResult {
  const [teamProfiles, setTeamProfiles] = useState<TeamProfile[]>(loadTeamProfilesWithDefaults)
  const [storedPatState, setStoredPatState] = useState<StoredPatState | null>(() => loadStoredPat())
  const [qaOptionsByTeam, setQaOptionsByTeam] = useState<Record<string, QaOptions>>(() =>
    buildQaOptionsByTeam(teamProfiles),
  )
  const [qaCardHighlightOptions, setQaCardHighlightOptions] = useState<CardHighlightOptions>(() =>
    loadCardHighlightOptions(QA_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY),
  )
  const [assignmentCardHighlightOptions, setAssignmentCardHighlightOptions] = useState<CardHighlightOptions>(() =>
    loadCardHighlightOptions(ASSIGNMENTS_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY),
  )
  const [assignmentOptionsByTeam, setAssignmentOptionsByTeam] = useState<Record<string, AssignmentOptions>>(() =>
    buildAssignmentOptionsByTeam(teamProfiles),
  )

  const persistTeamProfiles = (nextTeamProfiles: TeamProfile[]) => {
    saveTeamProfiles(nextTeamProfiles)
    setTeamProfiles(nextTeamProfiles)
  }

  const handleTeamProfilesChange = (nextTeamProfiles: TeamProfile[]) => {
    const nextTeamIds = new Set(nextTeamProfiles.map((team) => team.id))

    for (const team of teamProfiles) {
      if (!nextTeamIds.has(team.id)) {
        localStorage.removeItem(qaOptionsStorageKey(team.id))
        localStorage.removeItem(assignmentOptionsStorageKey(team.id))
        localStorage.removeItem(tagRulesStorageKey(team.id))
      }
    }

    persistTeamProfiles(nextTeamProfiles)
    setQaOptionsByTeam((previous) => Object.fromEntries(
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

  const setQaCardHighlightOptionsPersisted = (next: CardHighlightOptions) => {
    setQaCardHighlightOptions(next)
    localStorage.setItem(QA_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY, serializeCardHighlightOptions(next))
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
    qaCardHighlightOptions,
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
