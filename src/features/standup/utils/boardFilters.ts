import type { ResolvedWorkItemAssignee, WorkItemSummary } from '../../../ado/queryEngine'

function normalizeTag(tag: string): string {
  return tag.trim()
}

export function normalizeTagKey(tag: string): string {
  return normalizeTag(tag).toLowerCase()
}

export function parseStoredHiddenTags(value: string | null): string[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    const deduped = new Map<string, string>()
    for (const entry of parsed) {
      if (typeof entry !== 'string') {
        continue
      }

      const normalized = normalizeTag(entry)
      if (!normalized) {
        continue
      }

      deduped.set(normalizeTagKey(normalized), normalized)
    }

    return [...deduped.values()]
  } catch {
    return []
  }
}

export function shouldHideByTag(item: WorkItemSummary, hiddenTagKeys: Set<string>): boolean {
  if (hiddenTagKeys.size === 0) {
    return false
  }

  return (item.tags ?? []).some((tag) => hiddenTagKeys.has(normalizeTagKey(tag)))
}

export function normalizeQuickFilterText(value: string): string {
  return value.trim().toLowerCase()
}

export function normalizeTeamMemberLabel(value: string): string {
  return value.trim().toLowerCase()
}

export function sortTeamMemberLabels(labels: string[]): string[] {
  return [...labels].sort((left, right) => left.localeCompare(right))
}

export function matchesQuickFilter(
  item: WorkItemSummary,
  filterText: string,
  assignee: ResolvedWorkItemAssignee | undefined,
): boolean {
  if (!filterText) {
    return true
  }

  const values: string[] = [
    String(item.id),
    item.title,
    item.workItemType ?? '',
    item.sprintName ?? '',
    assignee?.label ?? '',
    ...(item.tags ?? []),
    ...(item.activePullRequests ?? []).flatMap((pullRequest) => [
      String(pullRequest.id),
      pullRequest.title,
    ]),
  ]

  if (item.kind === 'pull-request' && item.pullRequest) {
    values.push(String(item.pullRequest.id), item.pullRequest.title)
  }

  return values.some((value) => value.toLowerCase().includes(filterText))
}

export function matchesTeamMemberFilter(
  assignee: ResolvedWorkItemAssignee | undefined,
  selectedMemberLabel: string,
): boolean {
  if (!selectedMemberLabel) {
    return true
  }

  if (!assignee || assignee.kind !== 'team-member') {
    return false
  }

  return normalizeTeamMemberLabel(assignee.label) === normalizeTeamMemberLabel(selectedMemberLabel)
}
