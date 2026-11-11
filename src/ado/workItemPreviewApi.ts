import type { TeamProfile } from '../appSettings'
import type { AdoRequestClient, AdoRequestOptions } from './httpClient'
import { parseAssignedTo } from './identity'
import { hasRichTextContent } from './triageApi'
import type { WorkItemPreview, WorkItemPreviewAttachment, WorkItemPreviewComment, WorkItemPreviewLink, WorkItemPreviewTextField } from './types'

type Team = Pick<TeamProfile, 'orgName' | 'projectName'>
type ApiRelation = { rel?: unknown; url?: unknown; attributes?: unknown }
type ApiWorkItem = { id?: unknown; fields?: Record<string, unknown>; relations?: unknown }
type ApiComment = { id?: unknown; text?: unknown; createdBy?: unknown; createdDate?: unknown; modifiedDate?: unknown; isDeleted?: unknown }

/** The newest comments the panel shows; the rest are a link away. */
export const PREVIEW_COMMENT_LIMIT = 5
/** The linked work items the panel names; it counts the rest. */
export const PREVIEW_LINK_LIMIT = 50

const PREVIEW_TEXT_FIELDS: Record<WorkItemPreviewTextField, string> = {
  reproSteps: 'Microsoft.VSTS.TCM.ReproSteps',
  systemInfo: 'Microsoft.VSTS.TCM.SystemInfo',
  description: 'System.Description',
  acceptanceCriteria: 'Microsoft.VSTS.Common.AcceptanceCriteria',
}

// Links are listed in this order, then any other link type in Azure DevOps' order.
const LINK_ORDER = ['parent', 'child', 'duplicate of', 'duplicate', 'related', 'predecessor', 'successor', 'tested by', 'tests']
const WORK_ITEM_PATH = /\/_apis\/wit\/workitems\/(\d+)$/i
const ATTACHMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function decodeSegment(segment: string | undefined): string | null {
  if (!segment) return null
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

const describeError = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)

/**
 * The request for a file attached to a work item in the team's organization, such as a screenshot pasted into the
 * repro steps, or null for any other URL. Only these requests carry the personal access token, so an image or link from
 * anywhere else in the text never receives it.
 */
export function resolveAdoAttachmentRequest(src: string, orgName: string): Pick<AdoRequestOptions, 'orgName' | 'path' | 'params'> | null {
  const url = parseUrl(src)
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const org = orgName.trim().toLowerCase()
  if (!org) return null
  let segments = url.pathname.split('/').filter(Boolean)
  if (url.hostname === 'dev.azure.com') {
    if (decodeSegment(segments[0])?.toLowerCase() !== org) return null
    segments = segments.slice(1)
  } else if (url.hostname !== `${org}.visualstudio.com`) {
    return null
  }
  // [project]/_apis/wit/attachments/{id}
  const apis = segments.findIndex((segment) => segment.toLowerCase() === '_apis')
  if (apis < 0 || apis > 1) return null
  const [, wit, attachments, id, ...rest] = segments.slice(apis)
  if (wit?.toLowerCase() !== 'wit' || attachments?.toLowerCase() !== 'attachments' || !id || rest.length || !ATTACHMENT_ID.test(id)) {
    return null
  }
  const project = apis === 1 ? decodeSegment(segments[0]) : ''
  if (project === null) return null
  return {
    orgName,
    path: `${project ? `/${encodeURIComponent(project)}` : ''}/_apis/wit/attachments/${id.toLowerCase()}`,
    params: { fileName: url.searchParams.get('fileName') ?? undefined, 'api-version': '7.1' },
  }
}

const workItemUrl = (team: Team, id: number) =>
  `https://dev.azure.com/${encodeURIComponent(team.orgName)}/${encodeURIComponent(team.projectName)}/_workitems/edit/${id}`

function linkRank(link: WorkItemPreviewLink): number {
  const index = LINK_ORDER.indexOf(link.label.toLowerCase())
  return index < 0 ? LINK_ORDER.length : index
}

function parseRelations(relations: unknown, team: Team) {
  const attachments: WorkItemPreviewAttachment[] = []
  const links: WorkItemPreviewLink[] = []
  const hyperlinks: WorkItemPreview['hyperlinks'] = []
  let developmentLinks = 0
  for (const relation of Array.isArray(relations) ? relations as ApiRelation[] : []) {
    const rel = text(relation?.rel) ?? ''
    const url = parseUrl(text(relation?.url) ?? '')
    const attributes = record(relation?.attributes)
    if (rel === 'ArtifactLink') {
      developmentLinks++
      continue
    }
    if (!url) continue
    if (rel === 'AttachedFile') {
      if (url.protocol !== 'https:') continue
      const name = text(attributes.name) ?? 'Attachment'
      url.searchParams.set('fileName', name)
      const size = Number(attributes.resourceSize)
      attachments.push({
        name,
        url: url.href,
        size: Number.isFinite(size) && size >= 0 ? size : undefined,
        addedAt: text(attributes.resourceCreatedDate) ?? text(attributes.authorizedDate),
      })
    } else if (rel === 'Hyperlink') {
      if (url.protocol === 'https:' || url.protocol === 'http:') hyperlinks.push({ url: url.href, label: text(attributes.comment) ?? url.href })
    } else {
      const match = WORK_ITEM_PATH.exec(url.pathname)
      if (!match) continue
      const id = Number(match[1])
      links.push({ label: text(attributes.name) ?? rel.split(/[.-]/).at(-1) ?? 'Link', id, workItemUrl: workItemUrl(team, id) })
    }
  }
  // Stable, so links of one kind keep Azure DevOps' order.
  links.sort((a, b) => linkRank(a) - linkRank(b))
  return { attachments, links, hyperlinks, developmentLinks }
}

function parseComments(response: unknown): { comments: WorkItemPreviewComment[]; totalCount?: number } {
  const body = record(response)
  const comments = (Array.isArray(body.comments) ? body.comments as ApiComment[] : []).flatMap((comment): WorkItemPreviewComment[] => {
    const at = text(comment?.createdDate)
    const id = Number(comment?.id)
    if (!at || comment.isDeleted === true || !Number.isSafeInteger(id)) return []
    const modified = text(comment.modifiedDate)
    return [{
      id,
      at,
      by: parseAssignedTo(comment.createdBy),
      html: typeof comment.text === 'string' ? comment.text : '',
      edited: Boolean(modified && Date.parse(modified) > Date.parse(at)),
    }]
  })
  const totalCount = Number(body.totalCount)
  return { comments, totalCount: Number.isSafeInteger(totalCount) && totalCount >= 0 ? totalCount : undefined }
}

/**
 * Everything the preview panel shows beyond the page's own data: the rich-text fields, attachments, links, and newest
 * comments. The comments and the linked items' titles are extras, so when one fails the rest still shows, and that
 * section explains what is missing.
 */
export async function fetchWorkItemPreview(client: AdoRequestClient, team: Team, id: number): Promise<WorkItemPreview> {
  const project = encodeURIComponent(team.projectName)
  const [itemResult, commentsResult] = await Promise.allSettled([
    client.request<ApiWorkItem>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${project}/_apis/wit/workitems/${id}`,
      params: { $expand: 'relations', 'api-version': '7.1' },
    }),
    client.request<unknown>({
      method: 'GET',
      orgName: team.orgName,
      path: `/${project}/_apis/wit/workItems/${id}/comments`,
      params: { $top: PREVIEW_COMMENT_LIMIT, order: 'desc', 'api-version': '7.1-preview.4' },
    }),
  ])
  if (itemResult.status === 'rejected') throw itemResult.reason
  const item = itemResult.value
  if (!item?.fields || typeof item.fields !== 'object') throw new Error('Azure DevOps returned an invalid work item response.')

  const fields = item.fields
  const textFields: WorkItemPreview['text'] = {}
  for (const [key, field] of Object.entries(PREVIEW_TEXT_FIELDS) as Array<[WorkItemPreviewTextField, string]>) {
    const value = fields[field]
    if (typeof value === 'string' && hasRichTextContent(value)) textFields[key] = value
  }

  const { attachments, links, hyperlinks, developmentLinks } = parseRelations(item.relations, team)
  const named = links.slice(0, PREVIEW_LINK_LIMIT)
  const ids = [...new Set(named.map((link) => link.id))]
  let linkTitlesError: string | undefined
  if (ids.length) {
    try {
      const response = await client.request<{ value?: Array<ApiWorkItem | null> }>({
        method: 'POST',
        orgName: team.orgName,
        path: '/_apis/wit/workitemsbatch',
        params: { 'api-version': '7.1' },
        body: { ids, fields: ['System.Title', 'System.WorkItemType', 'System.State'], errorPolicy: 'Omit' },
      })
      const details = new Map<number, Record<string, unknown>>()
      for (const linked of response?.value ?? []) {
        if (typeof linked?.id === 'number') details.set(linked.id, record(linked.fields))
      }
      for (const link of named) {
        const linkedFields = details.get(link.id)
        if (!linkedFields) continue
        link.title = text(linkedFields['System.Title'])
        link.workItemType = text(linkedFields['System.WorkItemType'])
        link.state = text(linkedFields['System.State'])
      }
    } catch (cause) {
      linkTitlesError = describeError(cause)
    }
  }

  let comments: WorkItemPreviewComment[] = []
  let commentCount = Number(fields['System.CommentCount'])
  let commentsError: string | undefined
  if (commentsResult.status === 'fulfilled') {
    const parsed = parseComments(commentsResult.value)
    comments = parsed.comments
    commentCount = parsed.totalCount ?? commentCount
  } else {
    commentsError = describeError(commentsResult.reason)
  }

  return {
    id,
    text: textFields,
    attachments,
    comments,
    commentCount: Number.isSafeInteger(commentCount) && commentCount >= comments.length ? commentCount : comments.length,
    ...(commentsError === undefined ? {} : { commentsError }),
    links,
    hyperlinks,
    developmentLinks,
    ...(linkTitlesError === undefined ? {} : { linkTitlesError }),
  }
}
