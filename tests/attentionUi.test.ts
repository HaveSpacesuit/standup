import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement, createRef } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { WorkItemSummary } from '../src/ado/types.ts'
import type { AttentionItemsState } from '../src/features/standup/hooks/useAttentionItems.ts'
import type { WorkItemPreviewSource } from '../src/features/standup/hooks/useWorkItemPreview.ts'
import type { WorkItemEditor } from '../src/features/standup/hooks/useWorkItemEditor.ts'
import type { WorkItemFieldChanges } from '../src/ado/workItemUpdateApi.ts'

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
const { QualityAssurancePage } = await server.ssrLoadModule('/src/features/standup/pages/QualityAssurancePage.tsx')
const { createDefaultQaOptions } = await server.ssrLoadModule('/src/features/standup/utils/standupOptionDefaults.ts')
const { useAttentionItems } = await server.ssrLoadModule('/src/features/standup/hooks/useAttentionItems.ts')
const { AdoQueryEngine } = await server.ssrLoadModule('/src/ado/queryEngine.ts')
const { WorkItemEditingProvider } = await server.ssrLoadModule('/src/features/standup/components/WorkItemEditing.tsx')
const team = { id: 'team', displayName: 'Atlas', orgName: 'org', projectName: 'Project', areaPath: 'Project\\Team' }
const items: WorkItemSummary[] = [
  { id: 1, title: 'Ready bug', status: 'Review', state: 'Ready for Testing', workItemType: 'Bug', tags: ['E2E', 'Release'], sprintName: 'S1', workItemUrl: 'https://dev.azure.com/org/Project/_workitems/edit/1' },
  { id: 2, title: 'Old active task', status: 'Active', state: 'Active', workItemType: 'Task', tags: ['Release'], sprintName: 'Old', assignedTo: { displayName: 'Taylor' }, workItemUrl: 'https://dev.azure.com/org/Project/_workitems/edit/2' },
]
const attention: AttentionItemsState = { items, loading: false, error: null, syncedAt: Date.now() }
const props = () => ({
  patConfigured: true, teamOptions: [team], selectedTeamId: team.id, onTeamChange: () => {},
  teamManagementUrl: '', quickFilterInput: '', onQuickFilterInputChange: () => {}, onQuickFilterClear: () => {},
  quickFilterInputRef: createRef<HTMLInputElement>(),
  buckets: [{ id: 'needs-testing', title: 'Ready for QA', items: [items[0]] }],
  updatesByItemId: {}, boardItems: [], currentIterationName: 'S1', teamMembers: [],
  testers: [], testersInferred: false, compactCards: false, lookbackDays: 21,
  onRefresh: () => {}, isLoading: false, newItemsError: null, historyWarning: null,
  qaOptions: createDefaultQaOptions(), onQaOptionsChange: () => {},
  cardHighlightOptions: { freshDays: 1, staleDays: 7 }, onCardHighlightOptionsChange: () => {},
  projectWorkItemStates: [], projectWorkItemTypes: [], projectWorkItemStatesLoading: false,
  teamIterations: [], teamIterationsLoading: false, attention,
  projectWorkItemStatesByType: { bug: [{ name: 'Ready for Testing', category: 'Resolved' }], task: [{ name: 'Active', category: 'InProgress' }] },
})
async function hostFor(t: TestContext) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  return { host, root }
}
const click = (element: Element) => act(async () => (element as HTMLElement).click())
const button = (host: Element, name: string) => [...host.querySelectorAll('button')].find((element) => element.textContent?.trim() === name)!

test('QA keeps tagged extras out of workflow columns, badges current cards, and opens the broader tag lens without duplicate rows', async (t) => {
  const { host, root } = await hostFor(t)
  const page = props()
  await act(async () => root.render(createElement(Root, null, createElement(QualityAssurancePage, page))))
  assert.match(host.textContent!, /1 not shown on the current QA board/)
  assert.equal(host.textContent!.includes('Old active task'), false)
  assert.ok(host.querySelector('[aria-label="Attention tags"]'))
  await click(button(host, 'Review 2 open items'))
  assert.equal(host.querySelectorAll('tbody tr').length, 2)
  assert.match(host.textContent!, /2 open tagged items.*1 unassigned.*1 not on current QA board/)
  await click(button(host, 'E2E · 1'))
  assert.equal(host.querySelectorAll('tbody tr').length, 1)
  assert.match(host.textContent!, /1 of 2 open tagged items/)
  await click(button(host, 'Flow'))
  assert.equal(host.textContent!.includes('Old active task'), false)
  assert.equal(page.quickFilterInput, '')
  await click(button(host, 'Manage tags'))
  assert.ok(document.querySelector('input[placeholder]') || document.body.textContent!.includes('Add attention tag'))
})

test('loading/error/disabled states cannot masquerade as zero, and Attention works even if QA iteration data fails', async (t) => {
  const { host, root } = await hostFor(t)
  const page = props()
  page.attention = { items: [], loading: true, error: null, syncedAt: null }
  await act(async () => root.render(createElement(Root, null, createElement(QualityAssurancePage, page))))
  assert.match(host.textContent!, /Checking open tagged items/)
  assert.equal(host.textContent!.includes('Review 0 open items'), false)
  page.attention = { items: [], loading: false, error: 'Check failed', syncedAt: null }
  await act(async () => root.render(createElement(Root, null, createElement(QualityAssurancePage, page))))
  assert.match(host.querySelector('[role="alert"]')!.textContent!, /Counts are unknown, not zero/)
  page.attention = attention
  await act(async () => root.render(createElement(Root, null, createElement(QualityAssurancePage, { ...page, teamIterationsError: 'Iterations unavailable' }))))
  await click(button(host, 'Attention 2'))
  assert.equal(host.querySelectorAll('tbody tr').length, 2)
  assert.match(host.textContent!, /QA board coverage unavailable/)
  page.qaOptions.attentionTags = []
  await act(async () => root.render(createElement(Root, null, createElement(QualityAssurancePage, page))))
  assert.match(host.textContent!, /Attention tracking is off/)
})

test('large attention results keep complete counts while rendering incrementally and resetting the limit for a new lens', async (t) => {
  const { host, root } = await hostFor(t)
  const page = props()
  page.attention = {
    ...attention,
    items: Array.from({ length: 75 }, (_, index) => ({
      ...items[0], id: 100 + index, title: `Attention item ${index}`,
      tags: [index % 3 === 0 ? 'E2E' : 'Release'],
    })),
  }
  await act(async () => root.render(createElement(Root, null, createElement(QualityAssurancePage, page))))
  await click(button(host, 'Review 75 open items'))
  assert.equal(host.querySelectorAll('tbody tr').length, 50)
  assert.match(host.textContent!, /75 of 75 open tagged items/)
  await click(button(host, 'Show more (25 remaining)'))
  assert.equal(host.querySelectorAll('tbody tr').length, 75)
  await click(button(host, 'E2E · 25'))
  assert.equal(host.querySelectorAll('tbody tr').length, 25)
  await click(button(host, 'All tags · 75'))
  assert.equal(host.querySelectorAll('tbody tr').length, 50)
})

test('Attention preview supports keyboard navigation, Escape focus restoration, and closing on team changes', async (t) => {
  const { host, root } = await hostFor(t)
  const source: WorkItemPreviewSource = {
    key: 'attention-preview',
    load: async (id) => ({ id, text: {}, attachments: [], comments: [], commentCount: 0, links: [], hyperlinks: [], developmentLinks: 0 }),
    peek: () => undefined,
    images: { canLoad: () => false, load: () => null },
  }
  const page = { ...props(), attentionPreview: source }
  await act(async () => root.render(createElement(Root, null, createElement(QualityAssurancePage, page))))
  await click(button(host, 'Review 2 open items'))
  const toggle = host.querySelector<HTMLButtonElement>('[data-preview-toggle="1"]')!
  await act(async () => toggle.focus())
  await click(toggle)
  assert.ok(host.querySelector('aside'))
  await act(async () => { toggle.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
  const nextToggle = host.querySelector<HTMLButtonElement>('[data-preview-toggle="2"]')!
  assert.equal(nextToggle.getAttribute('aria-pressed'), 'true')
  assert.equal(document.activeElement, nextToggle)
  const close = host.querySelector<HTMLButtonElement>('aside [aria-label="Close preview"]')!
  assert.ok(close)
  await act(async () => close.focus())
  await act(async () => { close.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
  assert.equal(host.querySelector('aside'), null)
  assert.equal(document.activeElement, nextToggle)
  await click(nextToggle)
  await act(async () => root.render(createElement(Root, null, createElement(QualityAssurancePage, {
    ...page, selectedTeamId: 'other', teamOptions: [team, { ...team, id: 'other', displayName: 'Other' }],
  }))))
  assert.equal(host.querySelector('aside'), null)
})

test('attention hook hides old team data immediately, ignores late replies, and skips disabled queries', async (t) => {
  const { host, root } = await hostFor(t)
  const engine = new AdoQueryEngine('nonfunctional-test-token')
  const replies: Array<{ resolve: (value: typeof attention) => void; reject: (error: Error) => void }> = []
  t.mock.method(engine, 'getAttentionItems', () => new Promise((resolve, reject) => { replies.push({ resolve, reject }) }))
  let current: typeof attention
  const stableTeams = { a: { ...team, id: 'a' }, b: { ...team, id: 'b' } }
  function StableHarness({ teamId, tags = ['Release'] }: { teamId: 'a' | 'b'; tags?: string[] }) {
    current = useAttentionItems({ engine, team: stableTeams[teamId], tags, enabled: true, reloadNonce: 0 })
    return createElement('p', null, current.error ?? (current.loading ? 'Loading' : current.items.map((item) => item.title).join(', ')))
  }
  await act(async () => root.render(createElement(StableHarness, { teamId: 'a' })))
  await act(async () => root.render(createElement(StableHarness, { teamId: 'b' })))
  assert.equal(host.textContent, 'Loading')
  await act(async () => replies[0].resolve(attention))
  assert.equal(host.textContent, 'Loading')
  await act(async () => replies[1].reject(new Error('Attention failed')))
  assert.equal(host.textContent, 'Attention failed')
  await act(async () => root.render(createElement(StableHarness, { teamId: 'b', tags: [] })))
  assert.equal(host.textContent, '')
  assert.equal(replies.length, 2)
})

test('Backlog-style Attention rows open and save each cell editor without opening the preview', async (t) => {
  const { host, root } = await hostFor(t)
  const bug = { ...items[0], workItemIconUrl: 'data:image/svg+xml,%3Csvg/%3E', severity: '2 - High', priority: 2, effort: 8, iterationPath: 'Project\\S1', tags: ['Release', 'Other'] }
  const pbi = { ...items[1], workItemType: 'Product Backlog Item', workItemIconUrl: 'data:image/svg+xml,%3Csvg/%3E' }
  const iterations = [{ id: 's1', name: 'S1', path: 'Project\\S1', timeFrame: 'current' as const, startDate: '2026-11-01', finishDate: '2026-11-30' }]
  const person = { displayName: 'Taylor', uniqueName: 'taylor@example.invalid', imageUrl: undefined }
  const saves: Array<{ id: number; type?: string; changes: WorkItemFieldChanges }> = []
  const editor: WorkItemEditor = {
    options: {
      statesFor: () => [{ name: 'Ready for Testing', category: 'Resolved' }, { name: 'Active', category: 'InProgress' }],
      iterations, backlogPath: 'Project', members: [person], knownTags: ['Release', 'Other'], effortSuggestions: [3, 5], tagRules: [],
    },
    lockedReason: null, canEdit: () => true, canReload: () => true, isBusy: () => false,
    save: async (item, changes) => { saves.push({ id: item.id, type: item.workItemType, changes }); return true },
    reload: async () => {}, notify: () => {}, toast: null, dismissToast: () => {},
  }
  const source: WorkItemPreviewSource = {
    key: 'cell-edit-preview',
    load: async (id) => ({ id, text: {}, attachments: [], comments: [], commentCount: 0, links: [], hyperlinks: [], developmentLinks: 0 }),
    peek: () => undefined, images: { canLoad: () => false, load: () => null },
  }
  const page = { ...props(), teamIterations: iterations, attention: { ...attention, items: [bug, pbi] }, attentionPreview: source }
  await act(async () => root.render(createElement(Root, null,
    createElement(WorkItemEditingProvider, { editor }, createElement(QualityAssurancePage, page)))))
  await click(button(host, 'Review 2 open items'))
  assert.deepEqual([...host.querySelectorAll('thead th')].map((cell) => cell.textContent), [
    'Item', 'Severity', 'Impact', 'Effort', 'Age', 'Sprint', 'State', 'Assigned to', 'QA board visibility',
  ])
  const row = host.querySelector('tbody tr')!
  assert.ok(row.querySelector('th[scope="row"] [role="img"][aria-label="Bug"]'))
  assert.ok(host.querySelector('tbody tr:nth-child(2) [role="img"][aria-label="Product Backlog Item"]'))
  assert.match(row.textContent!, /Other/)
  assert.match(row.textContent!, /This sprint/)
  assert.equal(host.querySelector('tbody tr:nth-child(2) [data-edit-field="severity"]'), null)
  for (const [field, choice, expected] of [
    ['severity', '1 - Critical', { severity: '1 - Critical' }],
    ['priority', 'Impact 1', { priority: 1 }],
    ['effort', '5', { effort: 5 }],
    ['iterationPath', 'Project (no sprint)', { iterationPath: 'Project' }],
    ['state', 'Active', { state: 'Active' }],
    ['assignedTo', 'Taylor', { assignedTo: person }],
    ['tags', 'Save tags', { tags: ['Other', 'Release'] }],
  ] as const) {
    const trigger = row.querySelector<HTMLButtonElement>(`[data-edit-field="${field}"]`)!
    await act(async () => trigger.focus())
    await click(trigger)
    const dialog = document.querySelector('[role="dialog"]')!
    assert.ok(dialog, `${field} opens its editor`)
    assert.equal(host.querySelector('aside'), null, `${field} does not open the preview`)
    const option = [...dialog.querySelectorAll('button, [role="menuitemradio"]')]
      .find((element) => element.textContent?.includes(choice))!
    assert.ok(option, `${field}: expected ${choice} in ${dialog.textContent}`)
    await click(option)
    assert.deepEqual(saves.at(-1), { id: bug.id, type: 'Bug', changes: expected })
  }
  await click(row.querySelector('td:last-child')!)
  assert.ok(host.querySelector('aside'), 'noninteractive row content still opens the preview')
  await act(async () => root.render(createElement(Root, null,
    createElement(WorkItemEditingProvider, { editor: { ...editor, canEdit: () => false } }, createElement(QualityAssurancePage, page)))))
  assert.equal(host.querySelector('tbody [data-edit-field]'), null, 'read-only sessions keep the values without editing controls')
  assert.match(host.querySelector('tbody')!.textContent!, /Other/)
})
