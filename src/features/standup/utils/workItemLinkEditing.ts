import {
  COMMON_LINK_TYPES,
  DUPLICATE_OF_LINK,
  isSingleTargetLink,
  sameLinkType,
  type WorkItemLinkSpec,
  type WorkItemLinkTarget,
  type WorkItemLinkType,
} from '../../../ado/workItemLinksApi'
import type { ProjectWorkItemState } from '../../../ado/workItemTypesApi'
import type { TriageItem } from '../../../ado/types'

/** How Azure DevOps names a link type, such as Parent, or the last part of its reference name when it isn't known. */
export function getLinkTypeName(rel: string, types: readonly WorkItemLinkType[] = []): string {
  const known = [...COMMON_LINK_TYPES, ...types].find((type) => sameLinkType(type.rel, rel))
  if (known) return known.name
  return rel.split('.').pop()?.replace(/-/g, ' ') || rel
}

/** "#456 Checkout flow", or "#456" when the title isn't known. */
export function formatLinkTarget(target: Pick<WorkItemLinkTarget, 'id' | 'title'>): string {
  return target.title ? `#${target.id} ${target.title}` : `#${target.id}`
}

/**
 * What a saved link change did, in a toast: "#123: Parent → #456 Checkout flow." for one link, "Parent changed to …
 * (was #455)" when it replaced one, and "Related link to #789 removed." for a removal.
 */
export function describeLinkChange(
  id: number,
  added: readonly WorkItemLinkSpec[],
  removed: readonly WorkItemLinkSpec[],
  options: { types?: readonly WorkItemLinkType[]; titles?: Readonly<Record<number, string>> } = {},
): string {
  const name = (link: WorkItemLinkSpec) => getLinkTypeName(link.rel, options.types)
  const target = (link: WorkItemLinkSpec) => formatLinkTarget({ id: link.targetId, title: options.titles?.[link.targetId] })
  const replaced = removed.filter((link) => isSingleTargetLink(link.rel) && added.some((other) => sameLinkType(other.rel, link.rel)))
  const parts = [
    ...added.map((link) => {
      const previous = replaced.find((other) => sameLinkType(other.rel, link.rel))
      return previous ? `${name(link)} changed to ${target(link)} (was #${previous.targetId})` : `${name(link)} → ${target(link)}`
    }),
    ...removed.filter((link) => !replaced.includes(link)).map((link) => `${name(link)} link to ${target(link)} removed`),
  ]
  return `#${id}: ${parts.join('; ')}.`
}

/** The most parents suggested from the Triage queue. */
export const MAX_QUEUE_PARENT_SUGGESTIONS = 10

/** The parents items in the Triage queue already have, the most used first: likely parents for the rest. */
export function getQueueParentSuggestions(items: readonly Pick<TriageItem, 'parent'>[]): WorkItemLinkTarget[] {
  const counts = new Map<number, { target: WorkItemLinkTarget; count: number }>()
  for (const { parent } of items) {
    if (!parent) continue
    const entry = counts.get(parent.id) ?? { target: { id: parent.id }, count: 0 }
    if (parent.title && !entry.target.title) entry.target = { id: parent.id, title: parent.title }
    entry.count += 1
    counts.set(parent.id, entry)
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_QUEUE_PARENT_SUGGESTIONS)
    .map((entry) => entry.target)
}

const categoryOf = (state: ProjectWorkItemState) => state.category.trim().toLowerCase()

/**
 * The state that closes an item marked a duplicate: its type's first Removed state, else its first Completed one. None
 * when it's already closed or its type has neither.
 */
export function getDuplicateCloseState(
  added: readonly WorkItemLinkSpec[],
  states: readonly ProjectWorkItemState[],
  currentState: string | undefined,
): string | undefined {
  if (!added.some((link) => sameLinkType(link.rel, DUPLICATE_OF_LINK))) return undefined
  const current = states.find((state) => state.name.toLowerCase() === currentState?.trim().toLowerCase())
  if (current && ['removed', 'completed'].includes(categoryOf(current))) return undefined
  return (states.find((state) => categoryOf(state) === 'removed') ?? states.find((state) => categoryOf(state) === 'completed'))?.name
}
