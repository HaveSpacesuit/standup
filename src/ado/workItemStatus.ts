export type WorkItemStatus = 'Blocked' | 'New' | 'Active' | 'Review' | 'Done'

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

function parseTags(value: unknown): string[] {
  if (typeof value !== 'string') {
    return []
  }

  return value
    .split(';')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}

const resolveStatusFromStateAndTags = (stateValue: unknown, tagsValue: unknown): WorkItemStatus => {
  const tags = parseTags(tagsValue)
  const normalizedTags = tags.map((tag) => normalizeText(tag))

  const hasBlockedTag = normalizedTags.some((tag) => tag.includes('blocked'))
  if (hasBlockedTag) {
    return 'Blocked'
  }

  const normalizedState = typeof stateValue === 'string' ? normalizeText(stateValue) : ''

  let status: WorkItemStatus = 'New'

  if (blockedStates.has(normalizedState)) {
    status = 'Blocked'
  } else if (todoStates.has(normalizedState)) {
    status = 'New'
  } else if (inProgressStates.has(normalizedState)) {
    status = 'Active'
  } else if (reviewStates.has(normalizedState)) {
    status = 'Review'
  } else if (doneStates.has(normalizedState)) {
    status = 'Done'
  }

  const hasPrTag = normalizedTags.some((tag) => tag === 'pr')
  if (hasPrTag && status === 'Active') {
    return 'Review'
  }

  return status
}

export { resolveStatusFromStateAndTags }
export default resolveStatusFromStateAndTags
