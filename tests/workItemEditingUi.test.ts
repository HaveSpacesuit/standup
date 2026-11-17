import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement, useState } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { WorkItemSummary } from '../src/ado/types.ts'
import type { WorkItemFieldChanges, WorkItemFields } from '../src/ado/workItemUpdateApi.ts'
import type { WorkItemPatch } from '../src/ado/workItemPatch.ts'

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
const { useWorkItemEditor } = await server.ssrLoadModule('/src/features/standup/hooks/useWorkItemEditor.ts')
const { useWorkItemPatches } = await server.ssrLoadModule('/src/features/standup/hooks/useWorkItemPatches.ts')
const { applyWorkItemPatch, getWorkItemFields, workItemUrlFor } = await server.ssrLoadModule('/src/ado/workItemPatch.ts')
const { applyFieldChanges } = await server.ssrLoadModule('/src/ado/workItemUpdateApi.ts')

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

type Update = { id: number; changes: WorkItemFieldChanges; expected: Partial<WorkItemFields> }

/** Stands in for the query engine: keeps each item's saved fields and tells subscribers about every change. */
function createFakeEngine(items: WorkItemSummary[]) {
  const saved = new Map<number, WorkItemFields>(items.map((item) => [item.id, getWorkItemFields(item)]))
  const listeners = new Set<(patch: WorkItemPatch) => void>()
  const publish = (patch: WorkItemPatch) => listeners.forEach((listener) => listener(patch))
  const engine = {
    updates: [] as Update[],
    reloads: 0,
    failure: null as Error | null,
    gate: null as Promise<void> | null,
    subscribeWorkItemPatches(listener: (patch: WorkItemPatch) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
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
    async reloadWorkItem(scope: typeof team, id: number) {
      engine.reloads++
      if (engine.failure) throw engine.failure
      const patch = { id, workItemUrl: workItemUrlFor(scope, id), fields: saved.get(id)! }
      publish(patch)
      return patch
    },
  }
  return engine
}

function Harness({ engine, initialItems, tagRules }: { engine: ReturnType<typeof createFakeEngine>; initialItems: WorkItemSummary[]; tagRules: unknown[] }) {
  const [items, setItems] = useState(initialItems)
  useWorkItemPatches(engine, (patch: WorkItemPatch) => setItems((current) => applyWorkItemPatch(current, patch)))
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
const toastText = () => document.querySelector('.MuiSnackbarContent-message')?.textContent ?? ''
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
  assert.equal(card(1).hasAttribute('aria-busy'), false)

  engine.gate = null
  await click(byText('.MuiSnackbarContent-action button', 'Undo'))
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

  await dragCard(1, () => cell('bo', 'Active'), 'escape')
  assert.equal(document.querySelector('[data-board-drag-ghost]') === null, true)
  assert.equal(engine.updates.length, 0)
  assert.equal(isIn(1, 'ana', 'New'), true)
})
