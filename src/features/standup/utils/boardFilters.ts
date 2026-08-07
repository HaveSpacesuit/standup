import type { ResolvedWorkItemAssignee, WorkItemSummary } from '../../../ado/queryEngine'
import {
  DEFAULT_TAG_RULES,
  resolveStatusFromStateAndTags,
  shouldHideByTagRules,
  type TagRule,
  type TagRuleAction,
} from '../../../ado/workItemStatus'

function normalizeTag(tag: string): string {
  return tag.trim()
}

export function normalizeTagKey(tag: string): string {
  return normalizeTag(tag).toLowerCase()
}

function isTagRuleAction(value: unknown): value is TagRuleAction {
  return value === 'Blocked' || value === 'New' || value === 'Active' || value === 'Review' || value === 'Done' || value === 'unlisted'
}

export function createTagRule(tag = '', action: TagRuleAction = 'unlisted'): TagRule {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    tag,
    action,
  }
}

export function parseStoredTagRules(value: string | null, legacyHiddenTagsValue?: string | null): TagRule[] {
  if (value) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        const next: TagRule[] = []

        for (const entry of parsed) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            continue
          }

          const candidate = entry as { id?: unknown; tag?: unknown; action?: unknown }
          const tag = typeof candidate.tag === 'string' ? normalizeTag(candidate.tag) : ''
          const action = isTagRuleAction(candidate.action) ? candidate.action : null

          if (!tag || !action) {
            continue
          }

          next.push({
            id: typeof candidate.id === 'string' && candidate.id ? candidate.id : createTagRule().id,
            tag,
            action,
          })
        }

        if (next.length > 0) {
          return next
        }
      }
    } catch {
      // Fall back to defaults below.
    }
  }

  const rules = [...DEFAULT_TAG_RULES]

  if (legacyHiddenTagsValue) {
    try {
      const parsed = JSON.parse(legacyHiddenTagsValue)
      if (Array.isArray(parsed)) {
        const legacyRules = parsed
          .filter((entry): entry is string => typeof entry === 'string')
          .map((tag) => normalizeTag(tag))
          .filter(Boolean)
          .map((tag) => createTagRule(tag, 'unlisted'))

        rules.push(...legacyRules)
      }
    } catch {
      // Ignore legacy hidden tag parse failures.
    }
  }

  return rules
}

export function getTagRuleCountForAction(tagRules: TagRule[], action: TagRuleAction): number {
  return tagRules.filter((rule) => rule.action === action).length
}

export function shouldHideByTag(item: WorkItemSummary, tagRules: TagRule[]): boolean {
  return shouldHideByTagRules(item.tags?.join(';') ?? '', tagRules)
}

export function applyTagRulesToItem(item: WorkItemSummary, tagRules: TagRule[]): WorkItemSummary | null {
  if (shouldHideByTag(item, tagRules)) {
    return null
  }

  return {
    ...item,
    status: resolveStatusFromStateAndTags(item.state, item.tags?.join(';'), tagRules),
  }
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
