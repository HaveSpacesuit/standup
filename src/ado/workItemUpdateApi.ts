import type { TeamProfile } from '../appSettings'
import { QUICK_ASSIGN_PAT_FIX } from '../adoAuth'
import { parseAssignedTo, type IdentityRef } from './identity'
import { AdoAuthError, AdoWriteError, type AdoRequestClient } from './httpClient'
import { parseEffort, resolveEffort, resolveTags, type WorkItemApiItem } from './workItemsApi'

/** The fields every view can edit, as the views hold them. A field left undefined has no value. */
export type WorkItemFields = {
  title: string
  assignedTo?: IdentityRef
  iterationPath?: string
  state?: string
  tags: string[]
  /** Microsoft.VSTS.Common.Priority, which the app presents as Impact. */
  priority?: number
  severity?: string
  effort?: number
}

export type EditableWorkItemField = keyof WorkItemFields

/** New values for some fields. Null clears a field. */
export type WorkItemFieldChanges = {
  title?: string
  assignedTo?: IdentityRef | null
  iterationPath?: string
  state?: string
  tags?: string[]
  priority?: number | null
  severity?: string | null
  effort?: number | null
}

type PatchOperation = { op: 'test' | 'add' | 'replace' | 'remove'; path: string; value?: unknown }

export const EDITABLE_WORK_ITEM_FIELDS: readonly EditableWorkItemField[] = [
  'title', 'state', 'assignedTo', 'iterationPath', 'effort', 'severity', 'priority', 'tags',
]

export const WORK_ITEM_FIELD_REFERENCES: Record<EditableWorkItemField, string> = {
  title: 'System.Title',
  assignedTo: 'System.AssignedTo',
  iterationPath: 'System.IterationPath',
  state: 'System.State',
  tags: 'System.Tags',
  priority: 'Microsoft.VSTS.Common.Priority',
  severity: 'Microsoft.VSTS.Common.Severity',
  effort: 'Microsoft.VSTS.Scheduling.Effort',
}

export const WORK_ITEM_FIELD_LABELS: Record<EditableWorkItemField, string> = {
  title: 'Title',
  assignedTo: 'Assigned to',
  iterationPath: 'Sprint',
  state: 'State',
  tags: 'Tags',
  priority: 'Impact',
  severity: 'Severity',
  effort: 'Effort',
}

/** Azure DevOps limits titles to 255 characters. */
export const WORK_ITEM_TITLE_MAX_LENGTH = 255

const PAT_FIX_SUFFIX = `${QUICK_ASSIGN_PAT_FIX} Nothing was changed.`

/**
 * Azure DevOps answers a PAT without write scope with a 401 that lacks CORS headers, so the browser reports only a network
 * failure. This is raised when a re-read shows the write left the item untouched.
 */
export class WorkItemNotSavedError extends Error {
  constructor() {
    super(`Azure DevOps did not save the change and did not say why. This usually means your PAT is missing the Work Items (Read & write) scope. ${PAT_FIX_SUFFIX}`)
    this.name = 'WorkItemNotSavedError'
  }
}

/** Someone else changed a field being edited since the view loaded it, so saving would overwrite their value. */
export class WorkItemConflictError extends Error {
  readonly fields: EditableWorkItemField[]
  /** The item as Azure DevOps has it now. */
  readonly current: WorkItemFields
  readonly item: WorkItemApiItem

  constructor(id: number, fields: EditableWorkItemField[], current: WorkItemFields, item: WorkItemApiItem) {
    const names = fields.map((field) => WORK_ITEM_FIELD_LABELS[field]).join(', ')
    super(`#${id}'s ${names} changed in Azure DevOps since this view loaded it. Nothing was saved; the item now shows the new value.`)
    this.name = 'WorkItemConflictError'
    this.fields = fields
    this.current = current
    this.item = item
  }
}

/** True when the write failed because of PAT scope or permissions, so trying again cannot help until that is fixed. */
export function isWorkItemWriteAccessError(error: unknown): boolean {
  return error instanceof AdoAuthError || error instanceof WorkItemNotSavedError || (error instanceof AdoWriteError && error.accessDenied)
}

const rawFields = (item: WorkItemApiItem): Record<string, unknown> => (item.fields ?? {}) as Record<string, unknown>

const optionalText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

export function readWorkItemFields(item: WorkItemApiItem): WorkItemFields {
  const fields = rawFields(item)
  return {
    title: typeof fields['System.Title'] === 'string' ? fields['System.Title'] : `Work Item ${item.id ?? ''}`.trim(),
    assignedTo: parseAssignedTo(fields['System.AssignedTo']),
    iterationPath: optionalText(fields['System.IterationPath']),
    state: optionalText(fields['System.State']),
    tags: resolveTags(item.fields),
    priority: parseEffort(fields['Microsoft.VSTS.Common.Priority']),
    severity: optionalText(fields['Microsoft.VSTS.Common.Severity']),
    effort: resolveEffort(item.fields),
  }
}

const identityKey = (identity: IdentityRef | null | undefined) =>
  (identity?.uniqueName ?? identity?.displayName ?? '').trim().toLowerCase()

const tagKeys = (tags: readonly string[]) => new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))

/** Whether two values of a field mean the same thing to Azure DevOps. */
export function sameFieldValue<K extends EditableWorkItemField>(field: K, left: WorkItemFields[K] | null | undefined, right: WorkItemFields[K] | null | undefined): boolean {
  switch (field) {
    case 'assignedTo':
      return identityKey(left as IdentityRef | undefined) === identityKey(right as IdentityRef | undefined)
    case 'tags': {
      const a = tagKeys((left as string[] | undefined) ?? [])
      const b = tagKeys((right as string[] | undefined) ?? [])
      return a.size === b.size && [...a].every((tag) => b.has(tag))
    }
    case 'iterationPath':
    case 'state':
    case 'severity':
      return ((left as string | undefined) ?? '').trim().toLowerCase() === ((right as string | undefined) ?? '').trim().toLowerCase()
    default:
      return (left ?? undefined) === (right ?? undefined)
  }
}

/** The fields with the changes applied. */
export function applyFieldChanges(fields: WorkItemFields, changes: WorkItemFieldChanges): WorkItemFields {
  const next: WorkItemFields = { ...fields }
  for (const field of EDITABLE_WORK_ITEM_FIELDS) {
    if (!Object.hasOwn(changes, field)) continue
    const value = changes[field]
    ;(next as Record<string, unknown>)[field] = field === 'tags' ? [...((value as string[] | undefined) ?? [])] : value ?? undefined
  }
  return next
}

/** The fields whose value the changes would actually change. */
export function changedFields(fields: WorkItemFields, changes: WorkItemFieldChanges): EditableWorkItemField[] {
  return EDITABLE_WORK_ITEM_FIELDS.filter((field) => Object.hasOwn(changes, field) && !sameFieldValue(field, fields[field], changes[field] as never))
}

/** Tags in a stable, readable order: alphabetical, ignoring case, with duplicates dropped. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Map<string, string>()
  for (const tag of tags) {
    const trimmed = tag.trim()
    if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed)
  }
  return [...seen.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
}

/**
 * Reconciles the changes with the item as Azure DevOps has it now. Tag edits are applied as additions and removals, so
 * tags someone else added meanwhile are kept. Any other field someone else changed is a conflict, unless they already set
 * it to the new value.
 */
export function reconcileFieldChanges(
  id: number,
  current: WorkItemFields,
  changes: WorkItemFieldChanges,
  expected: Partial<WorkItemFields>,
  item: WorkItemApiItem,
): WorkItemFieldChanges {
  const resolved: WorkItemFieldChanges = {}
  const conflicts: EditableWorkItemField[] = []
  for (const field of EDITABLE_WORK_ITEM_FIELDS) {
    if (!Object.hasOwn(changes, field)) continue
    if (field === 'tags') {
      const next = changes.tags ?? []
      const base = Object.hasOwn(expected, 'tags') ? expected.tags ?? [] : current.tags
      const added = next.filter((tag) => !tagKeys(base).has(tag.trim().toLowerCase()))
      const removed = tagKeys(base.filter((tag) => !tagKeys(next).has(tag.trim().toLowerCase())))
      resolved.tags = normalizeTags([...current.tags.filter((tag) => !removed.has(tag.trim().toLowerCase())), ...added])
      continue
    }
    const next = changes[field]
    if (sameFieldValue(field, current[field], next as never)) continue
    if (Object.hasOwn(expected, field) && !sameFieldValue(field, current[field], expected[field] as never)) {
      conflicts.push(field)
      continue
    }
    ;(resolved as Record<string, unknown>)[field] = next
  }
  if (conflicts.length) throw new WorkItemConflictError(id, conflicts, current, item)
  if (resolved.tags && sameFieldValue('tags', current.tags, resolved.tags)) delete resolved.tags
  return resolved
}

function validateChanges(changes: WorkItemFieldChanges): void {
  if (Object.hasOwn(changes, 'title')) {
    const title = changes.title?.trim() ?? ''
    if (!title) throw new Error('A work item needs a title. Nothing was changed.')
    if (title.length > WORK_ITEM_TITLE_MAX_LENGTH) throw new Error(`Titles can be at most ${WORK_ITEM_TITLE_MAX_LENGTH} characters. Nothing was changed.`)
  }
  if (changes.assignedTo && !changes.assignedTo.uniqueName?.trim()) {
    throw new Error('This person has no Azure DevOps account identifier. Refresh team members before assigning work.')
  }
  for (const field of ['effort', 'priority'] as const) {
    const value = changes[field]
    if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`${WORK_ITEM_FIELD_LABELS[field]} must be a number of 0 or more. Nothing was changed.`)
    }
  }
  if (Object.hasOwn(changes, 'state') && !changes.state?.trim()) throw new Error('Choose a state. Nothing was changed.')
  if (Object.hasOwn(changes, 'iterationPath') && !changes.iterationPath?.trim()) throw new Error('Choose a sprint. Nothing was changed.')
}

/** The JSON Patch document that makes the changes, guarded by the revision they were made against. */
export function buildWorkItemPatch(rev: number, changes: WorkItemFieldChanges, item: WorkItemApiItem): PatchOperation[] {
  const fields = rawFields(item)
  const operations: PatchOperation[] = []
  for (const field of EDITABLE_WORK_ITEM_FIELDS) {
    if (!Object.hasOwn(changes, field)) continue
    const reference = WORK_ITEM_FIELD_REFERENCES[field]
    const path = `/fields/${reference}`
    const value = changes[field]
    const cleared = value === null || value === undefined || (field === 'tags' && !(value as string[]).length)
    if (cleared) {
      // Removing a field that has no value fails, and there is nothing to clear.
      const present = fields[reference]
      if (present !== undefined && present !== null && present !== '') operations.push({ op: 'remove', path })
      continue
    }
    const serialized = field === 'assignedTo' ? (value as IdentityRef).uniqueName!.trim()
      : field === 'tags' ? normalizeTags(value as string[]).join('; ')
        : typeof value === 'string' ? value.trim() : value
    // Azure DevOps merges tags given with add into the item's tags, so it could never remove one; replace sets the list.
    const hasTags = field === 'tags' && typeof fields[reference] === 'string' && (fields[reference] as string).trim() !== ''
    operations.push({ op: hasTags ? 'replace' : 'add', path, value: serialized })
  }
  return operations.length ? [{ op: 'test', path: '/rev', value: rev }, ...operations] : []
}

export type WorkItemReadResult = {
  item: WorkItemApiItem
  fields: WorkItemFields
}

function workItemRequest(team: Pick<TeamProfile, 'orgName' | 'projectName'>, id: number) {
  return { orgName: team.orgName, path: `/${encodeURIComponent(team.projectName)}/_apis/wit/workitems/${id}` }
}

/** The item as Azure DevOps has it now, in one request. */
export async function readWorkItem(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  id: number,
): Promise<WorkItemReadResult> {
  const item = await client.request<WorkItemApiItem>(workItemRequest(team, id))
  if (item?.id !== id) throw new Error(`Azure DevOps did not return work item ${id}.`)
  return { item, fields: readWorkItemFields(item) }
}

/**
 * Saves the changes to one work item: reads it fresh, reconciles the changes with anything changed meanwhile, then
 * patches only the fields that change, guarded by the revision just read. A failed write is never retried; when its
 * response is lost, the item is re-read to learn whether it was saved.
 *
 * @param expected The values the view showed for the changed fields, to detect someone else's change to them.
 */
export async function updateWorkItemFields(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
  id: number,
  changes: WorkItemFieldChanges,
  expected: Partial<WorkItemFields> = {},
): Promise<WorkItemReadResult> {
  validateChanges(changes)
  const request = workItemRequest(team, id)
  const before = await readWorkItem(client, team, id)
  const rev = before.item.rev
  if (!Number.isInteger(rev) || rev! < 1) throw new Error(`Azure DevOps returned work item ${id} without a revision. Nothing was changed.`)
  const resolved = reconcileFieldChanges(id, before.fields, changes, expected, before.item)
  const body = buildWorkItemPatch(rev!, resolved, before.item)
  if (!body.length) return before

  const isSaved = (fields: WorkItemFields) => changedFields(fields, resolved).length === 0
  let saved: WorkItemApiItem
  try {
    saved = await client.request<WorkItemApiItem>({ ...request, method: 'PATCH', contentType: 'application/json-patch+json', body })
  } catch (error) {
    if (isWorkItemWriteAccessError(error)) throw error
    if (error instanceof AdoWriteError) {
      if (error.status === 409 || error.status === 412) {
        throw new Error(`#${id} changed in Azure DevOps while saving. Nothing was saved; reload the item and try again.`)
      }
      if (error.status === 400) {
        throw new Error(`Azure DevOps refused the change to #${id} (HTTP 400). The value may not be allowed for this item, such as a state its workflow cannot move to or a required field left empty. Nothing was changed.`)
      }
      throw error
    }
    // A failed transport can follow a committed write. Never retry it; re-read the item to learn whether it was saved.
    const after = await readWorkItem(client, team, id).catch(() => null)
    if (after && isSaved(after.fields)) return after
    if (after?.item.rev === rev) throw new WorkItemNotSavedError()
    throw new Error(`The change to #${id} could not be confirmed. Reload the item and check it in Azure DevOps before trying again.`)
  }
  if (saved?.id !== id) throw new Error(`Azure DevOps returned an unexpected result for #${id}. Reload the item and check it before trying again.`)
  return { item: saved, fields: readWorkItemFields(saved) }
}
