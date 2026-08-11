import type { WorkItemSummary } from '../../../ado/queryEngine'

export type QualityAssuranceRuleCriterionKind = 'sprint' | 'tag' | 'workItemType'
export type QualityAssuranceRuleAction = 'New' | 'unlisted'

export type QualityAssuranceRule = {
  id: string
  kind: QualityAssuranceRuleCriterionKind
  value: string
  action: QualityAssuranceRuleAction
}

const STORAGE_KEY = 'standup:qa-tag-rules'

const VALID_ACTIONS = new Set<QualityAssuranceRuleAction>(['New', 'unlisted'])
const VALID_KINDS = new Set<QualityAssuranceRuleCriterionKind>(['sprint', 'tag', 'workItemType'])

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function isLegacyTagRule(candidate: unknown): candidate is { id?: unknown; tag?: unknown; action?: unknown } {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return false
  }

  return 'tag' in candidate || 'action' in candidate || 'id' in candidate
}

function isQualityAssuranceRule(candidate: unknown): candidate is QualityAssuranceRule {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return false
  }

  const entry = candidate as { id?: unknown; kind?: unknown; value?: unknown; action?: unknown }
  return typeof entry.id === 'string'
    && entry.id.length > 0
    && typeof entry.kind === 'string'
    && VALID_KINDS.has(entry.kind as QualityAssuranceRuleCriterionKind)
    && typeof entry.value === 'string'
    && entry.value.trim().length > 0
    && typeof entry.action === 'string'
    && VALID_ACTIONS.has(entry.action as QualityAssuranceRuleAction)
}

export function createQualityAssuranceRule(
  kind: QualityAssuranceRuleCriterionKind = 'tag',
  value = '',
  action: QualityAssuranceRuleAction = 'New',
): QualityAssuranceRule {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    kind,
    value,
    action,
  }
}

function getInitialRulesFromStorage(): QualityAssuranceRule[] {
  const rawValue = localStorage.getItem(STORAGE_KEY)
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    const migratedRules: QualityAssuranceRule[] = []

    for (const entry of parsed) {
      if (isQualityAssuranceRule(entry)) {
        migratedRules.push(entry)
        continue
      }

      if (!isLegacyTagRule(entry)) {
        continue
      }

      const legacy = entry as { id?: unknown; tag?: unknown; action?: unknown }
      const tag = typeof legacy.tag === 'string' ? legacy.tag.trim() : ''
      if (!tag) {
        continue
      }

      migratedRules.push({
        id: typeof legacy.id === 'string' && legacy.id ? legacy.id : createQualityAssuranceRule().id,
        kind: 'tag',
        value: tag,
        action: legacy.action === 'unlisted' ? 'unlisted' : 'New',
      })
    }

    return migratedRules
  } catch {
    return []
  }
}

export function readQualityAssuranceRules(): QualityAssuranceRule[] {
  return getInitialRulesFromStorage()
}

export function writeQualityAssuranceRules(rules: QualityAssuranceRule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
}

function matchesRuleValue(rule: QualityAssuranceRule, item: WorkItemSummary): boolean {
  const normalizedRuleValue = normalizeText(rule.value)
  if (!normalizedRuleValue) {
    return false
  }

  if (rule.kind === 'tag') {
    return (item.tags ?? []).some((tag) => normalizeText(tag).includes(normalizedRuleValue))
  }

  if (rule.kind === 'sprint') {
    return normalizeText(item.sprintName ?? '').includes(normalizedRuleValue)
  }

  return normalizeText(item.workItemType ?? '') === normalizedRuleValue
}

export function resolveMatchingQualityAssuranceRule(
  item: WorkItemSummary,
  rules: QualityAssuranceRule[],
): QualityAssuranceRule | null {
  for (const rule of rules) {
    if (matchesRuleValue(rule, item)) {
      return rule
    }
  }

  return null
}

export function applyQualityAssuranceRulesToItem(
  item: WorkItemSummary,
  rules: QualityAssuranceRule[],
): WorkItemSummary | null {
  const matchingRule = resolveMatchingQualityAssuranceRule(item, rules)

  if (!matchingRule) {
    return item
  }

  if (matchingRule.action === 'unlisted') {
    return null
  }

  return {
    ...item,
    status: 'New',
  }
}
