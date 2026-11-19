import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement, useState } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { TriageItem, TriageResult, WorkItemPullRequestSummary, WorkItemSummary } from '../src/ado/types.ts'
import type { WorkItemFieldChanges, WorkItemFields } from '../src/ado/workItemUpdateApi.ts'
import type { PatchableWorkItem, PullRequestPatch, WorkItemPatch } from '../src/ado/workItemPatch.ts'
import type { FieldEditorProps } from '../src/features/standup/components/WorkItemFieldEditors.tsx'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
for (const name of ['localStorage', 'sessionStorage'] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] })
  after(() => descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name))
}
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, Document: dom.window.Document,
  Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node,
  ShadowRoot: dom.window.ShadowRoot, MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16),
  cancelAnimationFrame: (handle: number) => clearTimeout(handle),
  IS_REACT_ACT_ENVIRONMENT: true,
})
const { createRoot } = await import('react-dom/client')
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false }, ssr: { noExternal: [/^@stratakit\//] } })
after(async () => { await server.close(); dom.window.close() })
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { KanbanBoard } = await server.ssrLoadModule('/src/features/standup/components/KanbanBoard.tsx')
const { WorkItemEditingProvider } = await server.ssrLoadModule('/src/features/standup/components/WorkItemEditing.tsx')
const { WorkItemFieldEditor } = await server.ssrLoadModule('/src/features/standup/components/WorkItemFieldEditors.tsx')
const { useWorkItemEditor } = await server.ssrLoadModule('/src/features/standup/hooks/useWorkItemEditor.ts')
const { useWorkItemPatches, usePullRequestPatches } = await server.ssrLoadModule('/src/features/standup/hooks/useWorkItemPatches.ts')
const { applyPullRequestPatch, applyWorkItemPatch, getWorkItemFields, workItemUrlFor } = await server.ssrLoadModule('/src/ado/workItemPatch.ts')
const { applyFieldChanges } = await server.ssrLoadModule('/src/ado/workItemUpdateApi.ts')
const { TriageTable } = await server.ssrLoadModule('/src/features/standup/components/TriageTable.tsx')
const { TriageInbox } = await server.ssrLoadModule('/src/features/standup/components/TriageInbox.tsx')
const { applyTriagePatch, getTriageReasons } = await server.ssrLoadModule('/src/ado/triageApi.ts')
const { createBacklogSprintResolver } = await server.ssrLoadModule('/src/features/standup/utils/backlogSprint.ts')

const team = { orgName: 'org', projectName: 'Project', iterationPath: 'Project' }
const ana = { displayName: 'Ana', uniqueName: 'ana@example.invalid' }
const bo = { displayName: 'Bo', uniqueName: 'bo@example.invalid' }
const pbiStates = [
  { name: 'New', category: 'Proposed' },
  { name: 'Approved', category: 'Proposed' },
  { name: 'Committed', category: 'InProgress' },
  { name: 'Done', category: 'Completed' },
]
const makeItem = (id: number, fields: Partial<WorkItemSummary> = {}): WorkItemSummary => ({
  id, title: `Card ${id}`, state: 'Approved', workItemType: 'Product Backlog Item', status: 'New', assignedTo: ana,
  iterationPath: 'Project\\S1', sprintName: 'S1', effort: 8, tags: [], workItemUrl: workItemUrlFor(team, id), ...fields,
})
const makePullRequest = (id: number, fields: Partial<WorkItemPullRequestSummary> = {}): WorkItemPullRequestSummary => ({
  id, repositoryId: 'repo', repositoryName: 'Repo', title: 'Fix the toast', url: `https://dev.azure.com/org/Project/_git/Repo/pullrequest/${id}`,
  status: 'active', ...fields,
})
/** A pull request card, as the Developers view shows a pull request linked to no work item. */
const makePullRequestCard = (id: number, fields: Partial<WorkItemPullRequestSummary> = {}): WorkItemSummary => ({
  id: -id, kind: 'pull-request', title: 'Fix the toast', status: 'Review', assignedTo: ana, pullRequest: makePullRequest(id, fields),
})

type Update = { id: number; changes: WorkItemFieldChanges; expected: Partial<WorkItemFields> }

/** Stands in for the query engine: keeps each item's saved fields and tells subscribers about every change. */
function createFakeEngine(items: PatchableWorkItem[]) {
  const saved = new Map<number, WorkItemFields>(items.map((item) => [item.id, getWorkItemFields(item)]))
  const listeners = new Set<(patch: WorkItemPatch) => void>()
  const pullRequestListeners = new Set<(patch: PullRequestPatch) => void>()
  const publish = (patch: WorkItemPatch) => listeners.forEach((listener) => listener(patch))
  const engine = {
    updates: [] as Update[],
    reloads: 0,
    reloadOptions: [] as unknown[],
    failure: null as Error | null,
    gate: null as Promise<void> | null,
    /** What a reload that asks for pull requests reads; `unavailable` when they can't be read. */
    linkedPullRequests: undefined as WorkItemPatch['pullRequests'] | 'unavailable',
    /** What reading a pull request card again finds. */
    pullRequestRead: null as Pick<PullRequestPatch, 'card' | 'status'> | null,
    subscribeWorkItemPatches(listener: (patch: WorkItemPatch) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    subscribePullRequestPatches(listener: (patch: PullRequestPatch) => void) {
      pullRequestListeners.add(listener)
      return () => pullRequestListeners.delete(listener)
    },
    previewWorkItemFields(scope: typeof team, id: number, fields: WorkItemFields) {
      publish({ id, workItemUrl: workItemUrlFor(scope, id), fields, preview: true })
    },
    async updateWorkItem(scope: typeof team, id: number, changes: WorkItemFieldChanges, expected: Partial<WorkItemFields>) {
      engine.updates.push({ id, changes, expected })
      await engine.gate
      if (engine.failure) throw engine.failure
      saved.set(id, applyFieldChanges(saved.get(id)!, changes))
      const patch = { id, workItemUrl: workItemUrlFor(scope, id), fields: saved.get(id)! }
      publish(patch)
      return patch
    },
    async reloadWorkItem(scope: typeof team, id: number, options: { pullRequests?: boolean } = {}) {
      engine.reloads++
      engine.reloadOptions.push(options)
      if (engine.failure) throw engine.failure
      const patch: WorkItemPatch & { pullRequestsUnavailable?: boolean } = { id, workItemUrl: workItemUrlFor(scope, id), fields: saved.get(id)! }
      if (options.pullRequests && engine.linkedPullRequests === 'unavailable') patch.pullRequestsUnavailable = true
      else if (options.pullRequests && engine.linkedPullRequests) patch.pullRequests = engine.linkedPullRequests
      publish(patch)
      return patch
    },
    async reloadPullRequest(_scope: typeof team, pullRequest: WorkItemPullRequestSummary) {
      const patch = { id: pullRequest.id, repositoryId: pullRequest.repositoryId, ...engine.pullRequestRead! }
      pullRequestListeners.forEach((listener) => listener(patch))
      return patch
    },
  }
  return engine
}

function Harness({ engine, initialItems, tagRules }: { engine: ReturnType<typeof createFakeEngine>; initialItems: WorkItemSummary[]; tagRules: unknown[] }) {
  const [items, setItems] = useState(initialItems)
  useWorkItemPatches(engine, (patch: WorkItemPatch) => setItems((current) => applyWorkItemPatch(current, patch)))
  usePullRequestPatches(engine, (patch: PullRequestPatch) => setItems((current) => applyPullRequestPatch(current, patch)))
  const editor = useWorkItemEditor({
    engine, team, statesByType: { 'product backlog item': pbiStates }, projectStates: pbiStates, iterations: [],
    members: [ana, bo], knownTags: [], effortSuggestions: [3, 5], tagRules,
  })
  return createElement(WorkItemEditingProvider, { editor },
    createElement(KanbanBoard, {
      lens: 'people', patConfigured: true, isLoading: false, membersError: null, workItemsError: null, assigneesError: null,
      members: [ana, bo], selectedMemberFilter: '', workItems: items, currentIterationName: 'S1',
      changeHighlightsByItemId: {}, rolledOverItemIds: {}, teamIterations: [], tagRules,
      workItemAssignees: Object.fromEntries(items.map((item) => [item.id, { kind: 'team-member', label: item.assignedTo?.displayName ?? '' }])),
    }))
}

async function render(t: TestContext, items: WorkItemSummary[], tagRules: unknown[] = []) {
  const engine = createFakeEngine(items)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  await act(async () => root.render(createElement(Root, null, createElement(Harness, { engine, initialItems: items, tagRules }))))
  return { host, engine }
}

const card = (id: number) => document.querySelector<HTMLElement>(`[data-editable-item="${id}"]`)!
const cell = (lane: string, column: string) => document.querySelector<HTMLElement>(`[data-drop-lane="${lane}"][data-drop-column="${column}"]`)!
const isIn = (id: number, lane: string, column: string) => cell(lane, column)?.querySelector(`[data-editable-item="${id}"]`) !== null
const click = (element: Element) => act(async () => (element as HTMLElement).click())
const byText = (selector: string, text: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].find((element) => element.textContent?.trim().startsWith(text))!
const toastText = () => document.querySelector('.MuiSnackbar-root .MuiAlert-message')?.textContent ?? ''
/** The toast's StrataKit status, such as `Success`, which also colours its icon and border. */
const toastSeverity = () => /\bMuiAlert-color(\w+)/.exec(document.querySelector('.MuiSnackbar-root [role="alert"]')?.className ?? '')?.[1]
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })

const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) =>
  new dom.window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, ...init })

/** Presses on a card, moves past the drag threshold over `over`, then releases or presses Escape. */
async function dragCard(id: number, over: () => Element | null, finish: 'drop' | 'escape' = 'drop', afterMove?: () => Promise<void>) {
  dom.window.document.elementFromPoint = () => over()
  await act(async () => { card(id).dispatchEvent(pointer('pointerdown', 10, 10)) })
  await act(async () => { dom.window.dispatchEvent(pointer('pointermove', 30, 30)) })
  await act(async () => { dom.window.dispatchEvent(pointer('pointermove', 32, 32)) })
  await afterMove?.()
  await act(async () => {
    dom.window.dispatchEvent(finish === 'drop'
      ? pointer('pointerup', 32, 32)
      : new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  })
  await settle()
}
const ghostText = () => document.querySelector('[data-board-drag-ghost]')?.textContent ?? ''

const openMenu = (id: number) => act(async () => {
  card(id).dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 }))
})

/** Replaces a property for one test, such as the browser's clipboard, putting the original back afterwards. */
function stubProperty(t: TestContext, target: object, key: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
  t.after(() => (descriptor ? Object.defineProperty(target, key, descriptor) : Reflect.deleteProperty(target, key)))
}

/** A clipboard that takes rich content, collecting each copy's forms by type. */
function stubRichClipboard(t: TestContext) {
  const written: Record<string, Blob>[] = []
  stubProperty(t, globalThis, 'ClipboardItem', class {
    items: Record<string, Blob>
    constructor(items: Record<string, Blob>) { this.items = items }
  })
  stubProperty(t, globalThis.navigator, 'clipboard', {
    write: async (items: { items: Record<string, Blob> }[]) => { written.push(...items.map((item) => item.items)) },
  })
  return written
}

test('the shared sprint picker shows relative labels beside names and saves the chosen path', async (t) => {
  const changes: WorkItemFieldChanges[] = []
  const props: FieldEditorProps = {
    item: makeItem(1),
    options: {
      statesFor: () => [], backlogPath: 'Project', members: [], knownTags: [], effortSuggestions: [], tagRules: [],
      iterations: [
        { name: 'S1', path: 'Project\\S1', timeFrame: 'current', startDate: '2026-12-15', finishDate: '2026-12-31' },
        { name: 'Future', path: 'Project\\Future', timeFrame: 'future', startDate: undefined, finishDate: undefined },
        { name: 'S2', path: 'Project\\S2', timeFrame: 'future', startDate: '2027-01-01', finishDate: '2027-01-14' },
        { name: 'S0', path: 'Project\\S0', timeFrame: 'past', startDate: '2026-12-01', finishDate: '2026-12-14' },
      ],
    },
    onSave: (change) => changes.push(change),
    onCancel: () => {},
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  await act(async () => root.render(createElement(Root, null, createElement(WorkItemFieldEditor, { ...props, field: 'iterationPath' }))))

  const choice = (name: string) => byText('[role="menuitemradio"]', name)
  for (const [name, label] of [['S1', 'Current sprint'], ['S2', 'Next sprint'], ['S0', 'Previous sprint']]) {
    assert.equal(choice(name).lastElementChild?.textContent, label)
    assert.equal(choice(name).firstElementChild?.textContent, name, 'the sprint name is still shown separately')
  }
  assert.equal(choice('S1').getAttribute('aria-checked'), 'true')
  assert.equal(choice('S2').getAttribute('aria-checked'), 'false', 'relative labels do not change selection')
  assert.equal(choice('Future').textContent, 'Future', 'the undated bucket is not the next sprint')
  await click(choice('S2'))
  assert.deepEqual(changes, [{ iterationPath: 'Project\\S2' }])
})

test('the card menu opens a field editor; the change shows at once, saves, and can be undone', async (t) => {
  const { engine } = await render(t, [makeItem(1)])
  assert.equal(isIn(1, 'ana', 'New'), true)

  await act(async () => { card(1).dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 })) })
  assert.equal(document.querySelector('[role="menu"]') !== null, true)
  await click(byText('[role="menu"] [role="menuitem"]', 'State'))
  assert.equal(document.querySelector('[role="dialog"]')?.textContent?.includes('Change state'), true)

  let release!: () => void
  engine.gate = new Promise((resolve) => { release = resolve })
  await click(byText('[role="menuitemradio"]', 'Committed'))
  // Shown in its new column while it saves.
  assert.equal(isIn(1, 'ana', 'Active'), true)
  assert.equal(card(1).getAttribute('aria-busy'), 'true')
  await act(async () => { release(); await engine.gate })
  await settle()

  assert.deepEqual(engine.updates, [{ id: 1, changes: { state: 'Committed' }, expected: { state: 'Approved' } }])
  assert.equal(toastText().includes('#1: State → Committed.'), true)
  assert.equal(toastSeverity(), 'Success')
  assert.equal(card(1).hasAttribute('aria-busy'), false)

  engine.gate = null
  await click(byText('.MuiSnackbar-root .MuiAlert-action button', 'Undo'))
  await settle()
  assert.deepEqual(engine.updates[1], { id: 1, changes: { state: 'Approved' }, expected: { state: 'Committed' } })
  assert.equal(isIn(1, 'ana', 'New'), true)
  assert.equal(toastText().includes('change undone'), true)
})

test('field keys open editors with the team’s effort suggestions; a failed save puts the card back', async (t) => {
  const { engine } = await render(t, [makeItem(1)])
  const shown = card(1).textContent
  await act(async () => { card(1).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true })) })
  const suggestions = [...document.querySelectorAll('[aria-label="Suggested effort"] button')].map((button) => button.textContent)
  assert.deepEqual(suggestions, ['3', '5'])

  let release!: () => void
  engine.gate = new Promise((resolve) => { release = resolve })
  engine.failure = new Error('Azure DevOps is down.')
  await click(document.querySelectorAll('[aria-label="Suggested effort"] button')[1])
  assert.equal(card(1).textContent === shown, false)
  await act(async () => { release(); await engine.gate })
  await settle()
  assert.deepEqual(engine.updates.map((update) => update.changes), [{ effort: 5 }])
  assert.equal(toastText().includes('Azure DevOps is down.'), true)
  assert.equal(toastSeverity(), 'Error')
  // The card shows the saved effort again (the reload fails too), and is reloaded in case the save failed partway.
  assert.equal(card(1).textContent, shown)
  assert.equal(engine.reloads, 1)
})

test('dragging a card to another person’s column assigns it and changes its state in one save', async (t) => {
  const { engine } = await render(t, [makeItem(1)])
  await dragCard(1, () => cell('bo', 'Active'), 'drop', async () => {
    assert.equal(ghostText().includes('State → Committed'), true)
    assert.equal(ghostText().includes('Assigned to → Bo'), true)
    assert.equal(card(1).hasAttribute('data-dragging'), true)
  })
  assert.equal(engine.updates.length, 1)
  assert.equal(engine.updates[0].changes.state, 'Committed')
  assert.equal(engine.updates[0].changes.assignedTo?.uniqueName, bo.uniqueName)
  assert.equal(document.querySelector('[data-board-drag-ghost]') === null, true)
  assert.equal(isIn(1, 'bo', 'Active'), true)
})

test('a column with several of the card’s states saves the one pointed at', async (t) => {
  const { engine } = await render(t, [makeItem(1, { state: 'Committed', status: 'Active' })])
  let slotHovered = false
  await dragCard(1, () => (slotHovered ? cell('ana', 'New').querySelector('[data-drop-slot="1"]') : cell('ana', 'New')), 'drop', async () => {
    assert.equal(cell('ana', 'New').querySelectorAll('[data-drop-slot]').length, 2)
    slotHovered = true
    await act(async () => { dom.window.dispatchEvent(pointer('pointermove', 34, 34)) })
    assert.equal(ghostText().includes('State → Approved'), true)
  })
  assert.deepEqual(engine.updates.map((update) => update.changes), [{ state: 'Approved' }])
})

test('a refused drop explains why, and Escape cancels a drag, without saving', async (t) => {
  const { engine } = await render(t, [makeItem(1)])
  await dragCard(1, () => cell('ana', 'Review'))
  assert.equal(toastText().includes('No Product Backlog Item state goes in Review'), true)
  assert.equal(toastSeverity(), 'Warning')

  await dragCard(1, () => cell('bo', 'Active'), 'escape')
  assert.equal(document.querySelector('[data-board-drag-ghost]') === null, true)
  assert.equal(engine.updates.length, 0)
  assert.equal(isIn(1, 'ana', 'New'), true)
})

test('Copy link copies the item as a link for rich editors and as plain text for the rest', async (t) => {
  const written = stubRichClipboard(t)
  await render(t, [makeItem(1, { workItemType: 'Bug', title: 'Drive <root> & "toast"' })])

  await openMenu(1)
  await click(byText('[role="menu"] [role="menuitem"]', 'Copy link'))
  await settle()
  assert.equal(written.length, 1)
  assert.equal(await written[0]['text/html'].text(),
    '<a href="https://dev.azure.com/org/Project/_workitems/edit/1/">Bug 1</a>: Drive &lt;root&gt; &amp; &quot;toast&quot;')
  assert.equal(await written[0]['text/plain'].text(), 'Bug 1: Drive <root> & "toast"')
  assert.equal(toastText().includes('Copied link to Bug 1.'), true)
})

test('Copy link falls back to a copy event, and says so when the browser blocks every way of copying', async (t) => {
  stubProperty(t, globalThis, 'ClipboardItem', undefined)
  stubProperty(t, globalThis.navigator, 'clipboard', { writeText: async () => { throw new Error('Denied.') } })
  const copied: Record<string, string> = {}
  let allowCopy = true
  // Like Chromium, which reports success but sends no copy event while nothing is selected.
  stubProperty(t, document, 'execCommand', (command: string) => {
    if (command !== 'copy' || !allowCopy) return false
    if (!document.getSelection()?.toString()) return true
    const event = new dom.window.Event('copy', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { setData: (type: string, value: string) => { copied[type] = value } } })
    document.dispatchEvent(event)
    return true
  })
  await render(t, [makeItem(1)])

  await openMenu(1)
  await click(byText('[role="menu"] [role="menuitem"]', 'Copy link'))
  await settle()
  assert.deepEqual(copied, {
    'text/html': '<a href="https://dev.azure.com/org/Project/_workitems/edit/1/">Product Backlog Item 1</a>: Card 1',
    'text/plain': 'Product Backlog Item 1: Card 1',
  })
  assert.equal(toastText().includes('Copied link to Product Backlog Item 1.'), true)
  assert.equal(document.getSelection()?.toString(), '')

  allowCopy = false
  await openMenu(1)
  await click(byText('[role="menu"] [role="menuitem"]', 'Copy link'))
  await settle()
  assert.equal(toastText().includes('Couldn’t copy the link to Product Backlog Item 1.'), true)
})

const press = (id: number, key: string) => act(async () => {
  card(id).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
})
const menuItems = () => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((item) => item.textContent)

test('a pull request card reloads with R, and its menu copies a link to the pull request, with no fields to edit', async (t) => {
  const written = stubRichClipboard(t)
  const { engine } = await render(t, [makePullRequestCard(456)])
  assert.equal(card(-456).hasAttribute('data-draggable'), false)
  assert.equal(card(-456).querySelector('[aria-label="Reload PR 456 from Azure DevOps (R)"]') !== null, true)

  await openMenu(-456)
  assert.equal(document.querySelector('.MuiPopover-paper')?.textContent?.includes('PR 456 · Fix the toast'), true)
  assert.deepEqual(menuItems(), ['Reload from Azure DevOpsR', 'Copy link', 'Open in Azure DevOps'])
  await click(byText('[role="menu"] [role="menuitem"]', 'Copy link'))
  await settle()
  assert.equal(await written[0]['text/html'].text(), '<a href="https://dev.azure.com/org/Project/_git/Repo/pullrequest/456">Pull request 456</a>: Fix the toast')
  assert.equal(await written[0]['text/plain'].text(), 'Pull request 456: Fix the toast')
  assert.equal(toastText().includes('Copied link to Pull request 456.'), true)

  await press(-456, 's')
  assert.equal(document.querySelector('[role="dialog"]'), null)

  const checks = { state: 'failing', total: 1, passing: 0, pending: 0, failing: 1, failingNames: ['Build'], checks: [] } as const
  engine.pullRequestRead = { card: makePullRequestCard(456, { checks }), status: 'active' }
  await press(-456, 'r')
  await settle()
  assert.equal(toastText(), 'PR 456 reloaded: Checks changed.')

  engine.pullRequestRead = { card: null, status: 'abandoned' }
  await press(-456, 'r')
  await settle()
  assert.equal(toastText(), 'PR 456 was abandoned, so it left the board.')
  assert.equal(card(-456), null)
})

test('reloading a card reads its pull requests too, and its menu copies a link to each', async (t) => {
  const written = stubRichClipboard(t)
  const { engine } = await render(t, [makeItem(1, { activePullRequests: [makePullRequest(456)], linkedPullRequestIds: [456] })])
  const shownPullRequest = () => card(1).querySelector('a[href$="/pullrequest/456"]')
  assert.notEqual(shownPullRequest(), null)

  await openMenu(1)
  await click(byText('[role="menu"] [role="menuitem"]', 'Copy link to PR 456'))
  await settle()
  assert.equal(await written[0]['text/plain'].text(), 'Pull request 456: Fix the toast')
  assert.equal(toastText().includes('Copied link to Pull request 456.'), true)

  engine.linkedPullRequests = 'unavailable'
  await press(1, 'r')
  await settle()
  assert.equal(toastText(), '#1 is up to date, but its pull requests couldn’t be read. They show as they were.')
  assert.equal(toastSeverity(), 'Warning')
  assert.notEqual(shownPullRequest(), null)

  // Completed since, so the card no longer shows it.
  engine.linkedPullRequests = { active: [], linkedIds: [456] }
  await press(1, 'r')
  await settle()
  assert.deepEqual(engine.reloadOptions, [{ pullRequests: true }, { pullRequests: true }])
  assert.equal(toastText(), '#1 reloaded: Pull requests changed.')
  assert.equal(shownPullRequest(), null)
})

const bugStates = [
  { name: 'New', category: 'Proposed' },
  { name: 'Approved', category: 'Proposed' },
  { name: 'Committed', category: 'InProgress' },
  { name: 'Done', category: 'Completed' },
]
const triageRules = {
  options: { tags: ['Triage'], includeNewBugs: true, excludedIterationPaths: [] },
  metadata: { states: bugStates, workItemTypes: ['Bug'], statesByType: { bug: bugStates } },
}
const makeTriageItem = (id: number, fields: Partial<TriageItem> = {}): TriageItem => {
  const item = {
    id, title: `Bug ${id}`, workItemType: 'Bug', state: 'New', createdAt: '2026-01-01T00:00:00Z', tags: [] as string[], reasons: [] as string[],
    workItemUrl: workItemUrlFor(team, id), ...fields,
  }
  return { ...item, reasons: getTriageReasons(item, triageRules.options, triageRules.metadata), inInitialState: item.state === 'New' }
}

/** The Triage page's handling of edits: each one works out again whether the item is still listed. */
function TriageHarness({ engine, initialItems, view }: { engine: ReturnType<typeof createFakeEngine>; initialItems: TriageItem[]; view: 'table' | 'inbox' }) {
  const [result, setResult] = useState<TriageResult>({ items: initialItems, warnings: [], rules: triageRules })
  useWorkItemPatches(engine, (patch: WorkItemPatch) => setResult((current) => applyTriagePatch(current, patch)))
  const editor = useWorkItemEditor({
    engine, team, statesByType: { bug: bugStates }, projectStates: bugStates, iterations: [],
    members: [ana, bo], knownTags: ['Triage', 'frontend'], effortSuggestions: [3, 5], tagRules: [],
  })
  const props = {
    // As on the page, an item an edit clears stays listed until the queue reloads.
    items: result.items, resolveSprint: createBacklogSprintResolver([]), ageFlagDays: 2,
    readinessChecks: { bug: [], other: [] }, excludedIterationPaths: [], waitingTags: [],
  }
  return createElement(WorkItemEditingProvider, { editor },
    view === 'table' ? createElement(TriageTable, props) : createElement(TriageInbox, { ...props, lastVisit: null }))
}

async function renderTriage(t: TestContext, items: TriageItem[], view: 'table' | 'inbox') {
  const engine = createFakeEngine(items)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  await act(async () => root.render(createElement(Root, null, createElement(TriageHarness, { engine, initialItems: items, view }))))
  return engine
}

/** The listed items, in order, by the IDs on their More buttons. */
const listedIds = () => [...document.querySelectorAll('[data-work-item-menu]')].map((button) => Number(button.getAttribute('data-work-item-menu')?.split('#').at(-1)))
const menuButtonFor = (id: number) => document.querySelector(`[data-work-item-menu="${workItemUrlFor(team, id).toLowerCase()}#${id}"]`)

test('a Triage row’s tag chip removes the tag in place, and an item it clears stays, marked cleared, until an undo', async (t) => {
  const engine = await renderTriage(t, [makeTriageItem(1, { state: 'Approved', tags: ['frontend', 'Triage'] }), makeTriageItem(2)], 'table')
  assert.deepEqual(listedIds(), [1, 2])
  const row = () => menuButtonFor(1)!.closest('tr')!
  const remove = document.querySelector<HTMLElement>('[aria-label="Remove the “Triage” tag from #1"]')!
  assert.equal(remove !== null, true)

  await act(async () => remove.focus())
  await click(remove)
  assert.deepEqual(listedIds(), [1, 2], 'the approved bug no longer needs triage once untagged, but stays in its place')
  assert.equal(row().classList.contains('cleared'), true)
  assert.equal(row().querySelector('[aria-label="Why it is listed"]'), null)
  assert.equal(row().textContent!.includes('Cleared'), true)
  await settle()
  assert.deepEqual(engine.updates, [{ id: 1, changes: { tags: ['frontend'] }, expected: { tags: ['frontend', 'Triage'] } }])
  assert.equal(toastText().includes('#1: Tags → frontend.'), true)
  assert.equal(document.activeElement === menuButtonFor(1), true, 'focus stays with the item')

  await click(byText('.MuiSnackbar-root .MuiAlert-action button', 'Undo'))
  await settle()
  assert.deepEqual(engine.updates[1], { id: 1, changes: { tags: ['frontend', 'Triage'] }, expected: { tags: ['frontend'] } })
  assert.deepEqual(listedIds(), [1, 2])
  assert.equal(row().classList.contains('cleared'), false)
  assert.equal(document.querySelector('[aria-label="Remove the “Triage” tag from #1"]') !== null, true, 'its reason is back too')

  const addTag = document.querySelector<HTMLElement>('.edit-tags[aria-label="Tags: no tags. Change"]')!
  assert.equal(addTag.textContent, 'Tag')
  await click(addTag)
  assert.equal(document.querySelector('[role="dialog"]')?.textContent?.includes('Edit tags'), true)
})

test('a Triage card always offers its state, and a new bug moved on from its first state stays in the inbox, marked cleared', async (t) => {
  const engine = await renderTriage(t, [makeTriageItem(1), makeTriageItem(2)], 'inbox')
  const card = () => document.querySelector<HTMLElement>('[data-triage-card="1"]')
  const summary = () => document.querySelector('[aria-label="Triage summary"]')!.textContent!
  const state = card()!.querySelector<HTMLElement>('[data-edit-field="state"]')!
  assert.equal(state.textContent, 'New', 'shown even though the item is still in its first state')

  await click(state)
  assert.equal(document.querySelector('[role="dialog"]')?.textContent?.includes('Change state'), true)
  await click(byText('[role="menuitemradio"]', 'Approved'))
  await settle()
  assert.deepEqual(engine.updates, [{ id: 1, changes: { state: 'Approved' }, expected: { state: 'New' } }])
  assert.deepEqual(listedIds(), [1, 2], 'it keeps its place')
  assert.equal(card()!.classList.contains('cleared'), true)
  assert.equal(card()!.textContent!.includes('leaves the list when Triage next refreshes'), true)
  assert.equal(summary().startsWith('1 in triage'), true)
  assert.equal(summary().endsWith('1 cleared'), true)
  assert.equal(document.querySelector('#triage-inbox-todo')!.textContent!.endsWith('1longest in triage first'), true, 'the group counts what is left')

  await click(byText('.MuiSnackbar-root .MuiAlert-action button', 'Undo'))
  await settle()
  assert.deepEqual(listedIds(), [1, 2])
  assert.equal(card()!.classList.contains('cleared'), false)
  assert.equal(summary().includes('cleared'), false)
})

for (const view of ['table', 'inbox'] as const) {
  test(`an unassigned Triage ${view === 'table' ? 'row' : 'card'} assigns the item in place, and it stays in the queue`, async (t) => {
    const engine = await renderTriage(t, [makeTriageItem(1), makeTriageItem(2)], view)
    const assignee = () => menuButtonFor(1)!.closest('tr, [data-triage-card]')!.querySelector<HTMLElement>('[data-edit-field="assignedTo"]')!
    assert.equal(assignee().getAttribute('aria-label'), 'Assigned to: Unassigned. Change')
    assert.equal(assignee().textContent, 'Unassigned')

    await click(assignee())
    assert.equal(document.querySelector('[role="dialog"] input[aria-label="Search team members"]') !== null, true)
    // Each choice starts with its avatar's initial.
    await click([...document.querySelectorAll('[role="menuitemradio"]')].find((choice) => choice.textContent === 'BBo')!)
    await settle()
    assert.deepEqual(engine.updates.map((update) => [update.id, update.changes.assignedTo?.uniqueName]), [[1, bo.uniqueName]])
    assert.equal(toastText().includes('#1: Assigned to → Bo.'), true)
    assert.deepEqual(listedIds(), [1, 2], 'being assigned does not take an item off the queue')
    assert.equal(assignee().getAttribute('aria-label'), 'Assigned to: Bo. Change')
  })
}

test('cards keep the same editing controls when the tag rules change or a toast shows; the options follow the rules', async (t) => {
  const { useWorkItemEditing, useWorkItemEditOptions } = await server.ssrLoadModule('/src/features/standup/components/workItemEditingContext.ts')
  const seen: { editing: unknown; options: { tagRules: unknown[] } | null }[] = []
  let notify: ((message: string) => void) | undefined
  function Probe() {
    const editing = useWorkItemEditing()
    seen.push({ editing, options: useWorkItemEditOptions() })
    notify = editing?.editor.notify
    return null
  }
  const fixed = {
    engine: createFakeEngine([]), team, statesByType: {}, projectStates: pbiStates, iterations: [],
    members: [ana], knownTags: [], effortSuggestions: [3, 5],
  }
  function OptionsHarness({ tagRules }: { tagRules: unknown[] }) {
    const editor = useWorkItemEditor({ ...fixed, tagRules })
    return createElement(WorkItemEditingProvider, { editor }, createElement(Probe))
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  const noRules: unknown[] = []
  const rules = [{ id: 'rule', tag: 'outdated', action: 'unlisted' }]
  await act(async () => root.render(createElement(Root, null, createElement(OptionsHarness, { tagRules: noRules }))))
  await act(async () => root.render(createElement(Root, null, createElement(OptionsHarness, { tagRules: rules }))))
  await act(async () => notify?.('Copied'))
  assert.equal(toastText(), 'Copied')

  assert.ok(seen.length >= 3)
  assert.ok(seen.every(({ editing }) => editing === seen[0].editing), 'one editing api across rule and toast changes')
  assert.deepEqual(seen[0].options?.tagRules, [])
  assert.equal(seen.at(-1)?.options?.tagRules, rules)
})