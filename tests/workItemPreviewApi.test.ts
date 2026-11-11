import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestClient, AdoRequestOptions } from '../src/ado/httpClient.ts'
import type { WorkItemPreview } from '../src/ado/types.ts'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { fetchWorkItemPreview, resolveAdoAttachmentRequest, PREVIEW_COMMENT_LIMIT } = await server.ssrLoadModule('/src/ado/workItemPreviewApi.ts')

const guid = '0f8fad5b-d9cb-469f-a165-70867728950e'
const team = { orgName: 'org', projectName: 'My Project' }

test('attachments in the team organization resolve to a token request', () => {
  assert.deepEqual(resolveAdoAttachmentRequest(`https://dev.azure.com/org/My%20Project/_apis/wit/attachments/${guid.toUpperCase()}?fileName=crash.png`, 'org'), {
    orgName: 'org',
    path: `/My%20Project/_apis/wit/attachments/${guid}`,
    params: { fileName: 'crash.png', 'api-version': '7.1' },
  })
  // Organization names match case-insensitively, and the project is optional.
  assert.equal(resolveAdoAttachmentRequest(`https://dev.azure.com/ORG/_apis/wit/attachments/${guid}`, 'org')?.path, `/_apis/wit/attachments/${guid}`)
  assert.equal(resolveAdoAttachmentRequest(`https://org.visualstudio.com/Proj/_apis/wit/attachments/${guid}`, 'org')?.path, `/Proj/_apis/wit/attachments/${guid}`)
})

test('every other URL is refused, so the token never leaves the team organization', () => {
  const refused = [
    `https://dev.azure.com/other/Proj/_apis/wit/attachments/${guid}`,
    `https://other.visualstudio.com/Proj/_apis/wit/attachments/${guid}`,
    `https://org.visualstudio.com.example.test/_apis/wit/attachments/${guid}`,
    `https://example.test/org/_apis/wit/attachments/${guid}`,
    `http://dev.azure.com/org/Proj/_apis/wit/attachments/${guid}`,
    `https://dev.azure.com:8443/org/Proj/_apis/wit/attachments/${guid}`,
    `https://user:secret@dev.azure.com/org/Proj/_apis/wit/attachments/${guid}`,
    'https://dev.azure.com/org/Proj/_apis/wit/attachments/not-a-guid',
    `https://dev.azure.com/org/Proj/_apis/wit/attachments/${guid}/extra`,
    `https://dev.azure.com/org/Proj/_apis/wit/workitems/${guid}`,
    `https://dev.azure.com/org/a/b/_apis/wit/attachments/${guid}`,
    `https://dev.azure.com/org/%E0%A4%A/_apis/wit/attachments/${guid}`,
    'data:image/png;base64,AAAA',
    'not a url',
  ]
  for (const src of refused) assert.equal(resolveAdoAttachmentRequest(src, 'org'), null, src)
  assert.equal(resolveAdoAttachmentRequest(`https://dev.azure.com/org/_apis/wit/attachments/${guid}`, '  '), null)
})

type Handlers = { item?: () => unknown; comments?: () => unknown; batch?: (body: unknown) => unknown }

function fakeClient(handlers: Handlers): AdoRequestClient & { calls: AdoRequestOptions[] } {
  const calls: AdoRequestOptions[] = []
  return {
    calls,
    async request<T>(options: AdoRequestOptions) {
      calls.push(options)
      if (options.path.endsWith('/comments')) return (handlers.comments?.() ?? { comments: [] }) as T
      if (options.path === '/_apis/wit/workitemsbatch') return handlers.batch?.(options.body) as T
      return handlers.item?.() as T
    },
    async requestPage() {
      throw new Error('Not used by the preview.')
    },
  }
}

const workItem = {
  id: 42,
  fields: {
    'Microsoft.VSTS.TCM.ReproSteps': '<div>1. Open <b>a file</b></div>',
    'Microsoft.VSTS.TCM.SystemInfo': '<div>&nbsp;<br></div>',
    'System.Description': '<img src="https://dev.azure.com/org/_apis/wit/attachments/x">',
    'System.CommentCount': 9,
  },
  relations: [
    { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/org/_apis/wit/workItems/7', attributes: { name: 'Related' } },
    { rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/org/_apis/wit/workItems/5', attributes: { name: 'Parent' } },
    { rel: 'System.LinkTypes.Duplicate-Forward', url: 'https://dev.azure.com/org/_apis/wit/workItems/8', attributes: {} },
    { rel: 'AttachedFile', url: `https://dev.azure.com/org/abc/_apis/wit/attachments/${guid}`, attributes: { name: 'crash log.txt', resourceSize: 2048, resourceCreatedDate: '2026-02-01T00:00:00Z' } },
    { rel: 'AttachedFile', url: `http://dev.azure.com/org/abc/_apis/wit/attachments/${guid}`, attributes: { name: 'insecure.txt' } },
    { rel: 'Hyperlink', url: 'https://example.test/case/1', attributes: { comment: 'Support case' } },
    { rel: 'Hyperlink', url: 'javascript:alert(1)', attributes: {} },
    { rel: 'ArtifactLink', url: 'vstfs:///Git/PullRequestId/1', attributes: { name: 'Pull Request' } },
    { rel: 'ArtifactLink', url: 'vstfs:///Build/Build/2', attributes: { name: 'Build' } },
  ],
}
const comments = {
  totalCount: 12,
  comments: [
    { id: 3, text: '<p>Still happens</p>', createdBy: { displayName: 'Quinn Tester' }, createdDate: '2026-02-03T00:00:00Z', modifiedDate: '2026-02-04T00:00:00Z' },
    { id: 2, text: '<p>Removed</p>', createdBy: { displayName: 'Someone' }, createdDate: '2026-02-02T00:00:00Z', isDeleted: true },
    { id: 1, text: '<p>Seen on save</p>', createdBy: { displayName: 'Blair Nguyen' }, createdDate: '2026-02-01T00:00:00Z', modifiedDate: '2026-02-01T00:00:00Z' },
  ],
}
const titles = (body: unknown) => ({
  value: (body as { ids: number[] }).ids.filter((id) => id !== 8).map((id) => ({
    id, fields: { 'System.Title': `Item ${id}`, 'System.WorkItemType': 'Bug', 'System.State': 'Active' },
  })),
})

test('the preview reads the text, attachments, links and newest comments', async () => {
  const client = fakeClient({ item: () => workItem, comments: () => comments, batch: titles })
  const preview: WorkItemPreview = await fetchWorkItemPreview(client, team, 42)

  const [item, commentsRequest, batch] = client.calls
  assert.deepEqual(item, { method: 'GET', orgName: 'org', path: '/My%20Project/_apis/wit/workitems/42', params: { $expand: 'relations', 'api-version': '7.1' } })
  assert.equal(commentsRequest.path, '/My%20Project/_apis/wit/workItems/42/comments')
  assert.deepEqual(commentsRequest.params, { $top: PREVIEW_COMMENT_LIMIT, order: 'desc', 'api-version': '7.1-preview.4' })
  assert.deepEqual((batch.body as { ids: number[] }).ids, [5, 7, 8])

  // Empty fields are left out; a field holding only an image still counts.
  assert.deepEqual(Object.keys(preview.text).sort(), ['description', 'reproSteps'])
  assert.deepEqual(preview.attachments, [{
    name: 'crash log.txt',
    url: `https://dev.azure.com/org/abc/_apis/wit/attachments/${guid}?fileName=crash+log.txt`,
    size: 2048,
    addedAt: '2026-02-01T00:00:00Z',
  }])
  // Parents first, then the known link types, then the rest; a link without a name is labelled by its type.
  assert.deepEqual(preview.links.map((link) => [link.label, link.id, link.title ?? null, link.state ?? null]), [
    ['Parent', 5, 'Item 5', 'Active'],
    ['Related', 7, 'Item 7', 'Active'],
    ['Forward', 8, null, null],
  ])
  assert.equal(preview.links[0].workItemUrl, 'https://dev.azure.com/org/My%20Project/_workitems/edit/5')
  assert.deepEqual(preview.hyperlinks, [{ url: 'https://example.test/case/1', label: 'Support case' }])
  assert.equal(preview.developmentLinks, 2)

  assert.deepEqual(preview.comments.map((comment) => [comment.id, comment.by?.displayName, comment.edited]), [
    [3, 'Quinn Tester', true],
    [1, 'Blair Nguyen', false],
  ])
  assert.equal(preview.commentCount, 12)
  assert.equal(preview.commentsError, undefined)
  assert.equal(preview.linkTitlesError, undefined)
})

test('failed comments and link titles are reported in their own sections, and the rest still shows', async () => {
  const client = fakeClient({
    item: () => workItem,
    comments: () => { throw new Error('Azure DevOps query failed (HTTP 500). Try refreshing.') },
    batch: () => { throw new Error('Azure DevOps query failed (HTTP 503). Try refreshing.') },
  })
  const preview: WorkItemPreview = await fetchWorkItemPreview(client, team, 42)

  assert.equal(preview.commentsError, 'Azure DevOps query failed (HTTP 500). Try refreshing.')
  assert.equal(preview.commentCount, 9, 'the work item still says how many comments there are')
  assert.deepEqual(preview.comments, [])
  assert.equal(preview.linkTitlesError, 'Azure DevOps query failed (HTTP 503). Try refreshing.')
  assert.deepEqual(preview.links.map((link) => link.id), [5, 7, 8])
  assert.equal(preview.links[0].title, undefined)
  assert.equal(preview.text.reproSteps, '<div>1. Open <b>a file</b></div>')
})

test('an item without links skips the titles request', async () => {
  const client = fakeClient({ item: () => ({ id: 42, fields: { 'System.Title': 'Bare' } }) })
  const preview: WorkItemPreview = await fetchWorkItemPreview(client, team, 42)
  assert.equal(client.calls.some((call) => call.path === '/_apis/wit/workitemsbatch'), false)
  assert.deepEqual([preview.links, preview.attachments, preview.hyperlinks, preview.developmentLinks, preview.commentCount], [[], [], [], 0, 0])
})

test('the preview fails when the work item itself cannot be read', async () => {
  await assert.rejects(fetchWorkItemPreview(fakeClient({ item: () => { throw new Error('Gone') } }), team, 42), { message: 'Gone' })
  await assert.rejects(fetchWorkItemPreview(fakeClient({ item: () => ({ id: 42 }) }), team, 42), {
    message: 'Azure DevOps returned an invalid work item response.',
  })
})
