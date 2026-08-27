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

export function sortWorkItemsBySprintStatusAndId(left: WorkItemSummary, right: WorkItemSummary): number {
  const sprintCompare = (left.sprintName ?? '').localeCompare(right.sprintName ?? '', undefined, { numeric: true })
  if (sprintCompare !== 0) {
    return sprintCompare
  }

  const statusOrder = ['Blocked', 'New', 'Active', 'Review', 'Done'] as const
  const statusCompare = statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status)
  if (statusCompare !== 0) {
    return statusCompare
  }

  return getDisplayedItemId(left) - getDisplayedItemId(right)
}