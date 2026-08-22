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
  setTagRules: (value: TagRule[] | ((previous: TagRule[]) => TagRule[])) => void
}

const TAG_RULES_STORAGE_KEY = 'standup:tag-rules'
const LEGACY_HIDDEN_TAGS_STORAGE_KEY = 'standup:hidden-tags'
const SELECTED_TEAM_STORAGE_KEY = 'standup:selected-team-id'

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
  const [tagRules, setTagRules] = useState<TagRule[]>(() =>
    parseStoredTagRules(
      localStorage.getItem(TAG_RULES_STORAGE_KEY),
      localStorage.getItem(LEGACY_HIDDEN_TAGS_STORAGE_KEY),
    ),
  )

  useEffect(() => {
    localStorage.setItem(TAG_RULES_STORAGE_KEY, JSON.stringify(tagRules))
  }, [tagRules])

  useEffect(() => {
    localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, selectedTeamId)
  }, [selectedTeamId])

  useEffect(() => {
    if (teamProfiles.some((team) => team.id === selectedTeamId)) {
      return
    }

    setSelectedTeamId(teamProfiles[0]?.id ?? '')
  }, [selectedTeamId, teamProfiles])

  return {
    selectedTeamId,
    onTeamChange: setSelectedTeamId,
    quickFilterInput,
    setQuickFilterInput,
    selectedMemberFilter,
    onMemberFilterChange: setSelectedMemberFilter,
    setSelectedMemberFilter,
    tagRules,
    setTagRules,
  }
}
