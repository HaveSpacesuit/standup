import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement, Fragment, useState } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { WorkItemSummary } from '../src/ado/types.ts'

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
  IS_REACT_ACT_ENVIRONMENT: true,
})
const { createRoot } = await import('react-dom/client')
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false }, ssr: { noExternal: [/^@stratakit\//] } })
after(async () => { await server.close(); dom.window.close() })
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { KanbanBoard } = await server.ssrLoadModule('/src/features/standup/components/KanbanBoard.tsx')
const { useQuickAssign } = await server.ssrLoadModule('/src/features/standup/hooks/useQuickAssign.ts')
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')
const { DEFAULT_TAG_RULES } = await server.ssrLoadModule('/src/ado/workItemStatus.ts')
const team = { id: 'team', orgName: 'org', projectName: 'Project', areaPath: 'Project\\Team', displayName: 'Team', teamName: 'Team', repoName: '', iterationPath: 'Project' }
const developer = { displayName: 'Developer', uniqueName: 'dev@example.invalid' }
const iterations = [
  { name: 'S1', path: 'Project\\S1', timeFrame: 'current', startDate: '2026-01-01' },
  { name: 'S2', path: 'Project\\S2', timeFrame: 'future', startDate: '2026-02-01' },
  { name: 'S3', path: 'Project\\S3', timeFrame: 'future', startDate: '2026-03-01' },
]
const makeItem = (id: number, fields: Partial<WorkItemSummary> = {}): WorkItemSummary => ({
  id, title: `Candidate ${id}`, state: 'Approved', workItemType: 'Product Backlog Item', status: 'New',
  iterationPath: 'Project\\S1', sprintName: 'S1', effort: 8,
  workItemIconUrl: 'https://example.test/icons/list', ...fields,
})
const engine = new AdoQueryEngine('nonfunctional-test-token')

function Harness({ lens = 'people', emptyDeveloper = false, extraSprints = false }: { lens?: 'people' | 'sprint'; emptyDeveloper?: boolean; extraSprints?: boolean }) {
  const [scopeKey, setScopeKey] = useState('scope')
  const [items, setItems] = useState([...(emptyDeveloper ? [] : [makeItem(100, { assignedTo: developer })]), makeItem(1), makeItem(2, { workItemType: 'Bug', workItemIconUrl: 'https://example.test/icons/insect', effort: undefined }),
    ...(extraSprints ? [
      makeItem(3, { iterationPath: 'Project\\S2', sprintName: 'S2' }),
      makeItem(4, { iterationPath: 'Project\\S3', sprintName: 'S3' }),
    ] : []),
  ])
  const controller = useQuickAssign({
    engine, team, items, iterations, tagRules: DEFAULT_TAG_RULES, scopeKey,
    onAssigned: (updated: WorkItemSummary) => setItems((current) => current.map((item) => item.id === updated.id ? updated : item)),
    onRefresh: () => setItems((current) => current.filter((item) => item.id !== 1)),
  })
  return createElement(Fragment, null,
    createElement('button', { onClick: () => setScopeKey('other') }, 'Switch scope'),
    createElement(KanbanBoard, {
    quickAssign: controller, lens, patConfigured: true, isLoading: false, membersError: null, workItemsError: null, assigneesError: null,
    members: [developer], selectedMemberFilter: 'Developer',
    // The person filter hides all unassigned candidates from the board, but not from Quick assign.
    workItems: items.filter((item) => item.assignedTo?.uniqueName === developer.uniqueName),
    currentIterationName: 'S1', changeHighlightsByItemId: {}, rolledOverItemIds: {}, teamIterations: iterations,
    workItemAssignees: Object.fromEntries(items.map((item) => [item.id, { kind: item.assignedTo ? 'team-member' : 'unassigned', label: item.assignedTo ? 'Developer' : 'Unassigned' }])),
  }))
}

async function render(t: TestContext, props = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  await act(async () => root.render(createElement(Root, null, createElement(Harness, props))))
  return host
}
const click = (element: Element) => act(async () => (element as HTMLElement).click())
const button = (host: Element, text: string) => [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)!
const trigger = (host: Element) => host.querySelector('[aria-label="Quick assign to Developer"]')!

test('quick assign displays current and next sprint labels beside their group headings', async (t) => {
  const host = await render(t, { extraSprints: true })
  await click(trigger(host))
  const headings = [...host.querySelectorAll('[role="radiogroup"] h4')]
  assert.deepEqual(headings.map((heading) => heading.textContent), ['S1Current sprint', 'S2Next sprint', 'S3'])
  assert.equal(host.querySelectorAll('input[type="radio"]').length, 4)
})

test('inline queue ignores the board person filter, shows only compact metadata, assigns explicitly, closes, and restores focus', async (t) => {
  let writes = 0
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    if (init.method === 'PATCH') writes++
    return new Response(JSON.stringify({ id: 1, rev: 7, fields: {
      'System.Title': 'Candidate 1', 'System.WorkItemType': 'Product Backlog Item', 'System.State': 'Approved',
      'System.IterationPath': 'Project\\S1', 'System.AreaPath': 'Project\\Team',
      'Microsoft.VSTS.Scheduling.Effort': 8, ...(init.method === 'PATCH' ? { 'System.AssignedTo': developer } : {}),
    } }), { headers: { 'Content-Type': 'application/json' } })
  })
  const host = await render(t)
  await click(trigger(host))
  assert.equal(host.querySelectorAll('input[type="radio"]').length, 2)
  assert.equal(host.querySelectorAll('input[type="text"], input[type="search"]').length, 0)
  assert.equal(/Created |Value |Priority order/.test(host.textContent!), false)
  assert.equal(host.textContent!.includes('Not estimated'), true)
  const queue = host.querySelector('[role="radiogroup"][aria-label="Available work items"]')!
  for (const [id, type] of [[1, 'Product Backlog Item'], [2, 'Bug']] as const) {
    const row = queue.querySelector(`input[value="${id}"]`)!.closest('label')!
    const typeIcon = row.querySelector(`[role="img"][aria-label="${type}"]`)!
    assert.ok(typeIcon)
    assert.equal(row.querySelector('strong')?.textContent, String(id))
    assert.doesNotMatch(row.textContent!, /#\d|\bpts\b|\bPBI\b|\bBug\b/)
  }
  assert.ok(queue.querySelector('input[value="1"]')!.closest('label')!.textContent!.includes('Effort 8'))
  assert.equal(button(host, 'Assign to Developer').disabled, true)
  await click(host.querySelector('input[value="1"]')!)
  assert.equal(writes, 0)
  await click(button(host, 'Assign to Developer'))
  assert.equal(writes, 1)
  const announced = () => [...host.querySelectorAll('[role="status"]')].map((status) => status.textContent)
  assert.equal(trigger(host).getAttribute('aria-expanded'), 'false')
  assert.equal(host.querySelectorAll('input[type="radio"]').length, 0)
  assert.equal(document.activeElement === trigger(host), true)
  assert.equal(announced().includes('#1 assigned to Developer.'), true)
  assert.equal(host.textContent!.includes('Candidate 1'), true, 'the assigned card joins the board')
  await click(trigger(host))
  assert.equal(announced().includes('#1 assigned to Developer.'), false)
  assert.equal(host.querySelectorAll('input[type="radio"]').length, 1)
  assert.equal(host.querySelectorAll('input[value="1"]').length, 0)
  await act(async () => host.querySelector('section[aria-label="Quick assign to Developer"]')!
    .dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(trigger(host).getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement === trigger(host), true)
})

const patchFailures: [string, () => Promise<Response>][] = [
  ['HTTP 403', async () => new Response('private diagnostics', { status: 403 })],
  ['HTTP 401', async () => new Response('private diagnostics', { status: 401 })],
  // Azure DevOps sends a missing-write-scope 401 without CORS headers, so the browser rejects fetch.
  ['a CORS-blocked 401', async () => { throw new TypeError('Failed to fetch') }],
]
for (const [name, patch] of patchFailures) {
  test(`${name} leaves candidates unrefreshed and names the missing PAT scope`, async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => init.method === 'PATCH'
      ? patch()
      : new Response(JSON.stringify({ id: 1, rev: 7, fields: {
        'System.WorkItemType': 'Product Backlog Item', 'System.State': 'Approved',
        'System.IterationPath': 'Project\\S1', 'System.AreaPath': 'Project\\Team',
      } }), { headers: { 'Content-Type': 'application/json' } }))
    const host = await render(t)
    await click(trigger(host))
    await click(host.querySelector('input[value="1"]')!)
    await click(button(host, 'Assign to Developer'))
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? '', /Work Items \(Read & write\).*Nothing was assigned/)
    assert.equal(host.querySelectorAll('input[type="radio"]').length, 2, 'an access failure does not refresh the list')
    assert.equal(host.textContent!.includes('assigned to Developer.'), false)
  })
}

test('Sprint view has no Quick assign action', async (t) => {
  const host = await render(t, { lens: 'sprint' })
  assert.equal(host.querySelectorAll('[aria-label^="Quick assign"]').length, 0)
  assert.equal(host.querySelectorAll('[data-column-toggle]').length, 0)
})

test('a filtered developer with no cards can still open the scoped unassigned queue', async (t) => {
  const host = await render(t, { emptyDeveloper: true })
  assert.equal(Boolean(trigger(host)), true)
  await click(trigger(host))
  assert.equal(host.querySelectorAll('input[type="radio"]').length, 2)
})

test('duplicate submissions are prevented and a late response cannot update a different scope', async (t) => {
  const pending = Promise.withResolvers<Response>()
  let writes = 0
  const fields = {
    'System.Title': 'Candidate 1', 'System.WorkItemType': 'Product Backlog Item', 'System.State': 'Approved',
    'System.IterationPath': 'Project\\S1', 'System.AreaPath': 'Project\\Team',
  }
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    if (init.method === 'PATCH') { writes++; return pending.promise }
    return new Response(JSON.stringify({ id: 1, rev: 7, fields }), { headers: { 'Content-Type': 'application/json' } })
  })
  const host = await render(t)
  await click(trigger(host))
  await click(host.querySelector('input[value="1"]')!)
  await click(button(host, 'Assign to Developer'))
  assert.equal(button(host, 'Assigning...').disabled, true)
  await click(button(host, 'Assigning...'))
  assert.equal(writes, 1)
  await click(button(host, 'Switch scope'))
  await act(async () => pending.resolve(new Response(JSON.stringify({
    id: 1, rev: 8, fields: { ...fields, 'System.AssignedTo': developer },
  }), { headers: { 'Content-Type': 'application/json' } })))
  assert.equal(host.textContent!.includes('#1 assigned to Developer.'), false)
  assert.equal(trigger(host).getAttribute('aria-expanded'), 'false')
  await click(trigger(host))
  assert.equal(host.querySelectorAll('input[type="radio"]').length, 2)
})
