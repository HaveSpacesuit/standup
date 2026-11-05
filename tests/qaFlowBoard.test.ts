import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import type { WorkItemSummary, WorkItemUpdate } from '../src/ado/queryEngine.ts'
import { DEFAULT_CARD_HIGHLIGHT_OPTIONS } from '../src/features/standup/utils/cardHighlightOptions.ts'
import { parseStoredQaOptions } from '../src/features/standup/utils/qaOptions.ts'

for (const name of ['localStorage', 'sessionStorage']) {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: { getItem: () => null, setItem: () => {} },
  })
  after(() => {
    if (storageDescriptor) Object.defineProperty(globalThis, name, storageDescriptor)
    else Reflect.deleteProperty(globalThis, name)
  })
}

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { QaFlowBoard } = await server.ssrLoadModule('/src/features/standup/components/QaFlowBoard.tsx')

const ago = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
const tester = { displayName: 'Taylor Reed', uniqueName: 'taylor@example.test' }
const filed = {
  id: 501,
  title: 'Recent report',
  state: 'New',
  createdAt: ago(4),
  status: 'New',
  workItemUrl: 'https://example.test/workitems/501',
} satisfies WorkItemSummary
const ready = {
  id: 502,
  title: 'Ready to verify',
  state: 'Available for Testing',
  createdAt: ago(8),
  recentActivityAt: ago(4),
  sprintName: 'Sprint 15',
  assignedTo: tester,
  status: 'Review',
  workItemUrl: 'https://example.test/workitems/502',
} satisfies WorkItemSummary
const sentBack = {
  id: 503,
  title: 'Failed twice',
  state: 'Failed Testing',
  createdAt: ago(12),
  recentActivityAt: ago(2),
  sprintName: 'Sprint 15',
  status: 'Active',
  workItemUrl: 'https://example.test/workitems/503',
} satisfies WorkItemSummary
const removed = {
  id: 504,
  title: 'No longer needed',
  state: 'Removed',
  createdAt: ago(11),
  recentActivityAt: ago(1),
  sprintName: 'Sprint 15',
  status: 'Done',
  workItemUrl: 'https://example.test/workitems/504',
} satisfies WorkItemSummary
const comingUp = {
  id: 505,
  title: 'Approved change',
  state: 'In Code Review',
  sprintName: 'Sprint 15',
  status: 'Review',
  workItemUrl: 'https://example.test/workitems/505',
  activePullRequests: [{
    id: 905,
    title: 'Approved change',
    url: 'https://example.test/pullrequest/905',
    approvalCount: 2,
    checks: {
      state: 'passing',
      total: 1,
      passing: 1,
      pending: 0,
      failing: 0,
      failingNames: [],
      checks: [{ name: 'Build', state: 'passing', optional: false, expired: false, source: 'build' }],
    },
  }],
} satisfies WorkItemSummary

const updates: Record<number, WorkItemUpdate[]> = {
  [ready.id]: [{
    revisedDate: ago(4),
    fields: { 'System.State': { oldValue: 'Active', newValue: 'Available for Testing' } },
  }],
  [sentBack.id]: [
    { revisedDate: ago(5), revisedBy: tester, fields: { 'System.State': { oldValue: 'Available for Testing', newValue: 'Active' } } },
    { revisedDate: ago(4), revisedBy: tester, fields: { 'System.State': { oldValue: 'Active', newValue: 'Ready for Testing' } } },
    { revisedDate: ago(2), revisedBy: tester, fields: { 'System.State': { oldValue: 'Ready for Testing', newValue: 'Failed Testing' } } },
  ],
  [removed.id]: [{
    revisedDate: ago(1),
    revisedBy: tester,
    fields: { 'System.State': { oldValue: 'Available for Testing', newValue: 'Removed' } },
  }],
}

function render(view: 'flow' | 'testers' = 'flow', standupActive = false, overrides: Record<string, unknown> = {}) {
  const buckets = [
    { id: 'new', title: 'Newly added', items: [filed] },
    { id: 'needs-testing', title: 'Ready for QA', items: [ready] },
    { id: 'needs-development', title: 'Back in development', items: [sentBack] },
    { id: 'done', title: 'Recently completed', items: [removed] },
  ] as const
  const props = {
    buckets,
    updatesByItemId: updates,
    boardItems: [comingUp],
    currentIterationName: 'Sprint 15',
    teamIterations: [
      { name: 'Sprint 15', path: 'Project\\Sprint 15', timeFrame: 'current' as const, startDate: ago(6).slice(0, 10), finishDate: ago(-4).slice(0, 10) },
      { name: 'Sprint 16', path: 'Project\\Sprint 16', timeFrame: 'future' as const },
    ],
    testers: [tester],
    testersInferred: false,
    lookbackDays: 21,
    compactCards: false,
    cardHighlightOptions: DEFAULT_CARD_HIGHLIGHT_OPTIONS,
    view,
    standupActive,
    onStandupEnd: () => {},
    ...overrides,
  }
  return renderToStaticMarkup(createElement(Root, null, createElement(QaFlowBoard, props)))
}

test('QA flow follows the testing journey and surfaces its timing and attention signals', () => {
  const html = render()
  const columnOrder = ['new', 'coming', 'needs-testing', 'needs-development', 'done']
    .map((id) => html.indexOf(`data-qa-column="${id}"`))
  assert.deepEqual(columnOrder, [...columnOrder].sort((a, b) => a - b))
  assert.match(html, /Last 21 days/)
  assert.match(html, /Needs a tester/)
  assert.match(html, /Testing/)
  assert.match(html, /Waiting 3\+ days/)
  assert.match(html, /Failed testing/)
  assert.match(html, /Likely today/)
  assert.match(html, /No sprint/)
  assert.match(html, /No longer needed/)
  assert.match(html, /line-through/)
})

test('QA flow shrinks empty columns to rails that can be expanded, and Coming up can collapse', () => {
  const html = render('flow', false, { buckets: [{ id: 'new', title: 'Newly added', items: [filed] }] })
  assert.match(html, /<section[^>]*aria-labelledby="qa-column-needs-development"[^>]*data-qa-column="needs-development"/)
  assert.match(html, /aria-label="Expand Back in development, no cards"/)
  assert.match(html, /Back in development · none/)
  assert.doesNotMatch(html, /aria-label="Expand Newly added/)
  assert.match(html, /aria-label="Collapse Coming up"/)
  assert.doesNotMatch(html, /aria-label="Collapse Newly added"/)
})

test('QA testers view provides lanes and reuses the standup presenter', () => {
  const html = render('testers', true)
  assert.match(html, /Taylor Reed/)
  assert.match(html, /Needs a tester/)
  assert.match(html, /Everyone else/)
  assert.match(html, /Speaking order/)
  assert.match(html, /Now speaking/)
})

test('QA testers view explains how to choose testers when none are found', () => {
  const html = render('testers', false, { testers: [], testersInferred: true, onChooseTesters: () => {} })
  assert.match(html, /Testers · 0/)
  assert.match(html, /No QA testers found in recent QA activity\./)
  assert.match(html, /Choose testers/)
  assert.doesNotMatch(html, /Taylor Reed/)
})

test('QA testers view marks inferred testers', () => {
  const inferred = render('testers', false, { testersInferred: true, onChooseTesters: () => {} })
  assert.match(inferred, /aria-label="Testers are inferred from recent QA activity\. Choose testers"/)
  assert.doesNotMatch(render('testers'), /inferred from recent QA activity/)
})

test('stored QA options retain the tester selection and older options infer testers', () => {
  assert.deepEqual(parseStoredQaOptions(JSON.stringify({ testers: ['Taylor Reed'] })).testers, ['Taylor Reed'])
  assert.deepEqual(parseStoredQaOptions(null).testers, [])
})
