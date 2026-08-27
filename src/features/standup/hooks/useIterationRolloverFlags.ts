import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine, IterationWindowInfo, TeamIterationOption, WorkItemSummary, WorkItemUpdate } from '../../../ado/queryEngine'
import { resolveUpdateTimestamp, toTimestamp } from '../../../ado/workItemHistoryTimeline'

type UseIterationRolloverFlagsArgs = {
  adoQueryEngine: AdoQueryEngine | null
  team: { orgName: string; projectName: string }
  workItems: WorkItemSummary[]
  iterationWindow: IterationWindowInfo
  teamIterations: TeamIterationOption[]
}

function normalizePath(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function parseAssignedIdentityKey(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (!value || typeof value !== 'object') {
    return ''
  }

  const candidate = value as { uniqueName?: unknown; displayName?: unknown; name?: unknown }
  if (typeof candidate.uniqueName === 'string' && candidate.uniqueName.trim()) {
    return candidate.uniqueName.trim()
  }

  if (typeof candidate.displayName === 'string' && candidate.displayName.trim()) {
    return candidate.displayName.trim()
  }

  if (typeof candidate.name === 'string' && candidate.name.trim()) {
    return candidate.name.trim()
  }

  return ''
}

function parseIterationDate(value: string | undefined): number {
  return toTimestamp(value) ?? Number.NEGATIVE_INFINITY
}

function resolveCurrentIterationPath(iterationWindow: IterationWindowInfo, teamIterations: TeamIterationOption[]): string {
  const currentFromWindow = iterationWindow.current?.fullName?.trim()
  if (currentFromWindow) {
    return currentFromWindow
  }

  return teamIterations.find((iteration) => iteration.timeFrame === 'current')?.path.trim() ?? ''
}

function resolvePreviousIterationPath(teamIterations: TeamIterationOption[], currentIterationPath: string): string {
  const normalizedCurrent = normalizePath(currentIterationPath)
  const pastIterations = teamIterations
    .filter((iteration) => iteration.timeFrame === 'past')
    .filter((iteration) => normalizePath(iteration.path) !== normalizedCurrent)
    .sort((left, right) => {
      const finishCompare = parseIterationDate(right.finishDate) - parseIterationDate(left.finishDate)
      if (finishCompare !== 0) {
        return finishCompare
      }

      const startCompare = parseIterationDate(right.startDate) - parseIterationDate(left.startDate)
      if (startCompare !== 0) {
        return startCompare
      }

      return right.path.localeCompare(left.path, undefined, { numeric: true })
    })

  return pastIterations[0]?.path.trim() ?? ''
}

function wasAssignedRollover(updates: WorkItemUpdate[], normalizedPrevious: string, normalizedCurrent: string): boolean {
  const now = Date.now()
  const sortedUpdates = [...updates].sort((left, right) => {
    const leftAt = toTimestamp(resolveUpdateTimestamp(left, now)) ?? 0
    const rightAt = toTimestamp(resolveUpdateTimestamp(right, now)) ?? 0
    return leftAt - rightAt
  })

  let currentAssignee = ''

  for (const update of sortedUpdates) {
    if (!resolveUpdateTimestamp(update, now)) {
      continue
    }

    const fields = update.fields ?? {}
    const iterationChange = fields['System.IterationPath']
    if (
      currentAssignee
      && normalizePath(iterationChange?.oldValue) === normalizedPrevious
      && normalizePath(iterationChange?.newValue) === normalizedCurrent
    ) {
      return true
    }

    if (Object.hasOwn(fields, 'System.AssignedTo')) {
      currentAssignee = parseAssignedIdentityKey(fields['System.AssignedTo']?.newValue)
    }
  }

  return false
}

export function useIterationRolloverFlags({
  adoQueryEngine,
  team,
  workItems,
  iterationWindow,
  teamIterations,
}: UseIterationRolloverFlagsArgs): Record<number, boolean> {
  const [rolledOverItemIds, setRolledOverItemIds] = useState<Record<number, boolean>>({})

  const currentIterationPath = useMemo(
    () => resolveCurrentIterationPath(iterationWindow, teamIterations),
    [iterationWindow, teamIterations],
  )
  const previousIterationPath = useMemo(
    () => resolvePreviousIterationPath(teamIterations, currentIterationPath),
    [currentIterationPath, teamIterations],
  )

  useEffect(() => {
    const normalizedCurrent = normalizePath(currentIterationPath)
    const workItemCards = workItems.filter(
      (item) => item.kind !== 'pull-request' && normalizePath(item.iterationPath) === normalizedCurrent,
    )
    if (!adoQueryEngine || !currentIterationPath || !previousIterationPath || workItemCards.length === 0) {
      setRolledOverItemIds({})
      return
    }

    const abortController = new AbortController()
    const normalizedPrevious = normalizePath(previousIterationPath)

    Promise.all(
      workItemCards.map(async (item) => {
        try {
          const updates = await adoQueryEngine.getWorkItemUpdates(team, item.id, abortController.signal)
          const hasRollover = wasAssignedRollover(updates, normalizedPrevious, normalizedCurrent)

          return [item.id, hasRollover] as const
        } catch {
          return [item.id, false] as const
        }
      }),
    ).then((entries) => {
      if (abortController.signal.aborted) {
        return
      }

      setRolledOverItemIds(Object.fromEntries(entries.filter(([, hasRollover]) => hasRollover)))
    })

    return () => {
      abortController.abort()
    }
  }, [adoQueryEngine, currentIterationPath, previousIterationPath, team, workItems])

  return rolledOverItemIds
}
