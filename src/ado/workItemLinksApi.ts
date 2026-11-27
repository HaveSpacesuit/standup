import type { TeamProfile } from '../appSettings'
import { AdoWriteError, type AdoRequestClient } from './httpClient'
import { chunkArray, WORK_ITEM_BATCH_LIMIT, type WorkItemApiItem } from './workItemsApi'
import type { ProjectWorkItemState } from './workItemTypesApi'
import { isWorkItemWriteAccessError, readWorkItem, readWorkItemFields, WorkItemNotSavedError, type WorkItemReadResult } from './workItemUpdateApi'

type Team = Pick<TeamProfile, 'orgName' | 'projectName'>

/** One end of a work item link type: what the linked item is to this one, such as its Parent. */
export type WorkItemLinkType = {
  /** The reference name Azure DevOps stores, such as System.LinkTypes.Hierarchy-Reverse. */
  rel: string
  name: string
}

export const PARENT_LINK = 'System.LinkTypes.Hierarchy-Reverse'
export const CHILD_LINK = 'System.LinkTypes.Hierarchy-Forward'
export const DUPLICATE_OF_LINK = 'System.LinkTypes.Duplicate-Reverse'

/** The link types offered first, as Azure DevOps names them. */
export const COMMON_LINK_TYPES: readonly WorkItemLinkType[] = [
  { rel: PARENT_LINK, name: 'Parent' },
  { rel: CHILD_LINK, name: 'Child' },
  { rel: 'System.LinkTypes.Related', name: 'Related' },
  { rel: DUPLICATE_OF_LINK, name: 'Duplicate Of' },
  { rel: 'System.LinkTypes.Duplicate-Forward', name: 'Duplicate' },
  { rel: 'System.LinkTypes.Dependency-Reverse', name: 'Predecessor' },
  { rel: 'System.LinkTypes.Dependency-Forward', name: 'Successor' },
]

// An item can have only one parent, and be a duplicate of only one item; adding another replaces it.
const SINGLE_TARGET_LINKS = new Set([PARENT_LINK, DUPLICATE_OF_LINK].map((rel) => rel.toLowerCase()))

export const sameLinkType = (left: string, right: string) => left.toLowerCase() === right.toLowerCase()
export const isSingleTargetLink = (rel: string) => SINGLE_TARGET_LINKS.has(rel.toLowerCase())

/** A link from the item to another work item in the same organization. */
export type WorkItemLinkSpec = {
  rel: string
  targetId: number
  /** The link's comment, shown beside it in Azure DevOps. */
  comment?: string
}

export type WorkItemLinkChange = {
  add?: WorkItemLinkSpec[]
  remove?: WorkItemLinkSpec[]
}

/** The item after a link save, with what actually changed: links it already had are not added again. */
export type WorkItemLinkResult = WorkItemReadResult & {
  added: WorkItemLinkSpec[]
  /** The links removed, including a parent or duplicate the new one replaced, with their comments, so they can be restored. */
  removed: WorkItemLinkSpec[]
}

/** A work item that can be linked to, with what the picker shows of it. */
export type WorkItemLinkTarget = {
  id: number
  title?: string
  workItemType?: string
  state?: string
  /** Its parent, to warn before making it a child of another item. */
  parentId?: number
}

type ApiRelationType = { referenceName?: unknown; name?: unknown; attributes?: unknown }
type ApiFields = Record<string, unknown>

const WORK_ITEM_API_PATH = /\/_apis\/wit\/workitems\/(\d+)$/i
const WORK_ITEM_PAGE_PATH = /\/_workitems\/edit\/(\d+)(?:\/|$)/i
const SEARCH_LIMIT = 20
const CANDIDATE_LIMIT = 50
const SEARCH_WORD_LIMIT = 5

const quoteWiql = (value: string) => `'${value.replace(/'/g, "''")}'`

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const isWorkItemId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0

function parseId(value: unknown): number | undefined {
  const id = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  return isWorkItemId(id) ? id : undefined
}

/** The item's parent, from System.Parent, which Azure DevOps keeps in step with its Parent link. */
export function readParentId(item: WorkItemApiItem): number | undefined {
  return parseId((item.fields as ApiFields | undefined)?.['System.Parent'])
}

/** The ID of the work item a relation's URL points at, or undefined for any other relation, such as a hyperlink. */
export function getLinkTargetId(url: unknown): number | undefined {
  if (typeof url !== 'string') return undefined
  try {
    const match = WORK_ITEM_API_PATH.exec(new URL(url).pathname)
    return match ? parseId(match[1]) : undefined
  } catch {
    return undefined
  }
}

/** The URL Azure DevOps stores for a link to a work item in the organization. */
export function workItemApiUrl(orgName: string, id: number): string {
  return `https://dev.azure.com/${encodeURIComponent(orgName)}/_apis/wit/workItems/${id}`
}

/**
 * The work item a typed reference names: an ID such as 123 or #123, or a work item's address in the organization,
 * copied from its page, a board or the API. Undefined for anything else, which is searched for by title.
 *
 * @throws When the address is a work item in another organization, which can't be linked here.
 */
export function parseWorkItemReference(query: string, orgName: string): number | undefined {
  const trimmed = query.trim()
  const id = /^#?(\d+)$/.exec(trimmed)
  if (id) return parseId(id[1])
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return undefined
  }
  const org = orgName.trim().toLowerCase()
  const host = url.hostname.toLowerCase()
  let urlOrg: string | null = null
  try {
    if (host === 'dev.azure.com') urlOrg = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] ?? '').toLowerCase()
    else if (host.endsWith('.visualstudio.com')) urlOrg = host.split('.')[0]
  } catch {
    return undefined
  }
  if (!urlOrg) return undefined
  const found = parseId(WORK_ITEM_PAGE_PATH.exec(url.pathname)?.[1] ?? WORK_ITEM_API_PATH.exec(url.pathname)?.[1] ?? url.searchParams.get('workitem'))
  if (found === undefined) return undefined
  if (urlOrg !== org) throw new Error(`Work item ${found} is in the ${urlOrg} organization. Only items in ${orgName} can be linked here.`)
  return found
}

/**
 * The organization's other link types between work items, by name, for links beyond the common ones. Each direction
 * of a link type is its own entry, such as Tested By and Tests.
 */
export async function fetchWorkItemLinkTypes(client: AdoRequestClient, orgName: string): Promise<WorkItemLinkType[]> {
  const response = await client.request<{ value?: ApiRelationType[] }>({ orgName, path: '/_apis/wit/workitemrelationtypes' })
  const known = new Set(COMMON_LINK_TYPES.map((type) => type.rel.toLowerCase()))
  const types = new Map<string, WorkItemLinkType>()
  for (const type of response?.value ?? []) {
    const rel = text(type?.referenceName)
    const name = text(type?.name)
    const attributes = record(type?.attributes)
    if (!rel || !name || known.has(rel.toLowerCase()) || attributes.usage !== 'workItemLink') continue
    if (attributes.enabled === false || attributes.editable === false || attributes.remote === true) continue
    types.set(rel.toLowerCase(), { rel, name })
  }
  return [...types.values()].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
}

/** Each work item's title, type, state and parent, in the order asked for; items that can't be read are left out. */
export async function fetchWorkItemLinkTargets(client: AdoRequestClient, orgName: string, ids: readonly number[]): Promise<WorkItemLinkTarget[]> {
  const unique = [...new Set(ids.filter(isWorkItemId))]
  if (!unique.length) return []
  const found = new Map<number, WorkItemLinkTarget>()
  for (const chunk of chunkArray(unique, WORK_ITEM_BATCH_LIMIT)) {
    const response = await client.request<{ value?: Array<{ id?: unknown; fields?: unknown } | null> }>({
      method: 'POST',
      orgName,
      path: '/_apis/wit/workitemsbatch',
      body: { ids: chunk, fields: ['System.Title', 'System.WorkItemType', 'System.State', 'System.Parent'], errorPolicy: 'Omit' },
    })
    for (const item of response?.value ?? []) {
      if (!isWorkItemId(item?.id)) continue
      const fields = record(item.fields)
      found.set(item.id, {
        id: item.id,
        title: text(fields['System.Title']),
        workItemType: text(fields['System.WorkItemType']),
        state: text(fields['System.State']),
        parentId: parseId(fields['System.Parent']),
      })
    }
  }
  return unique.flatMap((id) => found.get(id) ?? [])
}

async function queryIds(client: AdoRequestClient, team: Team, query: string, top: number): Promise<number[]> {
  const response = await client.request<{ workItems?: Array<{ id?: unknown }> }>({
    method: 'POST',
    orgName: team.orgName,
    path: `/${encodeURIComponent(team.projectName)}/_apis/wit/wiql`,
    params: { '$top': top },
    body: { query },
  })
  return (response?.workItems ?? []).flatMap((item) => isWorkItemId(item?.id) ? [item.id] : [])
}

/**
 * Work items the query names: the item an ID or address points at, wherever it is in the organization, or else the
 * project's items with every typed word in their titles, most recently changed first.
 */
export async function searchWorkItems(
  client: AdoRequestClient,
  team: Team,
  query: string,
  options: { excludeId?: number } = {},
): Promise<WorkItemLinkTarget[]> {
  const reference = parseWorkItemReference(query, team.orgName)
  if (reference !== undefined) return fetchWorkItemLinkTargets(client, team.orgName, [reference])
  const words = [...new Set(query.trim().split(/\s+/).filter(Boolean))].slice(0, SEARCH_WORD_LIMIT)
  if (!words.length) return []
  const ids = await queryIds(client, team, [
    'SELECT [System.Id] FROM WorkItems',
    `WHERE [System.TeamProject] = ${quoteWiql(team.projectName)}`,
    ...words.map((word) => `  AND [System.Title] CONTAINS ${quoteWiql(word)}`),
    ...(options.excludeId ? [`  AND [System.Id] <> ${options.excludeId}`] : []),
    'ORDER BY [System.ChangedDate] DESC',
  ].join('\n'), SEARCH_LIMIT)
  return fetchWorkItemLinkTargets(client, team.orgName, ids)
}

/** The backlog level a parent of the type comes from, as a work item category, or null when it has none above it. */
export function getParentCategory(workItemType: string | undefined): { category: string; label: string } | null {
  switch (workItemType?.trim().toLowerCase()) {
    case 'epic':
      return null
    case 'feature':
      return { category: 'Microsoft.EpicCategory', label: 'Open epics' }
    case 'task':
      return { category: 'Microsoft.RequirementCategory', label: 'Open backlog items' }
    default:
      return { category: 'Microsoft.FeatureCategory', label: 'Open features' }
  }
}

const isTerminal = (state: ProjectWorkItemState) => ['completed', 'removed'].includes(state.category.trim().toLowerCase())

/**
 * The open items under the team's area path in a work item category, such as its Features, most recently changed
 * first: the likely parents for the team's new items. Completed and Removed states are left out for each type the
 * project knows.
 */
export async function fetchParentCandidates(
  client: AdoRequestClient,
  team: Team & Pick<TeamProfile, 'areaPath'>,
  category: string,
  statesByType: Readonly<Record<string, ProjectWorkItemState[]>>,
): Promise<WorkItemLinkTarget[]> {
  const open = Object.entries(statesByType).flatMap(([type, states]) => {
    const terminal = states.filter(isTerminal).map((state) => quoteWiql(state.name))
    return terminal.length ? [`([System.WorkItemType] = ${quoteWiql(type)} AND [System.State] NOT IN (${terminal.join(', ')}))`] : []
  })
  const terminalTypes = Object.keys(statesByType).filter((type) => statesByType[type].some(isTerminal))
  const clauses = [
    `WHERE [System.TeamProject] = ${quoteWiql(team.projectName)}`,
    ...(team.areaPath.trim() ? [`  AND [System.AreaPath] UNDER ${quoteWiql(team.areaPath.trim())}`] : []),
    `  AND [System.WorkItemType] IN GROUP ${quoteWiql(category)}`,
  ]
  if (open.length) {
    // A type without Completed or Removed states has nothing to leave out.
    const others = `[System.WorkItemType] NOT IN (${terminalTypes.map(quoteWiql).join(', ')})`
    clauses.push(`  AND (${[...open, others].join(' OR ')})`)
  }
  const ids = await queryIds(client, team, ['SELECT [System.Id] FROM WorkItems', ...clauses, 'ORDER BY [System.ChangedDate] DESC'].join('\n'), CANDIDATE_LIMIT)
  return fetchWorkItemLinkTargets(client, team.orgName, ids)
}

type ExistingLink = WorkItemLinkSpec & { index: number }

function readLinks(item: WorkItemApiItem): ExistingLink[] {
  return (item.relations ?? []).flatMap((relation, index) => {
    const targetId = getLinkTargetId(relation?.url)
    const rel = text(relation?.rel)
    if (targetId === undefined || !rel) return []
    const comment = text(record(relation.attributes).comment)
    return [{ index, rel, targetId, ...(comment ? { comment } : {}) }]
  })
}

const sameLink = (left: Pick<WorkItemLinkSpec, 'rel' | 'targetId'>, right: Pick<WorkItemLinkSpec, 'rel' | 'targetId'>) =>
  left.targetId === right.targetId && sameLinkType(left.rel, right.rel)

const toSpec = ({ rel, targetId, comment }: WorkItemLinkSpec): WorkItemLinkSpec => ({ rel, targetId, ...(comment ? { comment } : {}) })

/** One of the item's links, with what the picker shows of the linked item when it could be read. */
export type WorkItemCurrentLink = WorkItemLinkSpec & { target?: WorkItemLinkTarget }

/** The item's links to other work items, read fresh, with each linked item's title, type and state. */
export async function fetchWorkItemLinks(client: AdoRequestClient, team: Team, id: number): Promise<WorkItemCurrentLink[]> {
  const { item } = await readWorkItem(client, team, id, { relations: true })
  const links = readLinks(item).map(toSpec)
  const targets = await fetchWorkItemLinkTargets(client, team.orgName, links.map((link) => link.targetId)).catch(() => [])
  return links.map((link) => {
    const target = targets.find((candidate) => candidate.id === link.targetId)
    return target ? { ...link, target } : link
  })
}

function validateLinks(id: number, change: WorkItemLinkChange): void {
  for (const link of [...change.add ?? [], ...change.remove ?? []]) {
    if (!isWorkItemId(link.targetId)) throw new Error('Choose a work item to link to.')
    if (!link.rel.trim()) throw new Error('Choose how the items are linked.')
    if (link.targetId === id) throw new Error(`#${id} can’t be linked to itself.`)
  }
}

/** What the change does to the links the item has now: links already there aren't added, and missing ones aren't removed. */
function planLinkChange(existing: readonly ExistingLink[], change: WorkItemLinkChange) {
  const removing = new Map<number, ExistingLink>()
  for (const link of change.remove ?? []) {
    const found = existing.find((candidate) => !removing.has(candidate.index) && sameLink(candidate, link))
    if (found) removing.set(found.index, found)
  }
  const added: WorkItemLinkSpec[] = []
  for (const link of change.add ?? []) {
    const kept = existing.filter((candidate) => !removing.has(candidate.index))
    if (kept.some((candidate) => sameLink(candidate, link)) || added.some((other) => sameLink(other, link))) continue
    if (isSingleTargetLink(link.rel)) {
      if (added.some((other) => sameLinkType(other.rel, link.rel))) throw new Error('An item can have only one link of this type.')
      for (const replaced of kept.filter((candidate) => sameLinkType(candidate.rel, link.rel))) removing.set(replaced.index, replaced)
    }
    const comment = link.comment?.trim()
    added.push({ rel: link.rel, targetId: link.targetId, ...(comment ? { comment } : {}) })
  }
  return { removing: [...removing.values()], added }
}

function hasLinkChange(item: WorkItemApiItem, added: readonly WorkItemLinkSpec[], removed: readonly WorkItemLinkSpec[]): boolean {
  const links = readLinks(item)
  return added.every((link) => links.some((candidate) => sameLink(candidate, link)))
    && removed.every((link) => !links.some((candidate) => sameLink(candidate, link)))
}

/**
 * Adds and removes links between the item and other work items in one save: reads the item and its links fresh, then
 * patches only what changes, guarded by the revision just read. Adding a parent replaces the one it has. A failed write
 * is never retried; when its response is lost, the item is read again to learn whether it was saved.
 */
export async function updateWorkItemLinks(
  client: AdoRequestClient,
  team: Team,
  id: number,
  change: WorkItemLinkChange,
): Promise<WorkItemLinkResult> {
  validateLinks(id, change)
  const before = await readWorkItem(client, team, id, { relations: true })
  const rev = before.item.rev
  if (!Number.isInteger(rev) || rev! < 1) throw new Error(`Azure DevOps returned work item ${id} without a revision. Nothing was changed.`)
  const { removing, added } = planLinkChange(readLinks(before.item), change)
  const removed = removing.map(toSpec)
  if (!removing.length && !added.length) return { ...before, added, removed }

  const body = [
    { op: 'test', path: '/rev', value: rev },
    // Later indexes first, so each removal leaves the earlier ones where they were read.
    ...removing.map((link) => link.index).sort((left, right) => right - left).map((index) => ({ op: 'remove', path: `/relations/${index}` })),
    ...added.map((link) => ({
      op: 'add',
      path: '/relations/-',
      value: { rel: link.rel, url: workItemApiUrl(team.orgName, link.targetId), ...(link.comment ? { attributes: { comment: link.comment } } : {}) },
    })),
  ]
  let saved: WorkItemApiItem
  try {
    saved = await client.request<WorkItemApiItem>({
      method: 'PATCH',
      orgName: team.orgName,
      path: `/${encodeURIComponent(team.projectName)}/_apis/wit/workitems/${id}`,
      params: { '$expand': 'relations' },
      contentType: 'application/json-patch+json',
      body,
    })
  } catch (error) {
    if (isWorkItemWriteAccessError(error)) throw error
    if (error instanceof AdoWriteError) {
      if (error.status === 409 || error.status === 412) {
        throw new Error(`#${id} changed in Azure DevOps while saving. Nothing was saved; reload the item and try again.`)
      }
      if (error.status === 400) {
        throw new Error(`Azure DevOps refused the link on #${id} (HTTP 400). The linked item may not exist, the link may make a loop of parents, a child can have only one parent, and some link types don’t apply to these items. Nothing was changed.`)
      }
      throw error
    }
    // A failed transport can follow a committed write. Never retry it; re-read the item to learn whether it was saved.
    const after = await readWorkItem(client, team, id, { relations: true }).catch(() => null)
    if (after && hasLinkChange(after.item, added, removed)) return { ...after, added, removed }
    if (after?.item.rev === rev) throw new WorkItemNotSavedError()
    throw new Error(`The link change to #${id} could not be confirmed. Reload the item and check it in Azure DevOps before trying again.`)
  }
  if (saved?.id !== id) throw new Error(`Azure DevOps returned an unexpected result for #${id}. Reload the item and check it before trying again.`)
  return { item: saved, fields: readWorkItemFields(saved), added, removed }
}
