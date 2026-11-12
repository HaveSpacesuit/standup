import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
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
const { QualityAssuranceLoadingState } = await server.ssrLoadModule('/src/features/standup/components/QualityAssuranceLoadingState.tsx')
const { QaColumnHeader } = await server.ssrLoadModule('/src/features/standup/components/QaColumnHeader.tsx')
const { default: checkmarkIcon } = await server.ssrLoadModule('@stratakit/icons/checkmark.svg')
const { getItemHistory, getQaLaneFlags, getQaStandupOrder, columnCaption } = await server.ssrLoadModule('/src/features/standup/components/qaBoardModel.ts')
const { bucketQualityAssuranceItems, resolveQualityAssuranceProjectConfig } =
  await server.ssrLoadModule('/src/features/standup/utils/qualityAssuranceBuckets.ts')

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
    reviewPolicy: { requiredApprovals: 2, state: 'passing' },
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

function withDocument<T>(html: string, read: (document: Document) => T): T {
  const dom = new JSDOM(html)
  try {
    for (const style of dom.window.document.querySelectorAll('style')) style.remove()
    return read(dom.window.document)
  } finally {
    dom.window.close()
  }
}

for (const view of ['flow', 'testers'] as const) {
  test(`QA ${view} preserves the attention ranking of Newly added cards within a lane`, () => {
    const config = resolveQualityAssuranceProjectConfig({ id: 'team', projectName: 'project' })
    const candidates = [
      { ...filed, id: 501, title: 'Older minor report', createdAt: ago(20), sprintName: 'Sprint 1' },
      { ...filed, id: 506, title: 'Fresh report', createdAt: ago(0), sprintName: 'Sprint 99' },
      { ...filed, id: 507, title: 'Fresh urgent triage', createdAt: ago(0), tags: ['Triage'], severity: '1 - Critical', priority: 1 },
    ].map((item) => ({ ...item, createdBy: tester }))
    const buckets = bucketQualityAssuranceItems(candidates, {}, config)
    withDocument(render(view, false, { buckets, boardItems: [] }), (document) => {
      const text = document.body.textContent!
      assert.ok(text.includes('Fresh urgent triage'))
      assert.ok(text.indexOf('Fresh urgent triage') < text.indexOf('Fresh report'))
      assert.ok(text.indexOf('Fresh report') < text.indexOf('Older minor report'))
    })
  })
}

test('QA history distinguishes assignment changes and still gives state changes priority', () => {
  const changedAt = ago(0.5)
  for (const oldValue of [undefined, null, '', {}, { displayName: '  ' }]) {
    const history = getItemHistory(ready, [{
      revisedDate: changedAt,
      fields: { 'System.AssignedTo': { oldValue, newValue: tester } },
    }])
    assert.equal(history.reason, 'Assigned')
    assert.equal(history.changedAt, changedAt)
  }

  for (const oldValue of [{ uniqueName: 'dev@example.test' }, { name: 'Developer' }, 'Developer <dev@example.test>']) {
    assert.equal(getItemHistory(ready, [{
      revisedDate: changedAt,
      fields: { 'System.AssignedTo': { oldValue, newValue: tester } },
    }]).reason, 'Reassigned')
  }

  assert.equal(getItemHistory(ready, [
    { fields: { 'System.AssignedTo': { newValue: { uniqueName: 'dev@example.test' } } } },
    { revisedDate: changedAt, fields: { 'System.AssignedTo': { newValue: tester } } },
  ]).reason, 'Reassigned', 'earlier history supplies the previous assignee when oldValue is omitted')

  assert.equal(getItemHistory(ready, [{
    revisedDate: changedAt,
    fields: { 'System.AssignedTo': { oldValue: tester, newValue: '' } },
  }]).reason, 'Unassigned')

  assert.equal(getItemHistory(ready, [{
    revisedDate: changedAt,
    fields: {
      'System.State': { oldValue: 'Active', newValue: 'Available for Testing' },
      'System.AssignedTo': { newValue: tester },
      'System.Tags': { newValue: 'QA' },
    },
  }]).reason, 'Moved to Available for Testing')
})

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

test('Likely today follows each PR reviewer policy, including no-review changes', () => {
  const caption = (approvalCount: number, reviewPolicy: unknown, reviewState?: string) => columnCaption({
    ...comingUp,
    activePullRequests: [{ ...comingUp.activePullRequests[0], approvalCount, reviewPolicy, reviewState }],
  }, 'coming', {}, Date.now())
  assert.equal(caption(0, { requiredApprovals: 0, state: 'passing' }), 'Likely today')
  assert.equal(caption(1, { requiredApprovals: 1, state: 'passing' }), 'Likely today')
  assert.equal(caption(2, { requiredApprovals: 3, state: 'pending' }), undefined)
  assert.equal(caption(3, { requiredApprovals: 1, state: 'failing' }), undefined)
  assert.equal(caption(3, undefined), undefined)
  assert.equal(caption(1, { requiredApprovals: 1, state: 'passing' }, 'waiting-for-author'), undefined)
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

test('QA rails share the Development rail mark: a color bar over the count, checked only when empty', () => {
  const rail = (count: number) => {
    const html = renderToStaticMarkup(createElement(Root, null, createElement(QaColumnHeader, { id: 'coming', count, rail: true, onToggle: () => {} })))
    const dom = new JSDOM(html)
    try {
      const button = dom.window.document.querySelector('[data-qa-column-rail] button')!
      const mark = button.querySelector('[data-column-rail-mark]')
      mark?.querySelectorAll('style').forEach((style) => style.remove())
      return {
        mark,
        checked: [...button.querySelectorAll('use')].some((use) => use.getAttribute('href') === `${checkmarkIcon}#icon`),
        text: mark?.textContent,
        label: button.getAttribute('aria-label'),
      }
    } finally {
      dom.window.close()
    }
  }

  const empty = rail(0)
  assert.ok(empty.mark)
  assert.equal(empty.checked, true)
  assert.equal(empty.text, '0')
  assert.equal(empty.label, 'Expand Coming up, no cards')

  // A collapsed Coming up that still holds cards must not read as all clear.
  const holding = rail(3)
  assert.ok(holding.mark)
  assert.equal(holding.checked, false)
  assert.equal(holding.text, '3')
  assert.equal(holding.label, 'Expand Coming up, 3 cards')
})

test('QA testers view gives each tester a lane, followed by work without a tester', () => {
  withDocument(render('testers'), (document) => {
    assert.deepEqual(
      [...document.querySelectorAll('[data-lane]')].map((lane) => lane.getAttribute('data-lane')),
      ['Taylor Reed', '__needs_tester__', '__everyone_else__'],
    )
    assert.ok(document.querySelector('[data-qa-cell="Taylor Reed:needs-testing"] [data-qa-card="502"]'))
    assert.ok(document.querySelector('[data-qa-cell="Taylor Reed:done"] [data-qa-card="504"]'))
    assert.ok(document.querySelector('[data-qa-cell="__needs_tester__:coming"] [data-qa-card="505"]'))
    assert.match(document.querySelector('[data-lane="Taylor Reed"]')?.textContent ?? '', /open · 1 done/)

    // Other people's QA activity stays tucked away behind the testers until someone opens it.
    assert.ok(document.querySelector('[data-lane="__everyone_else__"]')?.hasAttribute('data-lane-collapsed'))
    assert.equal(document.querySelector('[data-qa-card="501"]'), null)
    assert.ok(document.querySelector('[data-collapsed-cell]'))
  })
})

test('QA testers view leaves out the shared lanes when they have no cards', () => {
  withDocument(render('testers', false, { boardItems: [], buckets: [] }), (document) => {
    assert.deepEqual(
      [...document.querySelectorAll('[data-lane]')].map((lane) => lane.getAttribute('data-lane')),
      ['Taylor Reed'],
    )
  })
})

test('QA testers view grows its column backgrounds with the lanes instead of stopping at the first screen', () => {
  const dom = new JSDOM(render('testers'))
  try {
    const { document } = dom.window
    const styles = [...document.querySelectorAll('style')].map((style) => style.textContent ?? '')
    const getStyles = (element: Element) => styles.filter((css) =>
      [...element.classList].some((className) => css.includes(`.${className}{`)),
    ).join('')
    const cardsArea = document.querySelector('[data-qa-board-column="new"]')?.parentElement?.parentElement
    const content = cardsArea?.parentElement
    assert.ok(cardsArea && content)
    assert.ok(content.parentElement?.hasAttribute('data-qa-scroll-container'))
    assert.match(getStyles(content), /flex-shrink:0;/)
    assert.match(getStyles(cardsArea), /flex:1 0 auto;/)
  } finally {
    dom.window.close()
  }
})

test('QA standup takes turns through the testers and opens only the speaker’s lane', () => {
  withDocument(render('testers', true), (document) => {
    assert.ok(document.querySelector('[data-lane="Taylor Reed"]')?.hasAttribute('data-lane-presenting'))
    assert.ok(!document.querySelector('[data-lane="Taylor Reed"]')?.hasAttribute('data-lane-collapsed'))
    for (const lane of ['__needs_tester__', '__everyone_else__']) {
      assert.ok(document.querySelector(`[data-lane="${lane}"]`)?.hasAttribute('data-lane-collapsed'), lane)
    }
    assert.deepEqual(
      [...document.querySelectorAll('ol[aria-label="Speaking order"] [data-queue-state]')].map((speaker) => speaker.getAttribute('aria-label')),
      ['Taylor Reed'],
    )
    assert.match(document.body.textContent ?? '', /Now speaking: Taylor Reed, 1 of 1/)
    // Lane toggles pause while standup decides which lane is open.
    assert.equal(document.querySelector('button[aria-label$="all lanes"]'), null)
  })
})

test('QA lane flags put the most urgent signals first and skip ones that need no follow-up', () => {
  const signals = new Map([
    [1, new Set(['waiting', 'unassigned'])],
    [2, new Set(['failed', 'changed'])],
    [3, new Set(['failed', 'bounced'])],
  ])
  assert.deepEqual(
    getQaLaneFlags([{ id: 1 }, { id: 2 }, { id: 3 }], signals).map((flag: { label: string }) => flag.label),
    ['2 failed testing', '1 bounced 2+ times', '1 waiting 3d+'],
  )
})

test('QA standup can call on the testers with the most to discuss first', () => {
  const rows = [{ key: 'blair', label: 'Blair' }, { key: 'alex', label: 'Alex' }, { key: 'casey', label: 'Casey' }]
  const scores = new Map([['alex', 1], ['blair', 5], ['casey', 1]])
  assert.deepEqual(getQaStandupOrder(rows, 'alphabetical', scores), ['alex', 'blair', 'casey'])
  assert.deepEqual(getQaStandupOrder(rows, 'attention', scores), ['blair', 'alex', 'casey'])
})

test('QA testers view explains how to choose testers when none are found', () => {
  const html = render('testers', false, { testers: [], testersInferred: true, onChooseTesters: () => {} })
  withDocument(html, (document) => {
    assert.match(document.body.textContent ?? '', /Testers · 0 \(0 testers\)/)
    // Without testers every card is in the shared lanes, so neither starts collapsed.
    assert.deepEqual(
      [...document.querySelectorAll('[data-lane]')].map((lane) => [lane.getAttribute('data-lane'), lane.hasAttribute('data-lane-collapsed')]),
      [['__needs_tester__', false], ['__everyone_else__', false]],
    )
  })
  assert.match(html, /No QA testers found in recent QA activity\./)
  assert.match(html, /Choose testers/)
})

test('QA testers view marks inferred testers', () => {
  const inferred = render('testers', false, { testersInferred: true, onChooseTesters: () => {} })
  assert.match(inferred, /aria-label="Testers are inferred from recent QA activity\. Choose testers"/)
  assert.doesNotMatch(render('testers'), /inferred from recent QA activity/)
})

test('QA loading skeleton mirrors the open view, with tester lanes only in the Testers view', () => {
  for (const view of ['flow', 'testers'] as const) {
    const html = renderToStaticMarkup(createElement(Root, null, createElement(QualityAssuranceLoadingState, { view })))
    withDocument(html, (document) => {
      assert.equal(document.querySelector('section[aria-label="Sprint and QA flow"]')?.getAttribute('aria-busy'), 'true', view)
      assert.match(document.body.textContent ?? '', /Loading QA activity\.\.\./, view)
      // Each skeleton lane head starts with an avatar.
      assert.equal(document.querySelectorAll('.MuiSkeleton-circular').length, view === 'testers' ? 4 : 0, view)
    })
  }
})

test('stored QA options retain the tester selection and older options infer testers', () => {
  assert.deepEqual(parseStoredQaOptions(JSON.stringify({ testers: ['Taylor Reed'] })).testers, ['Taylor Reed'])
  assert.deepEqual(parseStoredQaOptions(null).testers, [])
})
