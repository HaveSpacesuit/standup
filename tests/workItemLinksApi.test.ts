import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestOptions } from '../src/ado/httpClient.ts'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())

const {
  CHILD_LINK,
  DUPLICATE_OF_LINK,
  fetchWorkItemLinks,
  fetchWorkItemLinkTypes,
  PARENT_LINK,
  parseWorkItemReference,
  searchWorkItems,
  updateWorkItemLinks,
} = await server.ssrLoadModule('/src/ado/workItemLinksApi.ts')
const { AdoWriteError } = await server.ssrLoadModule('/src/ado/httpClient.ts')
const { WorkItemNotSavedError } = await server.ssrLoadModule('/src/ado/workItemUpdateApi.ts')
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')
const { describeLinkChange, getDuplicateCloseState, getQueueParentSuggestions } = await server.ssrLoadModule('/src/features/standup/utils/workItemLinkEditing.ts')

const team = { orgName: 'org', projectName: 'Project' }
const RELATED = 'System.LinkTypes.Related'
const linkUrl = (id: number) => `https://dev.azure.com/org/_apis/wit/workItems/${id}`
const relation = (rel: string, id: number, comment?: string) => ({ rel, url: linkUrl(id), attributes: { isLocked: false, ...(comment ? { comment } : {}) } })
const hyperlink = { rel: 'Hyperlink', url: 'https://example.com/spec', attributes: {} }
const apiItem = (rev: number | undefined, relations: unknown[] = [], fields: Record<string, unknown> = {}) => ({
  id: 7,
  rev,
  fields: { 'System.Title': 'Card', 'System.State': 'Active', 'System.WorkItemType': 'Bug', ...fields },
  relations,
})

/** A client that answers reads from `reads` in turn (repeating the last) and PATCHes with `patch`. */
function fakeClient(reads: unknown[], patch: (options: AdoRequestOptions) => unknown = () => { throw new Error('unexpected PATCH') }) {
  const calls: AdoRequestOptions[] = []
  let read = 0
  return {
    calls,
    patches: () => calls.filter((call) => call.method === 'PATCH'),
    async request(options: AdoRequestOptions) {
      calls.push(options)
      if (options.method === 'PATCH') return patch(options)
      return reads[Math.min(read++, reads.length - 1)]
    },
    async requestPage() { throw new Error('unexpected page request') },
  }
}

test('adding a parent replaces the one the item has, removing later links first, guarded by the revision just read', async () => {
  const before = apiItem(4, [relation(RELATED, 20), relation(PARENT_LINK, 455, 'Old home'), hyperlink, relation(RELATED, 21)], { 'System.Parent': 455 })
  const client = fakeClient([before], (options) => {
    assert.equal(options.contentType, 'application/json-patch+json')
    assert.equal(options.path, '/Project/_apis/wit/workitems/7')
    assert.deepEqual(options.params, { '$expand': 'relations' })
    return apiItem(5, [relation(RELATED, 20), hyperlink, relation(PARENT_LINK, 456, 'Checkout')], { 'System.Parent': 456 })
  })
  const result = await updateWorkItemLinks(client, team, 7, {
    add: [{ rel: PARENT_LINK, targetId: 456, comment: ' Checkout ' }],
    remove: [{ rel: RELATED, targetId: 21 }],
  })
  assert.deepEqual(client.calls[0].params, { '$expand': 'relations' }, 'the item is read with its links')
  assert.deepEqual(client.patches().map((call) => call.body), [[
    { op: 'test', path: '/rev', value: 4 },
    { op: 'remove', path: '/relations/3' },
    { op: 'remove', path: '/relations/1' },
    { op: 'add', path: '/relations/-', value: { rel: PARENT_LINK, url: linkUrl(456), attributes: { comment: 'Checkout' } } },
  ]])
  assert.deepEqual(result.added, [{ rel: PARENT_LINK, targetId: 456, comment: 'Checkout' }])
  assert.deepEqual(result.removed, [{ rel: RELATED, targetId: 21 }, { rel: PARENT_LINK, targetId: 455, comment: 'Old home' }], 'with comments, so Undo restores them')
  assert.equal(result.item.rev, 5)
})

test('links the item already has are not added again, nor missing ones removed, so nothing is saved', async () => {
  const client = fakeClient([apiItem(4, [relation(PARENT_LINK, 456)])])
  const result = await updateWorkItemLinks(client, team, 7, {
    add: [{ rel: 'system.linktypes.hierarchy-reverse', targetId: 456 }],
    remove: [{ rel: RELATED, targetId: 99 }],
  })
  assert.deepEqual([result.added, result.removed], [[], []])
  assert.equal(client.patches().length, 0)
})

test('a link change is checked before anything is written', async () => {
  const unread = fakeClient([])
  await assert.rejects(updateWorkItemLinks(unread, team, 7, { add: [{ rel: RELATED, targetId: 7 }] }), /#7 can’t be linked to itself/)
  await assert.rejects(updateWorkItemLinks(unread, team, 7, { add: [{ rel: ' ', targetId: 8 }] }), /Choose how the items are linked/)
  assert.equal(unread.calls.length, 0)
  await assert.rejects(
    updateWorkItemLinks(fakeClient([apiItem(4)]), team, 7, { add: [{ rel: PARENT_LINK, targetId: 1 }, { rel: PARENT_LINK, targetId: 2 }] }),
    /only one link of this type/,
  )
  await assert.rejects(updateWorkItemLinks(fakeClient([apiItem(undefined)]), team, 7, { add: [{ rel: RELATED, targetId: 8 }] }), /without a revision/)
})

test('a refused link save explains why, and access errors are left for the editor to lock editing', async () => {
  const refused = (status: number) => fakeClient([apiItem(4)], () => { throw new AdoWriteError(status) })
  const add = { add: [{ rel: PARENT_LINK, targetId: 456 }] }
  await assert.rejects(updateWorkItemLinks(refused(400), team, 7, add), /refused the link on #7 \(HTTP 400\)\. .*only one parent.*Nothing was changed\./)
  await assert.rejects(updateWorkItemLinks(refused(409), team, 7, add), /#7 changed in Azure DevOps while saving\. Nothing was saved/)
  await assert.rejects(updateWorkItemLinks(refused(412), team, 7, add), /#7 changed in Azure DevOps while saving/)
  await assert.rejects(updateWorkItemLinks(refused(403), team, 7, add), (error: { status?: number }) => error instanceof AdoWriteError && error.status === 403)
})

test('a lost response is never retried: the item is read again to learn whether the links were saved', async () => {
  const lost = () => { throw new TypeError('Failed to fetch') }
  const saved = fakeClient([apiItem(4), apiItem(5, [relation(RELATED, 20)])], lost)
  const result = await updateWorkItemLinks(saved, team, 7, { add: [{ rel: RELATED, targetId: 20 }] })
  assert.equal(result.item.rev, 5)
  assert.deepEqual(result.added, [{ rel: RELATED, targetId: 20 }])
  assert.equal(saved.patches().length, 1)

  const unsaved = fakeClient([apiItem(4)], lost)
  await assert.rejects(updateWorkItemLinks(unsaved, team, 7, { add: [{ rel: RELATED, targetId: 20 }] }), (error) => error instanceof WorkItemNotSavedError)
  const unknown = fakeClient([apiItem(4), apiItem(6)], lost)
  await assert.rejects(updateWorkItemLinks(unknown, team, 7, { add: [{ rel: RELATED, targetId: 20 }] }), /could not be confirmed/)
})

test('a typed ID or a work item address in the organization names the item; other text is searched for', () => {
  assert.equal(parseWorkItemReference(' 123 ', 'org'), 123)
  assert.equal(parseWorkItemReference('#123', 'org'), 123)
  assert.equal(parseWorkItemReference('https://dev.azure.com/Org/Project/_workitems/edit/456/', 'org'), 456)
  assert.equal(parseWorkItemReference('https://dev.azure.com/My%20Org/Project/_workitems/edit/456', 'My Org'), 456)
  assert.equal(parseWorkItemReference('https://org.visualstudio.com/Project/_workitems/edit/457', 'org'), 457)
  assert.equal(parseWorkItemReference(linkUrl(458), 'org'), 458)
  assert.equal(parseWorkItemReference('https://dev.azure.com/org/Project/_boards/board/t/Team/Stories?workitem=459', 'org'), 459)
  assert.equal(parseWorkItemReference('checkout crash', 'org'), undefined)
  assert.equal(parseWorkItemReference('0', 'org'), undefined)
  assert.equal(parseWorkItemReference('https://example.com/_workitems/edit/5', 'org'), undefined)
  assert.equal(parseWorkItemReference('https://dev.azure.com/org/Project/_boards', 'org'), undefined)
  assert.throws(() => parseWorkItemReference('https://dev.azure.com/other/Project/_workitems/edit/456', 'org'), /in the other organization\. Only items in org/)
})

test('the other link types are the organization’s editable work item links, by name, beyond the common ones', async () => {
  const calls: AdoRequestOptions[] = []
  const link = (referenceName: string, name: string, attributes: Record<string, unknown> = {}) => ({
    referenceName, name, attributes: { usage: 'workItemLink', enabled: true, editable: true, ...attributes },
  })
  const client = {
    async request(options: AdoRequestOptions) {
      calls.push(options)
      return { value: [
        link(PARENT_LINK, 'Parent'),
        link('Microsoft.VSTS.Common.TestedBy-Forward', 'Tested By'),
        link('Microsoft.VSTS.Common.Affects-Forward', 'affects'),
        link('ArtifactLink', 'Artifact Link', { usage: 'resourceLink' }),
        link('System.LinkTypes.Remote.Related', 'Remote Related', { remote: true }),
        link('Custom.Disabled', 'Disabled', { enabled: false }),
        link('Custom.Locked', 'Locked', { editable: false }),
        { referenceName: 'Custom.Unnamed', attributes: { usage: 'workItemLink' } },
      ] }
    },
  }
  assert.deepEqual(await fetchWorkItemLinkTypes(client, 'org'), [
    { rel: 'Microsoft.VSTS.Common.Affects-Forward', name: 'affects' },
    { rel: 'Microsoft.VSTS.Common.TestedBy-Forward', name: 'Tested By' },
  ])
  assert.equal(calls[0].path, '/_apis/wit/workitemrelationtypes')
})

test('an item’s links are its links to work items, each with what the picker shows of the linked item', async () => {
  const calls: AdoRequestOptions[] = []
  const client = {
    async request(options: AdoRequestOptions) {
      calls.push(options)
      if (options.path.endsWith('/workitemsbatch')) {
        return { value: [{ id: 456, fields: { 'System.Title': 'Checkout', 'System.WorkItemType': 'Feature', 'System.State': 'Active', 'System.Parent': 12 } }] }
      }
      return apiItem(4, [relation(PARENT_LINK, 456, 'Home'), hyperlink, { rel: 'ArtifactLink', url: 'vstfs:///Git/PullRequestId/1' }, relation(RELATED, 20)])
    },
  }
  assert.deepEqual(await fetchWorkItemLinks(client, team, 7), [
    { rel: PARENT_LINK, targetId: 456, comment: 'Home', target: { id: 456, title: 'Checkout', workItemType: 'Feature', state: 'Active', parentId: 12 } },
    { rel: RELATED, targetId: 20 },
  ])
  assert.deepEqual(calls[0].params, { '$expand': 'relations' })
  assert.deepEqual((calls[1].body as { ids: number[] }).ids, [456, 20])
})

test('search finds the item an ID names, or the project’s items with every typed word in their titles', async () => {
  const calls: AdoRequestOptions[] = []
  const client = {
    async request(options: AdoRequestOptions) {
      calls.push(options)
      if (options.path.endsWith('/wiql')) return { workItems: [{ id: 31 }, { id: 30 }] }
      const ids = (options.body as { ids: number[] }).ids
      return { value: [...ids].reverse().map((id) => ({ id, fields: { 'System.Title': `Item ${id}` } })) }
    },
  }
  assert.deepEqual((await searchWorkItems(client, team, '#456')).map((item: { id: number }) => item.id), [456])
  assert.equal(calls.some((call) => call.path.endsWith('/wiql')), false)

  calls.length = 0
  const found = await searchWorkItems(client, team, " O'Brien  crash crash ", { excludeId: 7 })
  assert.deepEqual(found.map((item: { id: number }) => item.id), [31, 30], 'most recently changed first')
  const query = (calls[0].body as { query: string }).query
  assert.match(query, /\[System.TeamProject\] = 'Project'/)
  assert.match(query, /AND \[System.Title\] CONTAINS 'O''Brien'\n {2}AND \[System.Title\] CONTAINS 'crash'\n {2}AND \[System.Id\] <> 7\nORDER BY \[System.ChangedDate\] DESC$/)
  assert.deepEqual(calls[0].params, { '$top': 20 })

  calls.length = 0
  assert.deepEqual(await searchWorkItems(client, team, '   '), [])
  assert.equal(calls.length, 0)
})

test('the engine shows a saved parent in every view, with its title, and a new child shows this item as its parent', async (t) => {
  let saved = apiItem(5, [relation(PARENT_LINK, 456), relation(CHILD_LINK, 8)], { 'System.Parent': 456 })
  const requests: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    requests.push(`${method} ${url.pathname}`)
    if (/\/workitems\/7$/i.test(url.pathname)) return Response.json(method === 'PATCH' ? saved : apiItem(4, [relation(PARENT_LINK, 455)]))
    if (/\/workitems\/8$/i.test(url.pathname)) return Response.json({ id: 8, rev: 2, fields: { 'System.Title': 'Child', 'System.Parent': 7 } })
    if (url.pathname.endsWith('/workitemsbatch')) return Response.json({ value: [{ id: 457, fields: { 'System.Title': 'Payments' } }] })
    throw new Error(`Unexpected request: ${method} ${url.pathname}`)
  })
  const engine = new AdoQueryEngine('fixture-token')
  const patches: unknown[] = []
  engine.subscribeWorkItemPatches((patch: { id: number; parent?: unknown }) => patches.push({ id: patch.id, parent: patch.parent }))

  const update = await engine.updateWorkItemLinks(team, 7, { add: [{ rel: PARENT_LINK, targetId: 456 }, { rel: CHILD_LINK, targetId: 8 }] }, {
    titles: { 456: 'Checkout' },
  })
  assert.deepEqual(update.removed, [{ rel: PARENT_LINK, targetId: 455 }])
  assert.deepEqual(patches, [{ id: 7, parent: { id: 456, title: 'Checkout' } }, { id: 8, parent: { id: 7, title: 'Card' } }])
  assert.equal(requests.some((request) => request.endsWith('/workitemsbatch')), false, 'a title the view knew needs no read')

  patches.length = 0
  saved = apiItem(6, [relation(PARENT_LINK, 457)], { 'System.Parent': 457 })
  await engine.updateWorkItemLinks(team, 7, { add: [{ rel: PARENT_LINK, targetId: 457 }] })
  assert.deepEqual(patches, [{ id: 7, parent: { id: 457, title: 'Payments' } }], 'an unknown title is read')

  patches.length = 0
  saved = apiItem(7, [])
  await engine.updateWorkItemLinks(team, 7, { remove: [{ rel: PARENT_LINK, targetId: 455 }] })
  assert.deepEqual(patches, [{ id: 7, parent: null }])
})

test('a link change is told in a toast, naming a parent it replaced and links it removed', () => {
  assert.equal(describeLinkChange(123, [{ rel: PARENT_LINK, targetId: 456 }], [], { titles: { 456: 'Checkout' } }), '#123: Parent → #456 Checkout.')
  assert.equal(
    describeLinkChange(123, [{ rel: PARENT_LINK, targetId: 456 }], [{ rel: PARENT_LINK, targetId: 455 }]),
    '#123: Parent changed to #456 (was #455).',
  )
  assert.equal(
    describeLinkChange(123, [{ rel: CHILD_LINK, targetId: 5 }], [{ rel: RELATED, targetId: 789 }], { titles: { 789: 'Crash' } }),
    '#123: Child → #5; Related link to #789 Crash removed.',
  )
  const testedBy = 'Microsoft.VSTS.Common.TestedBy-Forward'
  assert.equal(describeLinkChange(123, [{ rel: testedBy, targetId: 5 }], [], { types: [{ rel: testedBy, name: 'Tested By' }] }), '#123: Tested By → #5.')
  assert.equal(describeLinkChange(123, [{ rel: 'Custom.LinkTypes.Blocks-Forward', targetId: 5 }], []), '#123: Blocks Forward → #5.')
})

test('marking an item a duplicate offers its type’s Removed state, else its Completed one, unless it is already closed', () => {
  const duplicate = [{ rel: DUPLICATE_OF_LINK, targetId: 5 }]
  const states = [{ name: 'New', category: 'Proposed' }, { name: 'Done', category: 'Completed' }, { name: 'Removed', category: 'Removed' }]
  assert.equal(getDuplicateCloseState(duplicate, states, 'New'), 'Removed')
  assert.equal(getDuplicateCloseState(duplicate, states.slice(0, 2), 'New'), 'Done')
  assert.equal(getDuplicateCloseState(duplicate, states, 'done'), undefined)
  assert.equal(getDuplicateCloseState(duplicate, states.slice(0, 1), 'New'), undefined)
  assert.equal(getDuplicateCloseState([{ rel: RELATED, targetId: 5 }], states, 'New'), undefined)
})

test('the Triage queue suggests the parents its items already have, the most used first', () => {
  const parent = (id: number, title?: string) => ({ parent: { id, title, workItemUrl: '', unavailable: !title } })
  assert.deepEqual(getQueueParentSuggestions([parent(1, 'One'), {}, parent(2), parent(2, 'Two'), parent(3, 'Three'), parent(2)]), [
    { id: 2, title: 'Two' },
    { id: 1, title: 'One' },
    { id: 3, title: 'Three' },
  ])
})
