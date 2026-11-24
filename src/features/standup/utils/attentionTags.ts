import type { WorkItemSummary } from '../../../ado/types'
import type { ProjectWorkItemTypeInfo } from '../../../ado/workItemTypesApi'

export const DEFAULT_ATTENTION_TAGS = ['E2E', 'Release']

export function attentionTagError(value: string): string | null {
  if (!value.trim()) return 'Enter a tag name.'
  if (value.trim().length > 400 || /[;,\p{Cc}]/u.test(value)) {
    return 'Use one tag name, up to 400 characters, without commas, semicolons, or control characters.'
  }
  return null
}

export function parseAttentionTags(value: unknown): string[] {
  if (value === undefined) return [...DEFAULT_ATTENTION_TAGS]
  if (!Array.isArray(value)) {
    throw new Error('Attention tags must be a list of valid, nonempty tag names.')
  }
  const unique = new Map<string, string>()
  for (const tag of value) {
    if (typeof tag !== 'string' || attentionTagError(tag)) {
      throw new Error('Attention tags must be a list of valid, nonempty tag names.')
    }
    const trimmed = tag.trim()
    if (!unique.has(trimmed.toLowerCase())) unique.set(trimmed.toLowerCase(), trimmed)
  }
  return [...unique.values()]
}

export function matchingAttentionTags(item: Pick<WorkItemSummary, 'tags'>, tags: readonly string[]): string[] {
  const present = new Set((item.tags ?? []).map((tag) => tag.trim().toLowerCase()))
  return tags.filter((tag) => present.has(tag.trim().toLowerCase()))
}

export function attentionStateCategory(
  item: Pick<WorkItemSummary, 'state' | 'workItemType'>,
  statesByType: ProjectWorkItemTypeInfo['statesByType'],
): string | undefined {
  return statesByType[item.workItemType?.toLowerCase() ?? '']
    ?.find((state) => state.name.trim().toLowerCase() === item.state?.trim().toLowerCase())
    ?.category.trim().toLowerCase()
}

export function isOpenAttentionItem(item: WorkItemSummary, statesByType: ProjectWorkItemTypeInfo['statesByType']): boolean {
  const category = attentionStateCategory(item, statesByType)
  return category === 'proposed' || category === 'inprogress' || category === 'resolved'
}

export function sortAttentionItems(items: WorkItemSummary[]): WorkItemSummary[] {
  const assigned = (item: WorkItemSummary) => Boolean(item.assignedTo?.uniqueName || item.assignedTo?.displayName)
  return [...items].sort((a, b) => Number(assigned(a)) - Number(assigned(b)) || b.id - a.id)
}
