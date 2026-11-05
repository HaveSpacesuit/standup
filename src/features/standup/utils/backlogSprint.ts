import type { TeamIterationOption } from '../../../ado/types'
import { parseDateOnly } from './dateOnly'

/**
 * Where a bug sits relative to the team's sprints. `unknown` means the team's sprints are not loaded (or failed to
 * load), so the path cannot be placed yet.
 */
export type BacklogSprintKind = 'current' | 'next' | 'future' | 'past' | 'backlog' | 'unknown'

export type BacklogSprint = {
  kind: BacklogSprintKind
  /** "This sprint", "Next sprint", a later sprint's name, "Sprint 12 · ended", "Backlog", or the path's last segment. */
  label: string
  /** The team sprint the bug is in, when there is one. */
  iteration?: TeamIterationOption
}

export type BacklogSprintResolver = (iterationPath: string | undefined) => BacklogSprint

const BACKLOG_SPRINT: BacklogSprint = { kind: 'backlog', label: 'Backlog' }

const normalizePath = (path: string | undefined) => (path ?? '').trim().toLowerCase()

function lastSegment(path: string | undefined): string {
  return (path ?? '').split('\\').map((segment) => segment.trim()).filter(Boolean).at(-1) ?? ''
}

function startTime(iteration: TeamIterationOption): number {
  return parseDateOnly(iteration.startDate)?.getTime() ?? Number.POSITIVE_INFINITY
}

function describeIteration(iteration: TeamIterationOption, isNext: boolean): BacklogSprint {
  switch (iteration.timeFrame) {
    case 'current':
      return { kind: 'current', label: 'This sprint', iteration }
    case 'past':
      return { kind: 'past', label: `${iteration.name} · ended`, iteration }
    default:
      return isNext ? { kind: 'next', label: 'Next sprint', iteration } : { kind: 'future', label: iteration.name, iteration }
  }
}

/** The team's next sprint: its earliest future one. */
export function findNextIteration(iterations: readonly TeamIterationOption[]): TeamIterationOption | undefined {
  return iterations
    .filter((iteration) => iteration.timeFrame === 'future')
    .reduce<TeamIterationOption | undefined>((earliest, iteration) => (
      !earliest || startTime(iteration) < startTime(earliest) ? iteration : earliest
    ), undefined)
}

/**
 * Labels a bug's iteration path against the team's sprints, matching the full path without regard to case. A path
 * that is none of the team's sprints, such as the team's root or backlog iteration, is the backlog. The earliest
 * future sprint is the next one.
 */
export function createBacklogSprintResolver(iterations: readonly TeamIterationOption[]): BacklogSprintResolver {
  if (iterations.length === 0) {
    return (iterationPath) => {
      const name = lastSegment(iterationPath)
      return name ? { kind: 'unknown', label: name } : BACKLOG_SPRINT
    }
  }

  const next = findNextIteration(iterations)
  const sprintsByPath = new Map(iterations.map((iteration) => [
    normalizePath(iteration.path),
    describeIteration(iteration, iteration === next),
  ]))

  return (iterationPath) => sprintsByPath.get(normalizePath(iterationPath)) ?? BACKLOG_SPRINT
}
