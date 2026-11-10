import type { TeamProfile } from '../appSettings'
import { hasTriageRules, type TriageQueryOptions } from '../features/standup/utils/triageOptions'
import { mapWithConcurrency } from './concurrency'
import type { AdoRequestClient } from './httpClient'
import { parseAssignedTo } from './identity'
import type { TriageItem, TriageResult } from './types'
import { buildAdoQueryUrl, buildTriageQueryWiql, buildTriageWiql } from './wiql'
import { fetchWorkItemIconMap } from './workItemIconsApi'
import { getInitialState, type ProjectWorkItemTypeInfo } from './workItemTypesApi'
import { chunkArray, EFFORT_FIELD_NAMES, fetchWorkItemIdsByWiql, getIconIdForWorkItemType, parseEffort, resolveEffort, resolveTags, WORK_ITEM_BATCH_LIMIT } from './workItemsApi'

type ApiItem = {
  id?: number
  fields?: Record<string, unknown>
}
type Team = Pick<TeamProfile, 'orgName' | 'projectName' | 'areaPath'>

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

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
      'System.CreatedBy', 'System.IterationPath', 'System.Tags', 'System.Parent', 'Microsoft.VSTS.Common.Severity',
      'Microsoft.VSTS.Common.Priority', ...EFFORT_FIELD_NAMES,
    ])),
    fetchWorkItemIconMap(client, team.orgName),
  ])
  const itemUrl = (id: number) => `https://dev.azure.com/${encodeURIComponent(team.orgName)}/${encodeURIComponent(team.projectName)}/_workitems/edit/${id}`
  const items: TriageItem[] = []
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
      reasons: [],
      workItemUrl: itemUrl(raw.id),
    }
    item.reasons = getTriageReasons(item, options, metadata)
    if (!item.reasons.length) continue
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
  const createdTime = (item: TriageItem) => {
    const time = Date.parse(item.createdAt ?? '')
    return Number.isFinite(time) ? time : Infinity
  }
  items.sort((a, b) => (createdTime(a) - createdTime(b)) || a.id - b.id)
  return { items, warnings: [...new Set(warnings)], queryUrl }
}
