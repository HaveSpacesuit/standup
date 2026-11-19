import type { IdentityRef } from '../../../ado/identity'
import type { TeamIterationOption, TeamMember, WorkItemPullRequestSummary } from '../../../ado/types'
import type { ProjectWorkItemState } from '../../../ado/workItemTypesApi'
import type { PatchableWorkItem } from '../../../ado/workItemPatch'
import { getWorkItemFields } from '../../../ado/workItemPatch'
import { resolveMatchingTagRules, resolveStatusFromStateAndTags, type TagRule, type WorkItemStatus } from '../../../ado/workItemStatus'
import {
  changedFields,
  normalizeTags,
  sameFieldValue,
  WORK_ITEM_FIELD_LABELS,
  type EditableWorkItemField,
  type WorkItemFieldChanges,
  type WorkItemFields,
} from '../../../ado/workItemUpdateApi'
import { getImpactDescription } from './backlogValue'
import { findNextIteration } from './backlogSprint'
import { formatEffortPoints } from './sprintEffortTotals'

/** Any listed work item a view can edit: board cards, QA cards, backlog bugs and triage items. */
export type EditableWorkItem = PatchableWorkItem & {
  workItemType?: string
  /** Pull request cards have no work item to edit. */
  kind?: string
  /** A pull request card's pull request. */
  pullRequest?: WorkItemPullRequestSummary
}

/** The order fields appear in menus and panels. */
export const EDIT_MENU_FIELDS: readonly EditableWorkItemField[] = [
  'state', 'assignedTo', 'iterationPath', 'effort', 'severity', 'priority', 'tags', 'title',
]

/** The key that opens each field's editor while a card or row has focus. */
export const FIELD_SHORTCUT_KEYS: Readonly<Record<EditableWorkItemField, string>> = {
  state: 'S',
  assignedTo: 'A',
  iterationPath: 'I',
  effort: 'E',
  severity: 'V',
  priority: 'P',
  tags: 'T',
  title: 'F2',
}

export const RELOAD_SHORTCUT_KEY = 'R'

export const FIELD_EDIT_LABELS: Readonly<Record<EditableWorkItemField, string>> = {
  state: 'Change state',
  assignedTo: 'Assign',
  iterationPath: 'Move to sprint',
  effort: 'Set effort',
  severity: 'Set severity',
  priority: 'Set impact',
  tags: 'Edit tags',
  title: 'Rename',
}

export const SEVERITY_CHOICES: readonly string[] = ['1 - Critical', '2 - High', '3 - Medium', '4 - Low']
export const IMPACT_CHOICES: readonly { value: number; description: string }[] = [1, 2, 3, 4]
  .map((value) => ({ value, description: getImpactDescription(value) ?? '' }))

export type ShortcutAction = { kind: 'field'; field: EditableWorkItemField } | { kind: 'reload' }

/**
 * The editing action a key press on a focused card or row asks for, if any. Shift+F10 and the Menu key are left to the
 * browser, which raises a contextmenu event for them.
 */
export function getShortcutAction(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>): ShortcutAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null
  if (event.key === 'F2') return { kind: 'field', field: 'title' }
  const key = event.key.toUpperCase()
  if (key.length !== 1) return null
  if (key === RELOAD_SHORTCUT_KEY) return { kind: 'reload' }
  const field = (Object.keys(FIELD_SHORTCUT_KEYS) as EditableWorkItemField[]).find((candidate) => FIELD_SHORTCUT_KEYS[candidate] === key)
  return field ? { kind: 'field', field } : null
}

const typeName = (item: EditableWorkItem) => item.workItemType?.trim().toLowerCase() ?? ''

/** Whether the item is a work item that can be edited, rather than a pull request card. */
export function isEditableWorkItem(item: EditableWorkItem): boolean {
  return item.id > 0 && item.kind !== 'pull-request' && Boolean(item.workItemUrl)
}

/** Whether the item is a pull request card, which can be reloaded and linked to, but has no fields to edit. */
export function isPullRequestCard(item: EditableWorkItem): item is EditableWorkItem & { pullRequest: WorkItemPullRequestSummary } {
  return item.kind === 'pull-request' && Boolean(item.pullRequest)
}

/** Whether the item has Reload and a menu: every work item, and pull request cards. */
export function hasItemActions(item: EditableWorkItem): boolean {
  return isEditableWorkItem(item) || isPullRequestCard(item)
}

/** How buttons and messages name the item: "#123" for a work item, "PR 456" for a pull request card. */
export function getItemLabel(item: EditableWorkItem): string {
  return isPullRequestCard(item) ? `PR ${item.pullRequest.id}` : `#${item.id}`
}

/**
 * Identifies the item in every view. Work item IDs repeat across organizations, so it includes the item's URL; a pull
 * request card has its pull request's instead.
 */
export function getItemKey(item: EditableWorkItem): string {
  return `${(item.workItemUrl ?? item.pullRequest?.url)?.toLowerCase() ?? ''}#${item.id}`
}

const PULL_REQUEST_ASPECTS: readonly [label: string, read: (pullRequest: WorkItemPullRequestSummary) => unknown][] = [
  ['Title', (pullRequest) => pullRequest.title],
  ['Status', (pullRequest) => pullRequest.status ?? ''],
  ['Reviews', (pullRequest) => [pullRequest.approvalCount ?? 0, pullRequest.reviewState ?? '', pullRequest.reviewPolicy?.state ?? '', pullRequest.reviewPolicy?.requiredApprovals ?? 0]],
  ['Checks', (pullRequest) => [pullRequest.checks?.state ?? '', pullRequest.checks?.passing ?? 0, pullRequest.checks?.pending ?? 0, pullRequest.checks?.failing ?? 0]],
]

/** What changed between two reads of a pull request, named for a toast: Title, Status, Reviews and Checks. */
export function getPullRequestChanges(before: WorkItemPullRequestSummary, after: WorkItemPullRequestSummary): string[] {
  return PULL_REQUEST_ASPECTS
    .filter(([, read]) => JSON.stringify(read(before)) !== JSON.stringify(read(after)))
    .map(([label]) => label)
}

const samePullRequest = (left: WorkItemPullRequestSummary, right: WorkItemPullRequestSummary) =>
  left.id === right.id && (left.repositoryId?.toLowerCase() ?? '') === (right.repositoryId?.toLowerCase() ?? '')

/** Whether a card's pull requests changed: one came or went, or one it shows changed. */
export function havePullRequestsChanged(
  before: readonly WorkItemPullRequestSummary[] = [],
  after: readonly WorkItemPullRequestSummary[] = [],
): boolean {
  if (before.length !== after.length) return true
  return after.some((pullRequest) => {
    const previous = before.find((candidate) => samePullRequest(candidate, pullRequest))
    return !previous || getPullRequestChanges(previous, pullRequest).length > 0
  })
}

/** The fields worth offering for the item: Severity belongs to bugs, and tasks track remaining work rather than Effort. */
export function getEditableFields(item: EditableWorkItem): EditableWorkItemField[] {
  const type = typeName(item)
  return EDIT_MENU_FIELDS.filter((field) => {
    if (field === 'severity') return type === 'bug' || item.severity !== undefined
    if (field === 'effort') return type !== 'task' || item.effort !== undefined
    return true
  })
}

const sameText = (left: string | undefined, right: string | undefined) =>
  (left ?? '').trim().toLowerCase() === (right ?? '').trim().toLowerCase()

export type StateGroup = { category: string; label: string; states: string[] }

const STATE_CATEGORY_ORDER = ['Proposed', 'InProgress', 'Resolved', 'Completed', 'Removed']
const STATE_CATEGORY_LABELS: Record<string, string> = {
  Proposed: 'Proposed',
  InProgress: 'In progress',
  Resolved: 'Resolved',
  Completed: 'Completed',
  Removed: 'Removed',
}

/** The states the item's type can be in, keyed by lower-cased type; every project state when its type is unknown. */
export function getStatesForItem(
  item: EditableWorkItem,
  statesByType: Readonly<Record<string, ProjectWorkItemState[]>>,
  projectStates: readonly ProjectWorkItemState[],
): ProjectWorkItemState[] {
  return statesByType[typeName(item)] ?? [...projectStates]
}

/** The item's states grouped by category in workflow order, always including the state it is in. */
export function getStateGroups(states: readonly ProjectWorkItemState[], currentState: string | undefined): StateGroup[] {
  const known = currentState && !states.some((state) => sameText(state.name, currentState))
    ? [...states, { name: currentState, category: 'Other' }]
    : states
  const categories = [...new Set(known.map((state) => state.category))]
    .sort((left, right) => rank(left) - rank(right))
  return categories.map((category) => ({
    category,
    label: STATE_CATEGORY_LABELS[category] ?? category,
    states: known.filter((state) => state.category === category).map((state) => state.name),
  }))
}

function rank(category: string): number {
  const index = STATE_CATEGORY_ORDER.indexOf(category)
  return index === -1 ? STATE_CATEGORY_ORDER.length : index
}

export type IterationChoice = { path: string; name: string; detail?: string }
export type IterationGroup = { key: string; label: string; choices: IterationChoice[] }

const RECENT_PAST_SPRINTS = 3
const lastSegment = (path: string) => path.split('\\').filter(Boolean).at(-1) ?? path

/**
 * Where the item can be planned: the current sprint, upcoming sprints, the last few sprints, and the team's backlog
 * (its root iteration). The item's own path is kept when it is none of these.
 */
export function getIterationGroups(
  iterations: readonly TeamIterationOption[],
  backlogPath: string,
  currentPath: string | undefined,
): IterationGroup[] {
  const byStart = (left: TeamIterationOption, right: TeamIterationOption) => (left.startDate ?? '').localeCompare(right.startDate ?? '')
  const next = findNextIteration(iterations)
  const recent = iterations.filter((iteration) => iteration.timeFrame === 'past').sort(byStart).reverse().slice(0, RECENT_PAST_SPRINTS)
  const toChoice = (iteration: TeamIterationOption): IterationChoice => ({
    path: iteration.path,
    name: iteration.name,
    detail: iteration.timeFrame === 'current' ? 'Current sprint'
      : iteration === next ? 'Next sprint'
      : iteration === recent[0] ? 'Previous sprint' : undefined,
  })
  const groups: IterationGroup[] = [
    { key: 'current', label: 'Current', choices: iterations.filter((iteration) => iteration.timeFrame === 'current').map(toChoice) },
    { key: 'future', label: 'Upcoming', choices: iterations.filter((iteration) => iteration.timeFrame === 'future').sort(byStart).map(toChoice) },
    {
      key: 'past',
      label: 'Recent',
      choices: recent.map(toChoice),
    },
  ]
  const backlog = backlogPath.trim()
  if (backlog && !iterations.some((iteration) => sameText(iteration.path, backlog))) {
    groups.push({ key: 'backlog', label: 'Backlog', choices: [{ path: backlog, name: `${lastSegment(backlog)} (no sprint)` }] })
  }
  const listed = groups.some((group) => group.choices.some((choice) => sameText(choice.path, currentPath)))
  if (currentPath?.trim() && !listed) {
    groups.unshift({ key: 'other', label: 'Now in', choices: [{ path: currentPath.trim(), name: lastSegment(currentPath.trim()) }] })
  }
  return groups.filter((group) => group.choices.length > 0)
}

/** Team members who can be assigned work, by name, with the item's assignee first when they are not on the team. */
export function getPeopleChoices(members: readonly TeamMember[], current: IdentityRef | undefined): IdentityRef[] {
  const people: IdentityRef[] = members
    .filter((member) => member.uniqueName?.trim())
    .map((member) => ({ displayName: member.displayName, uniqueName: member.uniqueName, imageUrl: member.imageUrl }))
    .sort((left, right) => (left.displayName ?? '').localeCompare(right.displayName ?? '', undefined, { sensitivity: 'base' }))
  if (current?.uniqueName && !people.some((person) => sameFieldValue('assignedTo', person, current))) {
    people.unshift(current)
  }
  return people
}

/** A field's value in a few words, for confirmations. */
export function describeFieldValue<K extends EditableWorkItemField>(field: K, value: WorkItemFields[K] | null | undefined): string {
  switch (field) {
    case 'assignedTo': {
      const person = value as IdentityRef | undefined
      return person?.displayName ?? person?.uniqueName ?? 'Unassigned'
    }
    case 'iterationPath':
      return value ? lastSegment(value as string) : 'no sprint'
    case 'effort':
      return typeof value === 'number' ? formatEffortPoints(value) : 'no effort'
    case 'priority':
      return typeof value === 'number' ? `Impact ${value}` : 'no impact'
    case 'tags': {
      const tags = (value as string[] | undefined) ?? []
      return tags.length ? tags.join(', ') : 'no tags'
    }
    case 'title':
      return `“${value as string}”`
    default:
      return (value as string | undefined) || 'not set'
  }
}

/** "#42: State → Active" for one field, or "#42: State, Tags updated" for more. */
export function describeSavedChange(id: number, fields: readonly EditableWorkItemField[], saved: WorkItemFields): string {
  if (fields.length === 1) {
    const [field] = fields
    if (field === 'title') return `#${id} renamed.`
    return `#${id}: ${WORK_ITEM_FIELD_LABELS[field]} → ${describeFieldValue(field, saved[field])}.`
  }
  return `#${id}: ${fields.map((field) => WORK_ITEM_FIELD_LABELS[field]).join(', ')} updated.`
}

/** The changes that restore the fields' earlier values, clearing any that had none. */
export function getRestoreChanges(before: WorkItemFields, fields: readonly EditableWorkItemField[]): WorkItemFieldChanges {
  const changes: Record<string, unknown> = {}
  for (const field of fields) {
    changes[field] = field === 'tags' ? [...before.tags] : before[field] ?? null
  }
  return changes as WorkItemFieldChanges
}

export type DropOption = {
  key: string
  label: string
  /** What else the drop changes, such as a tag it removes. */
  detail?: string
  changes: WorkItemFieldChanges
}

/**
 * The ways a card can move into a board column: each of its type's states the column shows, and for columns a tag rule
 * feeds (such as Blocked), adding that tag while keeping the state. Tags whose rules would hold the card in another
 * column are removed. Removed states are left to the menu, since a drag should not cancel work.
 */
export function getColumnDropOptions(
  item: EditableWorkItem,
  column: WorkItemStatus,
  states: readonly ProjectWorkItemState[],
  tagRules: readonly TagRule[],
): DropOption[] {
  const tags = item.tags ?? []
  const holdsElsewhere = (tag: string) => resolveMatchingTagRules([tag], [...tagRules]).some((rule) => rule.action !== 'unlisted' && rule.action !== column)
  const keptTags = tags.filter((tag) => !holdsElsewhere(tag))
  const removedTags = tags.filter(holdsElsewhere)
  const tagChange: WorkItemFieldChanges = removedTags.length ? { tags: keptTags } : {}
  const removalDetail = removedTags.length ? `Removes ${removedTags.join(', ')}` : undefined
  const lands = (state: string | undefined, nextTags: string[]) => resolveStatusFromStateAndTags(state, nextTags.join(';'), [...tagRules]) === column

  const options: DropOption[] = []
  for (const state of states) {
    if (state.category === 'Removed' || !lands(state.name, keptTags)) continue
    const unchanged = sameText(state.name, item.state)
    if (unchanged && !removedTags.length) continue
    options.push({
      key: `state:${state.name.toLowerCase()}`,
      label: state.name,
      detail: removalDetail,
      changes: { ...(unchanged ? {} : { state: state.name }), ...tagChange },
    })
  }

  for (const rule of tagRules) {
    const tag = rule.tag.trim()
    if (rule.action !== column || !tag) continue
    const nextTags = normalizeTags([...keptTags, tag])
    if (!lands(item.state, nextTags) || options.some((option) => option.key === `tag:${tag.toLowerCase()}`)) continue
    options.push({
      key: `tag:${tag.toLowerCase()}`,
      label: `Tag “${tag}”`,
      detail: item.state ? `Stays ${item.state}` : undefined,
      changes: { tags: nextTags },
    })
  }
  return options
}

/**
 * What dropping a card on a lane changes: its assignee on a person's lane, or its sprint on a sprint's lane. A lane that
 * takes no cards, such as one drawn from history, gives the reason instead.
 */
export type LaneDrop =
  | {
      label: string
      changes: WorkItemFieldChanges
      /** Why a card already matching the lane cannot move into it, such as between two lanes for the same sprint. */
      unchangedReason?: string
    }
  | { refusal: string }

export type BoardDropResult =
  | { kind: 'none' }
  | { kind: 'refused'; reason: string }
  | { kind: 'options'; options: DropOption[] }

/**
 * What dropping a card on a board cell would do. Moving between lanes changes what the lane stands for; moving between
 * columns changes the state, offering a choice when the column shows more than one of the card's states. A null
 * `toColumn` is the lane itself, which keeps the card's column.
 */
export function getBoardDropResult({ item, fromLaneKey, toLaneKey, toLane, fromColumn, toColumn, states, tagRules }: {
  item: EditableWorkItem
  fromLaneKey: string
  toLaneKey: string
  toLane: LaneDrop | undefined
  fromColumn: WorkItemStatus
  toColumn: WorkItemStatus | null
  states: readonly ProjectWorkItemState[]
  tagRules: readonly TagRule[]
}): BoardDropResult {
  const column = toColumn ?? fromColumn
  let laneChanges: WorkItemFieldChanges | null = null
  let laneLabel = ''
  if (fromLaneKey !== toLaneKey) {
    if (!toLane || 'refusal' in toLane) return { kind: 'refused', reason: toLane?.refusal ?? 'Cards can’t be moved to this lane' }
    if (changedFields(getWorkItemFields(item), toLane.changes).length) {
      laneChanges = toLane.changes
      laneLabel = toLane.label
    } else if (column === fromColumn) {
      return { kind: 'refused', reason: toLane.unchangedReason ?? `Already ${toLane.label}` }
    }
  }
  if (column === fromColumn) {
    return laneChanges ? { kind: 'options', options: [{ key: 'lane', label: laneLabel, changes: laneChanges }] } : { kind: 'none' }
  }
  const columnOptions = getColumnDropOptions(item, column, states, tagRules)
  if (!columnOptions.length) {
    const type = item.workItemType?.trim() || 'this item'
    return { kind: 'refused', reason: `No ${type} state goes in ${column}` }
  }
  return {
    kind: 'options',
    options: columnOptions.map((option) => ({ ...option, changes: { ...laneChanges, ...option.changes } })),
  }
}

/** What a drop changes, a line per field: "Assigned To → Ana", "State → Active", "Removes tag Blocked". */
export function describeDropChanges(item: EditableWorkItem, changes: WorkItemFieldChanges): string[] {
  const before = getWorkItemFields(item)
  return changedFields(before, changes).flatMap((field) => {
    if (field !== 'tags') return [`${WORK_ITEM_FIELD_LABELS[field]} → ${describeFieldValue(field, changes[field])}`]
    const next = changes.tags ?? []
    const has = (tags: readonly string[], tag: string) => tags.some((other) => sameText(other, tag))
    return [
      ...next.filter((tag) => !has(before.tags, tag)).map((tag) => `Adds tag ${tag}`),
      ...before.tags.filter((tag) => !has(next, tag)).map((tag) => `Removes tag ${tag}`),
    ]
  })
}
