import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'

for (const name of ['localStorage', 'sessionStorage']) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value: { getItem: () => null } })
  after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
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
const { DevelopmentCard } = await server.ssrLoadModule('/src/features/standup/components/DevelopmentCard.tsx')
const display = await server.ssrLoadModule('/src/features/standup/components/developmentCardDisplay.ts')

function render(props: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(Root, null, createElement(DevelopmentCard, props)))
}

function textOf(html: string) {
  const dom = new JSDOM(html)
  try {
    for (const style of dom.window.document.querySelectorAll('style')) style.remove()
    return dom.window.document.body.textContent ?? ''
  } finally {
    dom.window.close()
  }
}

const baseItem = {
  id: 4821,
  title: 'Add folder rename to the web client',
  state: 'In Progress',
  status: 'Active',
  workItemType: 'Product Backlog Item',
  effort: 5,
  sprintName: 'Sprint 42',
}

const passingChecks = {
  state: 'passing',
  checks: [{ name: 'Build', state: 'passing', optional: false, expired: false, source: 'policy' }],
}

test('column default states are recognized case- and whitespace-insensitively', () => {
  assert.equal(display.isDefaultColumnState('Active', 'In Progress'), true)
  assert.equal(display.isDefaultColumnState('Active', '  in   progress '), true)
  assert.equal(display.isDefaultColumnState('Review', 'In Code Review'), true)
  assert.equal(display.isDefaultColumnState('Done', 'Closed'), true)
  assert.equal(display.isDefaultColumnState('Blocked', 'On Hold'), true)
  assert.equal(display.isDefaultColumnState('Active', undefined), true)
  assert.equal(display.isDefaultColumnState('Review', 'Available for Testing'), false)
  assert.equal(display.isDefaultColumnState('Active', 'Failed Testing'), false)
  assert.equal(display.isDefaultColumnState('Done', 'In Progress'), false)
})

test('state badges use the outlined tone that matches their meaning', () => {
  assert.equal(display.getStateBadgeColor('Failed Testing'), 'error')
  assert.equal(display.getStateBadgeColor('available for testing'), 'info')
  assert.equal(display.getStateBadgeColor('Ready'), 'secondary')
})

test('the sprint is shown only when it differs from the current sprint', () => {
  assert.equal(display.shouldShowSprint('Sprint 42', 'Sprint 42'), false)
  assert.equal(display.shouldShowSprint('Sprint 41', 'Sprint 42'), true)
  assert.equal(display.shouldShowSprint('Sprint 41', null), true)
  assert.equal(display.shouldShowSprint(undefined, 'Sprint 42'), false)
})

test('quiet checks summary only surfaces a detail line for required checks that need attention', () => {
  const passing = display.getQuietChecksSummary(passingChecks)
  assert.equal(passing.tone, 'positive')
  assert.equal(passing.detail, undefined)
  assert.equal(passing.label, 'Required checks passing')

  const failing = display.getQuietChecksSummary({
    state: 'failing',
    checks: [{ name: 'Build', state: 'failing', optional: false, expired: false, source: 'policy' }],
  })
  assert.equal(failing.tone, 'critical')
  assert.equal(failing.detail, 'Build failing')
  assert.match(failing.label, /Required checks failing: Build/)

  const pending = display.getQuietChecksSummary({
    state: 'pending',
    checks: [{ name: 'Build', state: 'pending', optional: false, expired: true, source: 'policy' }],
  })
  assert.equal(pending.tone, 'attention')
  assert.equal(pending.detail, 'Build (expired) pending')

  const optionalOnly = display.getQuietChecksSummary({
    state: 'passing',
    checks: [{ name: 'Lint', state: 'failing', optional: true, expired: false, source: 'status' }],
  })
  assert.equal(optionalOnly.detail, undefined)
  assert.match(optionalOnly.label, /Optional checks failing: Lint/)

  const none = display.getQuietChecksSummary({ state: 'none', checks: [] })
  assert.equal(none.tone, 'neutral')

  const unavailable = display.getQuietChecksSummary({ state: 'unavailable', checks: [] })
  assert.equal(unavailable.tone, 'attention')
  assert.ok(unavailable.detail)
})

test('approval summary counts toward the required approvals', () => {
  assert.deepEqual(
    { text: display.getApprovalSummary({ approvalCount: 1 }).text, tone: display.getApprovalSummary({ approvalCount: 1 }).tone },
    { text: '1/2', tone: 'neutral' },
  )
  assert.equal(display.getApprovalSummary({ approvalCount: 3 }).tone, 'positive')
  assert.equal(display.getApprovalSummary({ approvalCount: 3 }).label, '3 of 2 approvals')
  assert.equal(display.getApprovalSummary({ approvalCount: 2, reviewState: 'rejected' }).text, 'Rejected')
  assert.equal(display.getApprovalSummary({ reviewState: 'waiting-for-author' }).tone, 'attention')
})

test('short ages round down to hours, days, then weeks', () => {
  const now = Date.parse('2026-03-10T12:00:00Z')
  assert.equal(display.formatShortAge('2026-03-10T11:30:00Z', now), 'now')
  assert.equal(display.formatShortAge('2026-03-10T09:00:00Z', now), '3h')
  assert.equal(display.formatShortAge('2026-03-08T12:00:00Z', now), '2d')
  assert.equal(display.formatShortAge('2026-02-10T12:00:00Z', now), '4w')
  assert.equal(display.formatShortAge(undefined, now), '')
  assert.equal(display.formatShortAge('not a date', now), '')
})

test('a quiet card drops details implied by the board and keeps effort as a labelled bubble', () => {
  const html = render({ item: baseItem, currentIterationName: 'Sprint 42' })
  const text = textOf(html)
  assert.match(text, /4821/)
  assert.match(text, /Add folder rename to the web client/)
  assert.match(text, /Effort 5/)
  assert.doesNotMatch(text, /In Progress/)
  assert.doesNotMatch(text, /Sprint 42/)
  assert.doesNotMatch(html, /scale\(1\.05\)/)
})

test('a quiet card shows state and sprint only when they add information', () => {
  const text = textOf(render({
    item: { ...baseItem, state: 'Failed Testing', sprintName: 'Sprint 41' },
    currentIterationName: 'Sprint 42',
  }))
  assert.match(text, /Failed Testing/)
  assert.match(text, /Sprint 41/)
})

test('a quiet card shows the sprint when the current sprint is unknown', () => {
  assert.match(textOf(render({ item: baseItem, currentIterationName: null })), /Sprint 42/)
})

test('linked PRs collapse to one quiet row with a detail line only for failing required checks', () => {
  const html = render({
    item: {
      ...baseItem,
      state: 'In Code Review',
      status: 'Review',
      activePullRequests: [
        { id: 912, title: 'Folder rename API', url: 'https://example.test/pr/912', approvalCount: 1, checks: passingChecks },
        {
          id: 913,
          title: 'Folder rename UI',
          url: 'https://example.test/pr/913',
          approvalCount: 2,
          checks: { state: 'failing', checks: [{ name: 'Unit tests', state: 'failing', optional: false, expired: false, source: 'policy' }] },
        },
      ],
    },
    currentIterationName: 'Sprint 42',
  })
  const text = textOf(html)
  assert.match(text, /912/)
  assert.match(text, /Folder rename API/)
  assert.match(text, /1\/2/)
  assert.match(text, /2\/2/)
  assert.match(text, /Unit tests failing/)
  assert.doesNotMatch(text, /In Code Review/)
  assert.match(html, /aria-label="1 of 2 approvals"/)
})

test('PR-only cards use the PR as the title and skip work item metadata', () => {
  const text = textOf(render({
    item: {
      id: 77,
      kind: 'pull-request',
      title: 'Unlinked PR',
      status: 'Review',
      sprintName: 'Sprint 40',
      pullRequest: { id: 77, title: 'Bump dependencies', url: 'https://example.test/pr/77', approvalCount: 0, checks: passingChecks },
    },
    currentIterationName: 'Sprint 42',
  }))
  assert.match(text, /77/)
  assert.match(text, /Bump dependencies/)
  assert.match(text, /0\/2/)
  assert.doesNotMatch(text, /Sprint 40/)
  assert.doesNotMatch(text, /Effort/)
})
