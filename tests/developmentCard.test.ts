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
    item: { ...baseItem, status: 'Review', state: 'Available for Testing', sprintName: 'Sprint 41' },
    currentIterationName: 'Sprint 42',
  }))
  assert.match(text, /Available for Testing/)
  assert.match(text, /Sprint 41/)
})

test('a quiet card shows the sprint when the current sprint is unknown', () => {
  assert.match(textOf(render({ item: baseItem, currentIterationName: null })), /Sprint 42/)
})

test('linked PRs collapse to one quiet row followed by the next step for each PR', () => {
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
  assert.match(text, /Needs 1 more approval/)
  assert.match(text, /Reviewers/)
  assert.match(text, /Fix failing check: Unit tests/)
  assert.doesNotMatch(text, /In Code Review/)
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
  assert.match(text, /Needs 2 approvals/)
  assert.doesNotMatch(text, /Sprint 40/)
  assert.doesNotMatch(text, /Effort/)
})

const pr = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  title: 'PR',
  url: 'https://example.test/pr/1',
  approvalCount: 0,
  checks: passingChecks,
  ...overrides,
})

test('PR next step follows the documented priority order', () => {
  const failingChecks = { state: 'failing', checks: [{ name: 'Build', state: 'failing', optional: false, expired: false, source: 'policy' }] }
  const pendingChecks = { state: 'pending', checks: [{ name: 'Build', state: 'pending', optional: false, expired: false, source: 'policy' }] }
  const stepOf = (overrides: Record<string, unknown>) => display.getPullRequestNextStep(pr(overrides))

  assert.equal(stepOf({ checks: failingChecks, reviewState: 'rejected' }).text, 'Fix failing check: Build')
  assert.equal(stepOf({ checks: failingChecks }).tone, 'critical')
  assert.equal(stepOf({ checks: pendingChecks, reviewState: 'rejected' }).text, 'Rejected — rework needed')
  assert.equal(stepOf({ checks: pendingChecks, reviewState: 'waiting-for-author' }).text, 'Respond to review feedback')
  assert.equal(stepOf({ checks: pendingChecks, reviewState: 'waiting-for-author' }).tone, 'attention')
  assert.equal(stepOf({ checks: { state: 'unavailable', checks: [] } }).text, 'Checks unavailable')

  const pending = stepOf({ checks: pendingChecks, approvalCount: 2 })
  assert.equal(pending.text, 'Waiting on Build')
  assert.deepEqual(pending.owner, { kind: 'pipeline' })

  assert.equal(stepOf({ approvalCount: 0 }).text, 'Needs 2 approvals')
  const oneMore = stepOf({ approvalCount: 1 })
  assert.equal(oneMore.text, 'Needs 1 more approval')
  assert.deepEqual(oneMore.owner, { kind: 'reviewers' })

  const ready = stepOf({ approvalCount: 2 })
  assert.equal(ready.text, 'Ready to complete')
  assert.equal(ready.tone, 'positive')

  assert.equal(stepOf({ status: 'completed' }), null)
  assert.equal(stepOf({ status: 'Abandoned' }), null)
})

test('blocked reasons come from the blocked tag with the word and separators removed', () => {
  assert.equal(display.getBlockedReason('Blocked - waiting on IMS'), 'waiting on IMS')
  assert.equal(display.getBlockedReason('blocked: API (v2)'), 'API (v2)')
  assert.equal(display.getBlockedReason('Blocked (waiting on IMS)'), 'waiting on IMS')
  assert.equal(display.getBlockedReason('[Blocked] design review'), 'design review')
  assert.equal(display.getBlockedReason('Blocked'), '')
  assert.equal(display.findBlockedTag(['Web', 'Blocked-API']), 'Blocked-API')
  assert.equal(display.findBlockedTag(['Web']), undefined)
})

test('card next step explains blocked, failed testing, and handed-off work', () => {
  const alex = { displayName: 'Alex Example', uniqueName: 'alex@example.test' }
  const quinn = { displayName: 'Quinn Tester', uniqueName: 'quinn@example.test' }

  assert.equal(
    display.getCardNextStep({ ...baseItem, status: 'Blocked', tags: ['Blocked - waiting on IMS'] }, alex).text,
    'Blocked · waiting on IMS',
  )
  assert.equal(display.getCardNextStep({ ...baseItem, status: 'Blocked', state: 'On Hold' }, alex).text, 'Blocked · On Hold')
  assert.equal(
    display.getCardNextStep({ ...baseItem, status: 'Blocked', state: 'In Progress', tags: ['Blocked'] }, alex).text,
    'Blocked · no reason given',
  )

  const failed = display.getCardNextStep({ ...baseItem, state: 'Failed Testing' }, alex)
  assert.equal(failed.text, 'Failed testing')
  assert.equal(failed.coversState, true)

  const inTesting = display.getCardNextStep({ ...baseItem, status: 'Review', state: 'Available for Testing', assignedTo: quinn }, alex)
  assert.equal(inTesting.text, 'In testing')
  assert.equal(inTesting.coversState, true)
  assert.deepEqual(inTesting.owner, { kind: 'person', identity: quinn })

  const handedOff = display.getCardNextStep({ ...baseItem, status: 'Review', state: 'Ready to build', assignedTo: quinn }, alex)
  assert.equal(handedOff.text, 'Handed off')
  assert.equal(handedOff.coversState, false)

  // Matching on either the unique name or the display name counts as the same person.
  assert.equal(
    display.getCardNextStep({ ...baseItem, status: 'Review', state: 'Available for Testing', assignedTo: { displayName: 'alex example' } }, alex),
    null,
  )
  assert.equal(display.getCardNextStep({ ...baseItem, status: 'Review', state: 'Available for Testing', assignedTo: quinn }, null), null)
  assert.equal(display.getCardNextStep(baseItem, alex), null)
})

test('a handed-off card shows who has it instead of repeating the state', () => {
  const html = render({
    item: { ...baseItem, status: 'Review', state: 'Available for Testing', assignedTo: { displayName: 'Quinn Tester', uniqueName: 'quinn@example.test' } },
    rowMember: { displayName: 'Alex Example', uniqueName: 'alex@example.test' },
    currentIterationName: 'Sprint 42',
  })
  const text = textOf(html)
  assert.match(text, /In testing/)
  assert.match(text, /Assigned to Quinn/)
  assert.doesNotMatch(text, /Available for Testing/)
  assert.match(html, /title="Currently assigned to Quinn Tester"/)
})

test('a blocked card folds its blocked tag into the step line', () => {
  const text = textOf(render({
    item: { ...baseItem, status: 'Blocked', state: 'In Progress', tags: ['Blocked - waiting on IMS', 'Web'] },
    currentIterationName: 'Sprint 42',
  }))
  assert.match(text, /Blocked · waiting on IMS/)
  assert.match(text, /Web/)
  assert.equal(text.match(/waiting on IMS/g)?.length, 1)
})
