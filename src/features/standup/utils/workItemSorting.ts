import type { WorkItemSummary } from '../../../ado/queryEngine'
import { STATUS_COLUMNS } from './statusColumnStyles'

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

  const statusCompare = STATUS_COLUMNS.indexOf(left.status) - STATUS_COLUMNS.indexOf(right.status)
  if (statusCompare !== 0) {
    return statusCompare
  }

  return getDisplayedItemId(left) - getDisplayedItemId(right)
}
