import { useMemo } from 'react'
import type { TeamIterationOption } from '../../../ado/queryEngine'
import type { AssignmentOptions } from '../utils/assignmentOptions'
import { DEFAULT_ASSIGNMENT_SPRINT_FILTER } from '../utils/assignmentOptions'
import { resolveSelectedIterationPaths } from '../utils/qaOptions'

type UseAssignmentQueryFiltersArgs = {
  selectedTeamId: string
  teamIterations: TeamIterationOption[]
  assignmentOptionsByTeam?: Record<string, AssignmentOptions>
}

type UseAssignmentQueryFiltersResult = {
  selectedAssignmentIterationPaths: string[]
  useDefaultAssignmentIterationWindow: boolean
  selectedAssignmentWorkItemTypes: string[]
}

export function useAssignmentQueryFilters({
  selectedTeamId,
  teamIterations,
  assignmentOptionsByTeam,
}: UseAssignmentQueryFiltersArgs): UseAssignmentQueryFiltersResult {
  const assignmentSprintFilter =
    assignmentOptionsByTeam?.[selectedTeamId]?.sprintFilter ?? DEFAULT_ASSIGNMENT_SPRINT_FILTER

  const useDefaultAssignmentIterationWindow = assignmentSprintFilter.current
    && assignmentSprintFilter.next
    && !assignmentSprintFilter.nextNext
    && assignmentSprintFilter.iterationPaths.length === 0

  const selectedAssignmentIterationPaths = useMemo(
    () => resolveSelectedIterationPaths(assignmentSprintFilter, teamIterations),
    [assignmentSprintFilter, teamIterations],
  )

  return {
    selectedAssignmentIterationPaths,
    useDefaultAssignmentIterationWindow,
    selectedAssignmentWorkItemTypes: assignmentOptionsByTeam?.[selectedTeamId]?.includeWorkItemTypes ?? [],
  }
}
