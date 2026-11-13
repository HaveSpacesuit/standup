import type { TeamIterationOption, WorkItemSummary } from '../../../ado/types'
import { DEFAULT_TAG_RULES, resolveMatchingTagRules, shouldHideByTagRules, type TagRule } from '../../../ado/workItemStatus'
import { applyTagRulesToItem } from './boardFilters'
import { compareRankedBacklogBugs, rankBacklogBug } from './backlogValue'

export function isQuickAssignable(item: WorkItemSummary, tagRules: TagRule[] = DEFAULT_TAG_RULES): boolean {
  const type = item.workItemType?.trim().toLowerCase()
  return item.kind !== 'pull-request'
    && (type === 'product backlog item' || type === 'bug')
    && !item.assignedTo
    && item.effort !== 0
    && typeof item.state === 'string' && item.state.trim().length > 0
    && !shouldHideByTagRules(item.tags, tagRules)
    && !resolveMatchingTagRules(item.tags, tagRules).some((rule) => rule.action === 'Blocked')
    && applyTagRulesToItem(item, tagRules)?.status === 'New'
}

export type QuickAssignGroup = { key: string; label: string; items: WorkItemSummary[] }

const normalize = (value: string) => value.trim().toLowerCase()
const time = (value?: string) => {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : Infinity
}
const compareNumber = (a: number, b: number) => a === b ? 0 : a < b ? -1 : 1

export function getQuickAssignGroups(
  items: readonly WorkItemSummary[],
  iterations: readonly TeamIterationOption[],
  tagRules: TagRule[] = DEFAULT_TAG_RULES,
): QuickAssignGroup[] {
  const iterationByPath = new Map(iterations.map((iteration) => [normalize(iteration.path), iteration]))
  const groups = new Map<string, QuickAssignGroup>()
  for (const item of items) {
    if (!isQuickAssignable(item, tagRules)) continue
    const key = normalize(item.iterationPath ?? '')
    const group = groups.get(key) ?? { key, label: iterationByPath.get(key)?.name ?? item.sprintName ?? item.iterationPath ?? 'No sprint', items: [] }
    group.items.push(item)
    groups.set(key, group)
  }
  const bugs = new Map(items.filter((item) => item.workItemType?.trim().toLowerCase() === 'bug')
    .map((item) => [item.id, rankBacklogBug({ ...item, workItemUrl: item.workItemUrl ?? '' })]))
  for (const group of groups.values()) {
    group.items.sort((a, b) => {
      const aBug = bugs.get(a.id)
      const bBug = bugs.get(b.id)
      if (aBug && bBug) return compareRankedBacklogBugs(aBug, bBug)
      if (Boolean(aBug) !== Boolean(bBug)) return aBug ? 1 : -1
      const effort = (item: WorkItemSummary) => Number.isFinite(item.effort) ? item.effort! : -Infinity
      return compareNumber(effort(b), effort(a)) || compareNumber(time(a.createdAt), time(b.createdAt)) || a.id - b.id
    })
  }
  return [...groups.values()].sort((a, b) =>
    compareNumber(time(iterationByPath.get(a.key)?.startDate), time(iterationByPath.get(b.key)?.startDate))
    || a.label.localeCompare(b.label, undefined, { numeric: true }) || a.key.localeCompare(b.key))
}
