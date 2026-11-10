import type { TeamProfile } from '../appSettings'
import { hasTriageRules, type TriageQueryOptions } from '../features/standup/utils/triageOptions'
import { mapWithConcurrency } from './concurrency'
import type { AdoRequestClient } from './httpClient'
import { parseAssignedTo } from './identity'
import type { TriageEvent, TriageHistory, TriageItem, TriageResult, TriageTextField, WorkItemUpdate } from './types'
import { buildAdoQueryUrl, buildTriageQueryWiql, buildTriageWiql } from './wiql'
import { resolveUpdateTimestamp } from './workItemHistoryTimeline'
import { fetchWorkItemIconMap } from './workItemIconsApi'
import { getInitialState, type ProjectWorkItemTypeInfo } from './workItemTypesApi'
import { chunkArray, EFFORT_FIELD_NAMES, fetchWorkItemIdsByWiql, getIconIdForWorkItemType, parseEffort, resolveEffort, resolveTags, WORK_ITEM_BATCH_LIMIT } from './workItemsApi'

type ApiItem = {
  id?: number
  fields?: Record<string, unknown>
}
type ApiComment = { text?: unknown; createdBy?: unknown; createdDate?: unknown }
type Team = Pick<TeamProfile, 'orgName' | 'projectName' | 'areaPath'>

/** History takes a request or two per item, so a queue longer than this keeps creation dates instead. */
export const TRIAGE_HISTORY_LIMIT = 100
const UPDATES_PAGE_SIZE = 200
const MAX_UPDATE_PAGES = 10
const COMMENT_TEXT_LIMIT = 280

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

/** The rich-text fields readiness checks look at; only whether each has content is kept. */
const TEXT_FIELDS: Record<TriageTextField, string> = {
  reproSteps: 'Microsoft.VSTS.TCM.ReproSteps',
  acceptanceCriteria: 'Microsoft.VSTS.Common.AcceptanceCriteria',
  description: 'System.Description',
}

/** Whether an HTML field has anything in it: text, or an image such as a pasted screenshot. Empty markup does not count. */
export function hasRichTextContent(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (/<img\b/i.test(value)) return true
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').trim().length > 0
}

const NAMED_ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** A comment's HTML as one line of plain text, cut to `limit` characters, for a tooltip. */
export function toPlainText(html: string, limit = COMMENT_TEXT_LIMIT): string {
  const plain = html
    .replace(/<img\b[^>]*>/gi, ' (image) ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] !== '#') return NAMED_ENTITIES[code.toLowerCase()] ?? entity
      const point = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10)
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity
    })
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > limit ? `${plain.slice(0, limit - 1).trimEnd()}…` : plain
}

const tagList = (value: unknown) => typeof value === 'string'
  ? value.split(';').map((tag) => tag.trim().toLowerCase()).filter(Boolean)
  : []

/**
 * Replays the revisions, oldest first, for when each tag the item has now was last added and when it last changed state.
 * A tag removed and added again counts from the second time.
 */
export function summarizeTriageHistory(updates: readonly WorkItemUpdate[]): TriageHistory {
  const tagsAdded: Record<string, TriageEvent> = {}
  let stateSince: TriageEvent | undefined
  let tags = new Set<string>()
  for (const update of updates) {
    const at = resolveUpdateTimestamp(update)
    const event: TriageEvent | undefined = at ? { at, by: parseAssignedTo(update.revisedBy) } : undefined
    const fields = update.fields ?? {}
    if (Object.hasOwn(fields, 'System.Tags')) {
      const next = new Set(tagList(fields['System.Tags']?.newValue))
      for (const tag of next) {
        if (tags.has(tag)) continue
        if (event) tagsAdded[tag] = event
        else delete tagsAdded[tag]
      }
      for (const tag of tags) if (!next.has(tag)) delete tagsAdded[tag]
      tags = next
    }
    if (Object.hasOwn(fields, 'System.State')) stateSince = event
  }
  return { tagsAdded, stateSince }
}

async function fetchUpdates(client: AdoRequestClient, team: Team, id: number): Promise<WorkItemUpdate[]> {
  const updates: WorkItemUpdate[] = []
  for (let page = 0; page < MAX_UPDATE_PAGES; page++) {
    const response = await client.request<{ value?: WorkItemUpdate[] }>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/_apis/wit/workItems/${id}/updates`,
      params: { $top: UPDATES_PAGE_SIZE, $skip: page * UPDATES_PAGE_SIZE, 'api-version': '7.1' },
    })
    if (!Array.isArray(response?.value)) throw new Error('Azure DevOps returned an invalid work item history response.')
    updates.push(...response.value)
    if (response.value.length < UPDATES_PAGE_SIZE) break
  }
  return updates
}

async function fetchLatestComment(client: AdoRequestClient, team: Team, id: number): Promise<TriageItem['latestComment']> {
  const response = await client.request<{ comments?: ApiComment[] }>({
    method: 'GET',
    orgName: team.orgName,
    path: `/${encodeURIComponent(team.projectName)}/_apis/wit/workItems/${id}/comments`,
    params: { $top: 1, order: 'desc', 'api-version': '7.1-preview.4' },
  })
  const comment = response?.comments?.[0]
  const at = text(comment?.createdDate)
  if (!comment || !at) return undefined
  return { at, by: parseAssignedTo(comment.createdBy), text: toPlainText(typeof comment.text === 'string' ? comment.text : '') }
}

export function isUnderIteration(path: string, root: string): boolean {
  const normalizedPath = path.toLowerCase().replace(/\\+$/, '')
  const normalizedRoot = root.toLowerCase().replace(/\\+$/, '')
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}\\`)
}

export function getTriageReasons(
  item: Pick<TriageItem, 'tags' | 'workItemType' | 'state' | 'iterationPath'>,
  options: TriageQueryOptions,
  metadata: ProjectWorkItemTypeInfo,
): string[] {
  const states = metadata.statesByType[item.workItemType.toLowerCase()]
  const state = states?.find((entry) => entry.name.toLowerCase() === item.state.toLowerCase())
  if (!state?.category) throw new Error(`State metadata is unavailable for ${item.workItemType}: ${item.state}. Refresh to retry.`)
  if (['completed', 'removed'].includes(state.category.trim().toLowerCase())) return []
  const tags = new Set(item.tags.map((tag) => tag.toLowerCase()))
  const reasons = options.tags.filter((tag) => tags.has(tag.toLowerCase())).map((tag) => `Tag: ${tag}`)
  // A matching tag asks for triage in any unfinished state, but the new-bug rule takes only bugs nobody has moved on
  // from the state they were filed in, so approved and committed bugs drop out of the queue.
  if (options.includeNewBugs && item.workItemType.toLowerCase() === 'bug' && state === getInitialState(metadata, 'Bug')
    && !options.excludedIterationPaths.some((path) => isUnderIteration(item.iterationPath ?? '', path))) {
    reasons.push('New bug')
  }
  return reasons
}

export async function fetchTriageItems(
  client: AdoRequestClient,
  team: Team,
  options: TriageQueryOptions,
  metadata: ProjectWorkItemTypeInfo,
): Promise<TriageResult> {
  if (!hasTriageRules(options)) return { items: [], warnings: [] }
  const ids = [...new Set(await fetchWorkItemIdsByWiql(client, team, buildTriageWiql(team.projectName, team.areaPath, options, metadata)))]
  const queryUrl = buildAdoQueryUrl(team.orgName, team.projectName, buildTriageQueryWiql(team.projectName, team.areaPath, options, metadata))
  if (!ids.length) return { items: [], warnings: [], queryUrl }
  // workitemsbatch rejects `$expand` alongside `fields`, so the immediate parent comes from System.Parent.
  const batch = (batchIds: number[], fields: string[], omit = false) =>
    client.request<{ value?: ApiItem[] }>({
      method: 'POST',
      orgName: team.orgName,
      path: '/_apis/wit/workitemsbatch',
      params: { 'api-version': '7.1' },
      body: { ids: batchIds, fields, errorPolicy: omit ? 'Omit' : 'Fail' },
    })
  const [responses, icons] = await Promise.all([
    mapWithConcurrency(chunkArray(ids, WORK_ITEM_BATCH_LIMIT), 4, (chunk) => batch(chunk, [
      'System.Title', 'System.WorkItemType', 'System.State', 'System.CreatedDate', 'System.AssignedTo',
      'System.CreatedBy', 'System.IterationPath', 'System.Tags', 'System.Parent', 'System.CommentCount', 'Microsoft.VSTS.Common.Severity',
      'Microsoft.VSTS.Common.Priority', ...EFFORT_FIELD_NAMES, ...Object.values(TEXT_FIELDS),
    ])),
    fetchWorkItemIconMap(client, team.orgName),
  ])
  const itemUrl = (id: number) => `https://dev.azure.com/${encodeURIComponent(team.orgName)}/${encodeURIComponent(team.projectName)}/_workitems/edit/${id}`
  const items: TriageItem[] = []
  const commented = new Set<number>()
  const loaded = responses.flatMap((response) => response.value ?? [])
  if (new Set(loaded.map((item) => item.id)).size !== ids.length) {
    throw new Error('Some Triage work items could not be loaded. Refresh to retry.')
  }
  for (const raw of loaded) {
    if (typeof raw.id !== 'number') throw new Error('A Triage work item is missing its ID.')
    const fields = raw.fields ?? {}
    const item: TriageItem = {
      id: raw.id,
      title: text(fields['System.Title']) ?? `Work item ${raw.id}`,
      workItemType: text(fields['System.WorkItemType']) ?? '',
      state: text(fields['System.State']) ?? '',
      createdAt: text(fields['System.CreatedDate']),
      createdBy: parseAssignedTo(fields['System.CreatedBy']),
      assignedTo: parseAssignedTo(fields['System.AssignedTo']),
      severity: text(fields['Microsoft.VSTS.Common.Severity']),
      priority: parseEffort(fields['Microsoft.VSTS.Common.Priority']),
      effort: resolveEffort(fields),
      iterationPath: text(fields['System.IterationPath']),
      tags: resolveTags(fields).sort((a, b) => a.localeCompare(b)),
      filledText: Object.fromEntries(Object.entries(TEXT_FIELDS).map(([key, field]) => [key, hasRichTextContent(fields[field])])),
      reasons: [],
      workItemUrl: itemUrl(raw.id),
    }
    item.reasons = getTriageReasons(item, options, metadata)
    if (!item.reasons.length) continue
    item.inInitialState = getInitialState(metadata, item.workItemType)?.name.toLowerCase() === item.state.toLowerCase()
    if (Number(fields['System.CommentCount']) > 0) commented.add(raw.id)
    item.workItemIconUrl = icons[getIconIdForWorkItemType(item.workItemType)]
    const parentField = fields['System.Parent']
    if (parentField !== undefined && parentField !== null) {
      const parentId = typeof parentField === 'number' || typeof parentField === 'string' ? Number(parentField) : NaN
      if (!Number.isSafeInteger(parentId) || parentId <= 0) throw new Error(`Invalid parent for work item ${raw.id}.`)
      item.parent = { id: parentId, workItemUrl: itemUrl(parentId), unavailable: true }
    }
    items.push(item)
  }
  const warnings: string[] = []
  const parentIds = [...new Set(items.flatMap((item) => item.parent ? [item.parent.id] : []))]
  const parents = new Map<number, string>()
  await mapWithConcurrency(chunkArray(parentIds, WORK_ITEM_BATCH_LIMIT), 4, async (chunk) => {
    try {
      const response = await batch(chunk, ['System.Title'], true)
      for (const parent of response.value ?? []) {
        const title = text(parent.fields?.['System.Title'])
        if (typeof parent.id === 'number' && title) parents.set(parent.id, title)
      }
    } catch (cause) {
      warnings.push(`Unable to load parent details: ${cause instanceof Error ? cause.message : String(cause)}`)
    }
  })
  for (const item of items) {
    if (!item.parent) continue
    item.parent.title = parents.get(item.parent.id)
    item.parent.unavailable = !item.parent.title
  }
  if (items.some((item) => item.parent?.unavailable)) {
    warnings.push('Some parent details are unavailable or inaccessible. Known parent IDs and links are retained.')
  }
  // History says when each item entered triage, which can be long after it was created; the newest comment shows replies.
  if (items.length > TRIAGE_HISTORY_LIMIT) {
    warnings.push(`History loads for up to ${TRIAGE_HISTORY_LIMIT} items, so ages count from when each item was created and replies are not shown.`)
  } else {
    let incomplete = false
    await mapWithConcurrency(items, 4, async (item) => {
      const [history, comment] = await Promise.allSettled([
        fetchUpdates(client, team, item.id).then(summarizeTriageHistory),
        commented.has(item.id) ? fetchLatestComment(client, team, item.id) : Promise.resolve(undefined),
      ])
      if (history.status === 'fulfilled') item.history = history.value
      if (comment.status === 'fulfilled') item.latestComment = comment.value
      incomplete ||= history.status === 'rejected' || comment.status === 'rejected'
    })
    if (incomplete) warnings.push('Some item history could not be loaded, so those ages count from when the item was created and replies may be missing.')
  }
  const createdTime = (item: TriageItem) => {
    const time = Date.parse(item.createdAt ?? '')
    return Number.isFinite(time) ? time : Infinity
  }
  items.sort((a, b) => (createdTime(a) - createdTime(b)) || a.id - b.id)
  return { items, warnings: [...new Set(warnings)], queryUrl }
}
