import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestOptions } from '../src/ado/httpClient.ts'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())

const {
  buildWorkItemPatch,
  isWorkItemWriteAccessError,
  reconcileFieldChanges,
  updateWorkItemFields,
  WorkItemConflictError,
  WorkItemNotSavedError,
} = await server.ssrLoadModule('/src/ado/workItemUpdateApi.ts')
const { applyWorkItemPatch, patchWorkItem, workItemUrlFor } = await server.ssrLoadModule('/src/ado/workItemPatch.ts')
const { AdoWriteError } = await server.ssrLoadModule('/src/ado/httpClient.ts')
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')

const team = { orgName: 'org', projectName: 'Project' }
const bo = { displayName: 'Bo', uniqueName: 'bo@example.invalid' }
const apiItem = (rev: number, fields: Record<string, unknown> = {}) => ({
  id: 7,
  rev,
  fields: { 'System.Title': 'Card', 'System.State': 'Active', 'System.WorkItemType': 'Bug', 'System.Tags': 'A', ...fields },
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

test('the patch is guarded by the revision, adds and trims values, and clears only fields that have one', () => {
  const item = apiItem(3, { 'Microsoft.VSTS.Scheduling.Effort': 8 })
  assert.deepEqual(buildWorkItemPatch(3, {
    title: '  Renamed ', assignedTo: { ...bo, uniqueName: ' bo@example.invalid ' }, effort: null, severity: null, tags: ['b', 'A', 'a'],
  }, item), [
    { op: 'test', path: '/rev', value: 3 },
    { op: 'add', path: '/fields/System.Title', value: 'Renamed' },
    { op: 'add', path: '/fields/System.AssignedTo', value: 'bo@example.invalid' },
    { op: 'remove', path: '/fields/Microsoft.VSTS.Scheduling.Effort' },
    { op: 'replace', path: '/fields/System.Tags', value: 'A; b' },
  ])
  assert.deepEqual(buildWorkItemPatch(3, { tags: ['b'] }, apiItem(3, { 'System.Tags': undefined })), [
    { op: 'test', path: '/rev', value: 3 },
    { op: 'add', path: '/fields/System.Tags', value: 'b' },
  ])
  assert.deepEqual(buildWorkItemPatch(3, { tags: [], priority: 2 }, item), [
    { op: 'test', path: '/rev', value: 3 },
    { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: 2 },
    { op: 'remove', path: '/fields/System.Tags' },
  ])
  assert.deepEqual(buildWorkItemPatch(3, {}, item), [])
})

test('tag edits apply as additions and removals, so tags someone else added meanwhile are kept', () => {
  const current = { title: 'Card', tags: ['A', 'B', 'C'] }
  assert.deepEqual(reconcileFieldChanges(7, current, { tags: ['A', 'B', 'D'] }, { tags: ['A', 'B'] }, apiItem(1)), { tags: ['A', 'B', 'C', 'D'] })
  assert.deepEqual(reconcileFieldChanges(7, current, { tags: ['B'] }, { tags: ['A', 'B'] }, apiItem(1)), { tags: ['B', 'C'] })
  // Someone else already made the same tag change.
  assert.deepEqual(reconcileFieldChanges(7, current, { tags: ['A', 'B', 'C'] }, { tags: ['A', 'B'] }, apiItem(1)), {})
})

test('another change to an edited field is a conflict, unless it already set the new value', () => {
  const current = { title: 'Card', tags: [], state: 'Done', effort: 5 }
  assert.throws(
    () => reconcileFieldChanges(7, current, { state: 'Committed', effort: 8 }, { state: 'Active', effort: 3 }, apiItem(1)),
    (error: InstanceType<typeof WorkItemConflictError>) => {
      assert.ok(error instanceof WorkItemConflictError)
      assert.deepEqual(error.fields, ['state', 'effort'])
      assert.match(error.message, /#7's State, Effort changed in Azure DevOps/)
      return true
    },
  )
  assert.deepEqual(reconcileFieldChanges(7, current, { state: 'done' }, { state: 'Active' }, apiItem(1)), {})
  assert.deepEqual(reconcileFieldChanges(7, current, { effort: 8 }, {}, apiItem(1)), { effort: 8 })
})

test('saving reads the item, then patches only what changes against the revision it read', async () => {
  const client = fakeClient([apiItem(4)], (options) => {
    assert.equal(options.contentType, 'application/json-patch+json')
    assert.equal(options.path, '/Project/_apis/wit/workitems/7')
    return apiItem(5, { 'System.State': 'Resolved', 'System.Tags': 'A; B' })
  })
  const saved = await updateWorkItemFields(client, team, 7, { state: 'Resolved', tags: ['A', 'B'], title: 'Card' }, { state: 'Active', tags: ['A'] })
  assert.deepEqual(client.patches().map((call) => call.body), [[
    { op: 'test', path: '/rev', value: 4 },
    { op: 'add', path: '/fields/System.State', value: 'Resolved' },
    { op: 'replace', path: '/fields/System.Tags', value: 'A; B' },
  ]])
  assert.equal(saved.fields.state, 'Resolved')
  assert.deepEqual(saved.fields.tags, ['A', 'B'])

  const unchanged = fakeClient([apiItem(4)])
  assert.equal((await updateWorkItemFields(unchanged, team, 7, { state: 'active' })).item.rev, 4)
  assert.equal(unchanged.calls.length, 1)
})

test('removing one of several tags replaces the tag list, since Azure DevOps merges added tags', async () => {
  const client = fakeClient([apiItem(4, { 'System.Tags': 'Frontend; Triage' })], () => apiItem(5, { 'System.Tags': 'Frontend' }))
  const saved = await updateWorkItemFields(client, team, 7, { tags: ['Frontend'] }, { tags: ['Frontend', 'Triage'] })
  assert.deepEqual(client.patches().map((call) => call.body), [[
    { op: 'test', path: '/rev', value: 4 },
    { op: 'replace', path: '/fields/System.Tags', value: 'Frontend' },
  ]])
  assert.deepEqual(saved.fields.tags, ['Frontend'])
})

test('a conflict or invalid value fails before anything is written', async () => {
  const conflicted = fakeClient([apiItem(4, { 'System.State': 'Closed' })])
  await assert.rejects(updateWorkItemFields(conflicted, team, 7, { state: 'Resolved' }, { state: 'Active' }), WorkItemConflictError)
  assert.equal(conflicted.patches().length, 0)

  for (const [changes, message] of [
    [{ title: '   ' }, /needs a title/],
    [{ title: 'x'.repeat(256) }, /at most 255 characters/],
    [{ effort: -1 }, /Effort must be a number of 0 or more/],
    [{ priority: Number.NaN }, /Impact must be a number/],
    [{ assignedTo: { displayName: 'No account' } }, /no Azure DevOps account identifier/],
    [{ state: '' }, /Choose a state/],
  ] as const) {
    const client = fakeClient([apiItem(4)])
    await assert.rejects(updateWorkItemFields(client, team, 7, changes), message)
    assert.equal(client.calls.length, 0, JSON.stringify(changes))
  }
})

test('rejected writes explain themselves and are never retried', async () => {
  for (const [status, expected] of [
    [409, /changed in Azure DevOps while saving/],
    [412, /changed in Azure DevOps while saving/],
    [400, /refused the change to #7 \(HTTP 400\)/],
    [500, /could not save the change \(HTTP 500\)/],
  ] as const) {
    const client = fakeClient([apiItem(4)], () => { throw new AdoWriteError(status) })
    await assert.rejects(updateWorkItemFields(client, team, 7, { state: 'Resolved' }), expected)
    assert.equal(client.patches().length, 1)
  }
  const denied = fakeClient([apiItem(4)], () => { throw new AdoWriteError(403) })
  await assert.rejects(updateWorkItemFields(denied, team, 7, { state: 'Resolved' }), (error: unknown) => isWorkItemWriteAccessError(error))
})

test('a lost response re-reads the item to learn whether the write was saved', async () => {
  const lost = () => { throw new TypeError('Failed to fetch') }
  const saved = fakeClient([apiItem(4), apiItem(5, { 'System.State': 'Resolved' })], lost)
  assert.equal((await updateWorkItemFields(saved, team, 7, { state: 'Resolved' })).item.rev, 5)
  assert.equal(saved.patches().length, 1)

  const untouched = fakeClient([apiItem(4)], lost)
  await assert.rejects(updateWorkItemFields(untouched, team, 7, { state: 'Resolved' }), WorkItemNotSavedError)
  assert.equal(isWorkItemWriteAccessError(new WorkItemNotSavedError()), true)

  const overtaken = fakeClient([apiItem(4), apiItem(6)], lost)
  await assert.rejects(updateWorkItemFields(overtaken, team, 7, { state: 'Resolved' }), /could not be confirmed/)
  assert.equal(overtaken.patches().length, 1)
})

const fields = { title: 'Renamed', state: 'Committed', tags: ['Blocked'], iterationPath: 'Project\\Sprint 11', assignedTo: bo, effort: 8 }
const url = workItemUrlFor(team, 7)

test('a patch re-derives a board card’s sprint and column, and leaves other lists’ shapes alone', () => {
  const card = { id: 7, workItemUrl: url, title: 'Card', state: 'Approved', status: 'New', sprintName: 'Sprint 10', iterationPath: 'Project\\Sprint 10' }
  const patched = patchWorkItem(card, { id: 7, workItemUrl: url, fields, changedAt: '2026-03-01T00:00:00Z' })
  assert.equal(patched.sprintName, 'Sprint 11')
  assert.equal(patched.status, 'Blocked')
  assert.equal(patched.assignedTo, bo)
  assert.equal('recentActivityAt' in patched, false)

  const bug = patchWorkItem({ id: 7, workItemUrl: url, title: 'Bug', state: 'New', recentActivityAt: 'old' }, { id: 7, workItemUrl: url, fields: { ...fields, state: undefined }, changedAt: 'new' })
  assert.equal('status' in bug || 'sprintName' in bug, false)
  assert.equal(bug.state, 'New')
  assert.equal(bug.recentActivityAt, 'new')
})

test('patches match items by ID and organization, and leave a list without the item as it was', () => {
  const list = [{ id: 7, workItemUrl: workItemUrlFor({ orgName: 'other', projectName: 'Project' }, 7), title: 'Same ID elsewhere' }]
  assert.equal(applyWorkItemPatch(list, { id: 7, workItemUrl: url, fields }), list)
  const mine = [...list, { id: 7, workItemUrl: url.toUpperCase(), title: 'Card' }]
  assert.deepEqual(applyWorkItemPatch(mine, { id: 7, workItemUrl: url, fields }).map((item: { title: string }) => item.title), ['Same ID elsewhere', 'Renamed'])
})

test('the engine shows saved, reloaded, previewed and conflicting values to every subscribed view', async (t) => {
  let current = apiItem(4, { 'System.State': 'Done', 'System.ChangedDate': '2026-03-02T00:00:00Z' })
  let writes = 0
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    if (init.method === 'PATCH') writes++
    return new Response(JSON.stringify(current), { headers: { 'Content-Type': 'application/json' } })
  })
  const engine = new AdoQueryEngine('nonfunctional-test-token')
  const seen: { state?: string; preview?: boolean; changedAt?: string }[] = []
  const unsubscribe = engine.subscribeWorkItemPatches((patch: { fields: { state?: string }; preview?: boolean; changedAt?: string; workItemUrl: string }) => {
    assert.equal(patch.workItemUrl, url)
    seen.push({ state: patch.fields.state, preview: patch.preview, changedAt: patch.changedAt })
  })

  await engine.reloadWorkItem(team, 7)
  engine.previewWorkItemFields(team, 7, { title: 'Card', tags: [], state: 'Resolved' })
  await assert.rejects(engine.updateWorkItem(team, 7, { state: 'Resolved' }, { state: 'Active' }), WorkItemConflictError)
  current = apiItem(5, { 'System.State': 'Resolved' })
  unsubscribe()
  await engine.reloadWorkItem(team, 7)

  assert.equal(writes, 0)
  assert.deepEqual(seen, [
    { state: 'Done', preview: undefined, changedAt: '2026-03-02T00:00:00Z' },
    { state: 'Resolved', preview: true, changedAt: undefined },
    { state: 'Done', preview: undefined, changedAt: '2026-03-02T00:00:00Z' },
  ])
})
