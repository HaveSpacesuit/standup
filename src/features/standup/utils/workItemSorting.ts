import type { WorkItemSummary } from '../../../ado/queryEngine'

function getDisplayedItemId(item: WorkItemSummary): number {
  return item.kind === 'pull-request' ? item.pullRequest?.id ?? Math.abs(item.id) : item.id
}

export function sortWorkItemsBySprintAndId(left: WorkItemSummary, right: WorkItemSummary): number {
  const sprintCompare = (left.sprintName ?? '').localeCompare(right.sprintName ?? '', undefined, { numeric: true })
  if (sprintCompare !== 0) {
    return sprintCompare
  }

  return getDisplayedItemId(left) - getDisplayedItemId(right)
}