import { useEffect, useState } from 'react'
import type { TeamProfile } from '../../../teamConfig'
import { parseStoredTagRules } from '../utils/boardFilters'
import type { TagRule } from '../../../ado/workItemStatus'

type UseBoardPreferencesResult = {
  selectedTeamId: string
  onTeamChange: (teamId: string) => void
  quickFilterInput: string
  setQuickFilterInput: (value: string) => void
  selectedMemberFilter: string
  onMemberFilterChange: (memberLabel: string) => void
  setSelectedMemberFilter: (value: string) => void
  tagRules: TagRule[]
  tagRulesByTeam: Record<string, TagRule[]>
  setTagRules: (value: TagRule[] | ((previous: TagRule[]) => TagRule[])) => void
  setTagRulesForTeam: (teamId: string, rules: TagRule[]) => void
}

const TAG_RULES_STORAGE_KEY = 'standup:tag-rules'
const LEGACY_HIDDEN_TAGS_STORAGE_KEY = 'standup:hidden-tags'
const SELECTED_TEAM_STORAGE_KEY = 'standup:selected-team-id'

export function tagRulesStorageKey(teamId: string): string {
  return `${TAG_RULES_STORAGE_KEY}:${teamId}`
}

export function loadStoredTagRulesForTeam(teamId: string): TagRule[] {
  return parseStoredTagRules(
    localStorage.getItem(tagRulesStorageKey(teamId)) ?? localStorage.getItem(TAG_RULES_STORAGE_KEY),
    localStorage.getItem(LEGACY_HIDDEN_TAGS_STORAGE_KEY),
  )
}

function getInitialSelectedTeamId(teamProfiles: TeamProfile[]): string {
  const storedTeamId = localStorage.getItem(SELECTED_TEAM_STORAGE_KEY)
  if (storedTeamId && teamProfiles.some((team) => team.id === storedTeamId)) {
    return storedTeamId
  }

  return teamProfiles[0]?.id ?? ''
}

export function useBoardPreferences(teamProfiles: TeamProfile[]): UseBoardPreferencesResult {
  const [selectedTeamId, setSelectedTeamId] = useState(() => getInitialSelectedTeamId(teamProfiles))
  const [quickFilterInput, setQuickFilterInput] = useState('')
  const [selectedMemberFilter, setSelectedMemberFilter] = useState('')
  const [tagRulesByTeam, setTagRulesByTeam] = useState<Record<string, TagRule[]>>(() =>
    Object.fromEntries(
      teamProfiles.map((team) => [team.id, loadStoredTagRulesForTeam(team.id)]),
    ),
  )
  const tagRules = tagRulesByTeam[selectedTeamId] ?? loadStoredTagRulesForTeam(selectedTeamId)

  useEffect(() => {
    localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, selectedTeamId)
  }, [selectedTeamId])

  useEffect(() => {
    if (teamProfiles.some((team) => team.id === selectedTeamId)) {
      return
    }

    setSelectedTeamId(teamProfiles[0]?.id ?? '')
  }, [selectedTeamId, teamProfiles])

  const setTagRules = (value: TagRule[] | ((previous: TagRule[]) => TagRule[])) => {
    if (!selectedTeamId) {
      return
    }

    setTagRulesByTeam((current) => {
      const previousRules = current[selectedTeamId] ?? loadStoredTagRulesForTeam(selectedTeamId)
      const nextRules = typeof value === 'function' ? value(previousRules) : value
      localStorage.setItem(tagRulesStorageKey(selectedTeamId), JSON.stringify(nextRules))
      return {
        ...current,
        [selectedTeamId]: nextRules,
      }
    })
  }

  const setTagRulesForTeam = (teamId: string, rules: TagRule[]) => {
    if (!teamId) {
      return
    }

    localStorage.setItem(tagRulesStorageKey(teamId), JSON.stringify(rules))
    setTagRulesByTeam((current) => ({
      ...current,
      [teamId]: rules,
    }))
  }

  return {
    selectedTeamId,
    onTeamChange: setSelectedTeamId,
    quickFilterInput,
    setQuickFilterInput,
    selectedMemberFilter,
    onMemberFilterChange: setSelectedMemberFilter,
    setSelectedMemberFilter,
    tagRules,
    tagRulesByTeam,
    setTagRules,
    setTagRulesForTeam,
  }
}
