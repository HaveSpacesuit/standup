export type WorkItemStatus = 'Blocked' | 'New' | 'Active' | 'Review' | 'Done'
export type TagRuleAction = WorkItemStatus | 'unlisted'

export type TagRule = {
  id: string
  tag: string
  action: TagRuleAction
}

export const DEFAULT_TAG_RULES: TagRule[] = [
  {
    id: 'default-blocked',
    tag: 'blocked',
    action: 'Blocked',
  },
  {
    id: 'default-pr',
    tag: 'pr',
    action: 'Review',
  },
]

const blockedStates = new Set(['design', 'in planning', 'inactive', 'on hold'])
const todoStates = new Set([
  'accepted',
  'approved',
  'not started',
  'new',
  'open',
  'ready',
  'refined',
  'requested',
  'to do',
])
const inProgressStates = new Set(['active', 'committed', 'failed testing', 'in progress'])
const reviewStates = new Set(['available for testing', 'in code review', 'ready to build'])
const doneStates = new Set(['closed', 'completed', 'done', 'removed'])

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function normalizeTagRulePattern(value: string): string {
  return normalizeText(value)
}

function parseTags(value: unknown): string[] {
  if (typeof value !== 'string') {
    return []
  }

  return value
    .split(';')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}

export function resolveMatchingTagRules(tagsValue: unknown, tagRules: TagRule[] = DEFAULT_TAG_RULES): TagRule[] {
  const tags = parseTags(tagsValue)
  if (tags.length === 0 || tagRules.length === 0) {
    return []
  }

  const normalizedTags = tags.map((tag) => normalizeText(tag))

  return tagRules.filter((rule) => {
    const normalizedPattern = normalizeTagRulePattern(rule.tag)
    if (!normalizedPattern) {
      return false
    }

    return normalizedTags.some((tag) => tag.includes(normalizedPattern))
  })
}

export function shouldHideByTagRules(tagsValue: unknown, tagRules: TagRule[] = DEFAULT_TAG_RULES): boolean {
  return resolveMatchingTagRules(tagsValue, tagRules).some((rule) => rule.action === 'unlisted')
}

export function getRelevantTagRuleSignature(tagsValue: unknown, tagRules: TagRule[] = DEFAULT_TAG_RULES): string {
  return resolveMatchingTagRules(tagsValue, tagRules)
    .map((rule) => `${normalizeTagRulePattern(rule.tag)}=>${rule.action}`)
    .join('|')
}

function resolveBaseStatusFromState(stateValue: unknown): WorkItemStatus {
  const normalizedState = typeof stateValue === 'string' ? normalizeText(stateValue) : ''

  if (blockedStates.has(normalizedState)) {
    return 'Blocked'
  }

  if (todoStates.has(normalizedState)) {
    return 'New'
  }

  if (inProgressStates.has(normalizedState)) {
    return 'Active'
  }

  if (reviewStates.has(normalizedState)) {
    return 'Review'
  }

  if (doneStates.has(normalizedState)) {
    return 'Done'
  }

  return 'New'
}

const resolveStatusFromStateAndTags = (
  stateValue: unknown,
  tagsValue: unknown,
  tagRules: TagRule[] = DEFAULT_TAG_RULES,
): WorkItemStatus => {
  const matchingRule = resolveMatchingTagRules(tagsValue, tagRules).find((rule) => rule.action !== 'unlisted')
  if (matchingRule && matchingRule.action !== 'unlisted') {
    return matchingRule.action
  }

  return resolveBaseStatusFromState(stateValue)
}

export { resolveStatusFromStateAndTags }
export default resolveStatusFromStateAndTags
