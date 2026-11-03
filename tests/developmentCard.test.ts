import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import ts from 'typescript'

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
const { abbreviateState } = await server.ssrLoadModule('/src/features/standup/components/workItemCardDisplay.ts')
const { DevelopmentCardDetails } = await server.ssrLoadModule('/src/features/standup/components/DevelopmentCardDetails.tsx')

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

test('states with at least three words use only the first three initials', () => {
  assert.equal(abbreviateState('In Code Review'), 'ICR')
  assert.equal(abbreviateState('Available for Testing'), 'AFT')
  assert.equal(abbreviateState('Ready for User Acceptance Testing'), 'RFU')
  assert.equal(abbreviateState('  ready \t for\nTesting  '), 'RFT')
  assert.equal(abbreviateState('New'), 'New')
  assert.equal(abbreviateState('In Progress'), 'In Progress')
  assert.equal(abbreviateState(''), '')
})

test('regular and compact state badges abbreviate long states but keep their full tooltip', () => {
  for (const compact of [false, true]) {
    for (const [state, label] of [['In Code Review', 'ICR'], ['Available for Testing', 'AFT'], ['Ready for User Acceptance Testing', 'RFU']]) {
      const dom = new JSDOM(render({ item: { ...baseItem, state }, compact }))
      try {
        const badge = dom.window.document.querySelector(`[aria-label="State: ${state}"]`)
        assert.ok(badge)
        assert.equal(badge.hasAttribute('title'), false)
        assert.equal(badge.querySelector('.MuiBadge-badge')?.textContent, label)
      } finally {
        dom.window.close()
      }
    }
  }
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

test('regular and compact work-item icons keep their shape and accessible type with the theme-aware icon token', () => {
  for (const compact of [false, true]) {
    for (const workItemType of ['Bug', 'Product Backlog Item']) {
      const iconUrl = `https://example.test/icons/${workItemType === 'Bug' ? 'insect' : 'list'}?color=000000`
      const html = render({ item: { ...baseItem, workItemType, workItemIconUrl: iconUrl }, compact })
      const dom = new JSDOM(html)
      try {
        assert.ok(dom.window.document.querySelector(`[role="img"][aria-label="${workItemType}"]`))
        assert.equal(dom.window.document.querySelector('img'), null)
        assert.ok(html.includes(`mask-image:url("${iconUrl}")`))
        assert.match(html, /background-color:var\(--stratakit-color-icon-neutral-base\)/)
        assert.match(html, /background-color:CanvasText/)
      } finally {
        dom.window.close()
      }
    }
  }
})

test('a quiet card shows state and sprint only when they add information', () => {
  const text = textOf(render({
    item: { ...baseItem, status: 'Review', state: 'Available for Testing', sprintName: 'Sprint 41' },
    currentIterationName: 'Sprint 42',
  }))
  assert.match(text, /AFT/)
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
  assert.match(html, /aria-label="PR 912: Folder rename API"/)
  assert.doesNotMatch(text, /Folder rename API/, 'the PR title moves into the link label and tooltip')
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
  assert.match(html, /aria-label="Currently assigned to Quinn Tester"/)
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

test('PR progress strip fills checks, then review, then rings when ready to complete', () => {
  const failingChecks = { state: 'failing', checks: [{ name: 'Build', state: 'failing', optional: false, expired: false, source: 'policy' }] }
  const pendingChecks = { state: 'pending', checks: [{ name: 'Build', state: 'pending', optional: false, expired: false, source: 'policy' }] }
  const optionalFailing = {
    state: 'failing',
    checks: [
      { name: 'Build', state: 'passing', optional: false, expired: false, source: 'policy' },
      { name: 'Lint', state: 'failing', optional: true, expired: false, source: 'policy' },
    ],
  }
  const progressOf = (overrides: Record<string, unknown>) => display.getPullRequestProgress(pr(overrides))

  assert.equal(progressOf({ checks: failingChecks }).checks.state, 'critical')
  assert.equal(progressOf({ checks: pendingChecks }).checks.state, 'pending')
  assert.equal(progressOf({ checks: optionalFailing }).checks.state, 'positive', 'optional failures do not block the strip')
  assert.equal(progressOf({ checks: { state: 'unavailable', checks: [] } }).checks.state, 'empty')
  assert.equal(progressOf({ checks: { state: 'none', checks: [] } }).checks.state, 'empty')

  assert.deepEqual(progressOf({ approvalCount: 1 }).review, { state: 'positive', fill: 0.5, label: '1 of 2 approvals' })
  assert.equal(progressOf({ approvalCount: 5 }).review.fill, 1)
  assert.deepEqual(
    { state: progressOf({ reviewState: 'rejected' }).review.state, fill: progressOf({ reviewState: 'rejected' }).review.fill },
    { state: 'critical', fill: 1 },
  )
  assert.equal(progressOf({ reviewState: 'waiting-for-author', approvalCount: 2 }).review.state, 'attention')

  assert.equal(progressOf({ approvalCount: 2 }).ready, true)
  assert.equal(progressOf({ approvalCount: 2, checks: { state: 'none', checks: [] } }).ready, true)
  assert.equal(progressOf({ approvalCount: 1 }).ready, false)
  assert.equal(progressOf({ approvalCount: 2, checks: pendingChecks }).ready, false)
  assert.equal(progressOf({ approvalCount: 2, checks: { state: 'unavailable', checks: [] } }).ready, false)
  assert.equal(progressOf({ approvalCount: 2, reviewState: 'waiting-for-author' }).ready, false)
  assert.equal(progressOf({ approvalCount: 2, status: 'completed' }).ready, false)

  assert.equal(
    progressOf({ id: 912, approvalCount: 2 }).label,
    'PR 912. Required checks passing. 2 of 2 approvals. Ready to complete.',
  )
})

test('PR rows render the progress strip as a single labelled image', () => {
  const html = render({
    item: {
      ...baseItem,
      state: 'In Code Review',
      status: 'Review',
      activePullRequests: [pr({ id: 912, title: 'Folder rename API', approvalCount: 2 })],
    },
    currentIterationName: 'Sprint 42',
  })
  const dom = new JSDOM(html)
  try {
    const strip = dom.window.document.querySelector('[data-pr-progress]')
    assert.ok(strip, 'strip rendered')
    assert.equal(strip.getAttribute('role'), 'img')
    assert.equal(strip.getAttribute('aria-label'), 'PR 912. Required checks passing. 2 of 2 approvals. Ready to complete.')
    assert.deepEqual(
      [...strip.querySelectorAll('[data-segment-state]')].map((segment) => segment.getAttribute('data-segment-state')),
      ['positive', 'positive', 'ready'],
    )
  } finally {
    dom.window.close()
  }
})

test('closed PRs keep their status label instead of a progress strip', () => {
  const html = render({
    item: {
      id: -77,
      kind: 'pull-request',
      title: 'Bump dependencies',
      status: 'Done',
      pullRequest: pr({ id: 77, title: 'Bump dependencies', status: 'completed', approvalCount: 2 }),
    },
    currentIterationName: 'Sprint 42',
  })
  assert.match(textOf(html), /Completed/)
  assert.doesNotMatch(html, /data-pr-progress/)
})

test('the repository name appears only when a card has PRs in more than one repository', () => {
  const renderWith = (repositories: string[]) => textOf(render({
    item: {
      ...baseItem,
      state: 'In Code Review',
      status: 'Review',
      activePullRequests: repositories.map((repositoryName, index) => pr({ id: 900 + index, repositoryName })),
    },
    currentIterationName: 'Sprint 42',
  }))

  assert.doesNotMatch(renderWith(['pw-web']), /pw-web/)
  assert.doesNotMatch(renderWith(['pw-web', 'pw-web']), /pw-web/)
  const mixed = renderWith(['pw-web', 'pw-api'])
  assert.match(mixed, /pw-web/)
  assert.match(mixed, /pw-api/)
})

test('aging dots appear only on in-flight columns and escalate in tone', () => {
  const detail = (agingLevel: number, idleDays: number) => ({ agingLevel, idleDays })

  assert.equal(display.getAgingDots('Active', detail(0, 1)), null)
  assert.equal(display.getAgingDots('New', detail(3, 6)), null)
  assert.equal(display.getAgingDots('Done', detail(4, 9)), null)
  assert.equal(display.getAgingDots('Active', undefined), null)
  assert.deepEqual(display.getAgingDots('Active', detail(1, 2)), { count: 1, tone: 'neutral', label: 'Unchanged for 2 days' })
  assert.deepEqual(display.getAgingDots('Review', detail(3, 5)), { count: 3, tone: 'attention', label: 'Unchanged for 5 days' })
  assert.deepEqual(display.getAgingDots('Blocked', detail(4, 1)), { count: 4, tone: 'critical', label: 'Stale: unchanged for 1 day' })
})

test('change badge text pairs the reason with how long ago it happened', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString()

  assert.equal(display.getChangeBadgeText({ reason: 'Moved to Done', changedAt: hoursAgo(3), idleDays: 0, agingLevel: 0 }, now), 'Moved to Done · 3h')
  assert.equal(display.getChangeBadgeText({ reason: 'Reassigned', changedAt: hoursAgo(0.2), idleDays: 0, agingLevel: 0 }, now), 'Reassigned · just now')
  assert.equal(display.getChangeBadgeText({ reason: 'Reassigned', idleDays: 0, agingLevel: 0 }, now), 'Reassigned')
  assert.equal(display.getChangeBadgeText({ idleDays: 0, agingLevel: 0 }, now), null)
  assert.equal(display.getChangeBadgeText(undefined, now), null)
})

test('change badges abbreviate only state names and retain the full change for tooltips', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  const detail = { reason: 'Moved to In Code Review', changedAt: '2026-10-20T09:00:00Z', idleDays: 0, agingLevel: 0 }
  assert.equal(display.getChangeBadgeText(detail, now), 'Moved to ICR · 3h')
  assert.equal(display.getChangeBadgeText(detail, now, false), 'Moved to In Code Review · 3h')
  assert.equal(display.getChangeBadgeText({ ...detail, reason: 'Moved to Ready for User Acceptance Testing' }, now), 'Moved to RFU · 3h')
  assert.equal(display.getChangeBadgeText({ ...detail, reason: 'Moved to Available for Testing', changedAt: undefined }, now), 'Moved to AFT')
  assert.equal(display.getChangeBadgeText({ ...detail, reason: 'PR 912 approved' }, now), 'PR 912 approved · 3h')
  assert.equal(display.getLastChangeText(detail, now), 'Moved to In Code Review · 3h ago')

  const changedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  const dom = new JSDOM(render({ item: baseItem, highlightState: 'new', changeDetail: { ...detail, changedAt } }))
  try {
    const badge = dom.window.document.querySelector('[data-change-reason]')
    assert.equal(badge?.querySelector('.MuiBadge-badge')?.textContent, 'Moved to ICR · 3h')
    assert.equal(badge?.getAttribute('aria-label'), 'Latest change: Moved to In Code Review · 3h')
    assert.equal(badge?.hasAttribute('title'), false)
  } finally {
    dom.window.close()
  }
})

test('a recently changed card shows a corner dot and what changed instead of a glow', () => {
  const changedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  const html = render({
    item: baseItem,
    highlightState: 'new',
    changeDetail: { reason: 'Moved to In Progress', changedAt, idleDays: 0, agingLevel: 0 },
    currentIterationName: 'Sprint 42',
  })

  assert.match(html, /data-change-dot/)
  assert.match(textOf(html), /Moved to In Progress · 3h/)
  assert.doesNotMatch(html, /0 0 14px/, 'the old glow is gone')

  const withoutReason = render({ item: baseItem, highlightState: 'new', currentIterationName: 'Sprint 42' })
  assert.match(textOf(withoutReason), /Recently changed/)
})

test('in-flight cards show aging dots, and only stale Done cards fade', () => {
  const idle = { idleDays: 9, agingLevel: 4 }
  const active = render({ item: baseItem, highlightState: 'stale', changeDetail: idle, currentIterationName: 'Sprint 42' })
  assert.match(active, /data-aging-dots="4"/)
  assert.match(active, /aria-label="Stale: unchanged for 9 days"/)
  assert.doesNotMatch(active, /opacity:0\.68/)

  const done = render({
    item: { ...baseItem, state: 'Done', status: 'Done' },
    highlightState: 'stale',
    changeDetail: idle,
    currentIterationName: 'Sprint 42',
  })
  assert.doesNotMatch(done, /data-aging-dots/)
  assert.match(done, /opacity:0\.68/)
})

test('PR rows no longer show their own age', () => {
  const text = textOf(render({
    item: {
      ...baseItem,
      state: 'In Code Review',
      status: 'Review',
      activePullRequests: [pr({ id: 912, recentActivityAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() })],
    },
    currentIterationName: 'Sprint 42',
  }))
  assert.doesNotMatch(text, /\b3d\b/)
})

const modelOf = (item: Record<string, unknown>, overrides: Record<string, unknown> = {}) => display.getDevelopmentCardModel({
  item,
  highlightState: 'none',
  currentIterationName: 'Sprint 42',
  rowMember: null,
  showRolloverIndicator: false,
  ...overrides,
})

test('a card replayed to a past day measures its journey from then and leaves out live details', () => {
  const day = 24 * 60 * 60 * 1000
  const sprintStart = new Date(2026, 9, 5).getTime()
  const journey = { steps: [{ status: 'Active', at: sprintStart }], addedAt: null, sprintStart, firstStepSince: sprintStart - day }
  const item = {
    ...baseItem,
    state: 'Ready for Test',
    sprintName: 'Sprint 41',
    tags: ['Customer'],
    activePullRequests: [pr()],
  }
  const live = modelOf(item, { journey, highlightState: 'new', showRolloverIndicator: true })
  assert.equal(live.linkedPullRequests.length, 1)
  assert.deepEqual(live.tags, ['Customer'])
  assert.equal(live.isNew, true)
  assert.equal(live.showSprint, true)

  const replayed = modelOf(item, { journey, highlightState: 'new', showRolloverIndicator: true, asOf: sprintStart + 2 * day })
  assert.equal(replayed.journeyCaption?.text, '3d in Active', 'days in the column count up to the day shown')
  assert.deepEqual(replayed.linkedPullRequests, [])
  assert.equal(replayed.cardStep, null)
  assert.deepEqual(replayed.tags, [])
  assert.equal(replayed.isNew, false)
  assert.equal(replayed.changeBadgeText, null)
  assert.equal(replayed.showStateBadge, false)
  assert.equal(replayed.showSprint, false)
  assert.equal(replayed.showRollover, false)
  assert.equal(replayed.showEffort, true)
  assert.equal(replayed.agingDots, null)

  const compact = new JSDOM(render({ item, journey, compact: true, asOf: sprintStart + 2 * day }))
  try {
    const card = compact.window.document.querySelector('[data-development-card]')!
    assert.equal(card.getAttribute('data-card-id'), String(item.id))
    assert.ok(card.hasAttribute('data-as-of'))
  } finally {
    compact.window.close()
  }
})

test('closed PRs are labelled by how they closed, and open PRs by their next step', () => {
  assert.equal(display.getClosedPullRequestLabel({ status: ' COMPLETED ' }), 'Completed')
  assert.equal(display.getClosedPullRequestLabel({ status: 'abandoned' }), 'Abandoned')
  assert.equal(display.getClosedPullRequestLabel({ status: 'active' }), '')
  assert.equal(display.getClosedPullRequestLabel({}), '')
  assert.equal(display.getPullRequestStatusText(pr()), 'Needs 2 approvals')
  assert.equal(display.getPullRequestStatusText(pr({ status: 'completed' })), 'Completed')
})

test('last change text spells out when a card last changed', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString()

  assert.equal(display.getLastChangeText({ reason: 'Moved to Review', changedAt: hoursAgo(72), idleDays: 3, agingLevel: 2 }, now), 'Moved to Review · 3 days ago')
  assert.equal(display.getLastChangeText({ idleDays: 1, agingLevel: 0 }, now), '1 day ago')
  assert.equal(display.getLastChangeText({ reason: 'Reassigned', changedAt: hoursAgo(3), idleDays: 0, agingLevel: 0 }, now), 'Reassigned · 3h ago')
  assert.equal(display.getLastChangeText({ changedAt: hoursAgo(0.2), idleDays: 0, agingLevel: 0 }, now), 'Just now')
  assert.equal(display.getLastChangeText({ idleDays: 0, agingLevel: 0 }, now), 'Today')
  assert.equal(display.getLastChangeText(undefined, now), null)
})

test('the card model hides the folded blocked tag, sorts tags, and uses the PR for PR-only cards', () => {
  const blocked = modelOf({ ...baseItem, status: 'Blocked', tags: ['web', 'Blocked - waiting on IMS', 'Customer'] })
  assert.deepEqual(blocked.tags, ['Customer', 'web'])
  assert.equal(blocked.cardStep.text, 'Blocked · waiting on IMS')
  assert.equal(blocked.titleText, baseItem.title)
  assert.equal(blocked.showEffort, true)

  const pullRequest = pr({ id: 77, title: 'Bump dependencies' })
  const prOnly = modelOf({ id: 5, kind: 'pull-request', title: 'Unlinked', status: 'Review', pullRequest }, { showRolloverIndicator: true })
  assert.equal(prOnly.pullRequestOnly, pullRequest)
  assert.deepEqual(prOnly.linkedPullRequests, [])
  assert.equal(prOnly.titleText, 'Bump dependencies')
  assert.equal(prOnly.displayId, 77)
  assert.equal(prOnly.showEffort, false)
  assert.equal(prOnly.showRollover, false)
})

test('a compact card uses its own step, or else the most urgent step among its open PRs', () => {
  const failingChecks = { state: 'failing', checks: [{ name: 'Build', state: 'failing', optional: false, expired: false, source: 'policy' }] }
  const step = (item: Record<string, unknown>) => display.getCompactCardStep(modelOf(item))?.text ?? null

  assert.equal(step(baseItem), null)
  assert.equal(step({ ...baseItem, status: 'Blocked', activePullRequests: [pr({ checks: failingChecks })] }), 'Blocked · no reason given')
  assert.equal(step({
    ...baseItem,
    activePullRequests: [pr({ id: 1, approvalCount: 2 }), pr({ id: 2, checks: failingChecks }), pr({ id: 3, reviewState: 'waiting-for-author' })],
  }), 'Fix failing check: Build')
  assert.equal(step({ ...baseItem, activePullRequests: [pr({ approvalCount: 2 }), pr({ reviewState: 'waiting-for-author' })] }), 'Respond to review feedback')
  assert.equal(step({ ...baseItem, activePullRequests: [pr({ status: 'completed' })] }), null)
  assert.equal(step({ id: 5, kind: 'pull-request', title: 'PR', status: 'Review', pullRequest: pr() }), 'Needs 2 approvals')
})

test('a compact card keeps its title to one line and folds its details into one status line', () => {
  const html = render({
    item: {
      ...baseItem,
      tags: ['Customer'],
      sprintName: 'Sprint 41',
      activePullRequests: [
        pr({
          id: 912,
          title: 'Folder rename API',
          checks: { state: 'failing', checks: [{ name: 'Unit tests', state: 'failing', optional: false, expired: false, source: 'policy' }] },
        }),
      ],
    },
    currentIterationName: 'Sprint 42',
    compact: true,
  })
  const text = textOf(html)

  assert.match(html, /data-compact=""/)
  assert.match(html, /data-compact-line/)
  assert.match(html, /-webkit-line-clamp:1/)
  assert.doesNotMatch(html, /title="Add folder rename to the web client"/, 'the hover card replaces the native title tooltip')
  assert.doesNotMatch(text, /Customer/, 'tags wait for the hover card')
  assert.match(html, /data-compact-pr="912"[^>]*aria-label="PR 912: Folder rename API\. Fix failing check: Unit tests"|aria-label="PR 912: Folder rename API\. Fix failing check: Unit tests"[^>]*data-compact-pr="912"/)
  assert.match(text, /Fix failing check: Unit tests/)
  assert.match(text, /Effort 5/)
  assert.match(text, /Sprint 41/)
  assert.doesNotMatch(html, /data-development-card-hover/, 'the hover card renders only while open')
})

test('a compact card shows who has handed-off work and what changed', () => {
  const changedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  const html = render({
    item: { ...baseItem, status: 'Review', state: 'Available for Testing', assignedTo: { displayName: 'Quinn Tester', uniqueName: 'quinn@example.test' } },
    rowMember: { displayName: 'Alex Example', uniqueName: 'alex@example.test' },
    highlightState: 'new',
    changeDetail: { reason: 'Moved to Available for Testing', changedAt, idleDays: 0, agingLevel: 0 },
    currentIterationName: 'Sprint 42',
    compact: true,
  })
  const text = textOf(html)

  assert.match(text, /In testing/)
  assert.match(text, /Assigned to Quinn Tester/)
  assert.match(text, /Latest change: Moved to AFT · 3h/)
  assert.match(html, /data-change-dot/)
  assert.doesNotMatch(text, /Recently changed/, 'the change text already announces the change')
})

test('a compact title reserves the full effort badge height without unclamping its text', () => {
  for (const effort of [0, 8, 40]) {
    const html = render({ item: { ...baseItem, effort }, compact: true })
    assert.match(html, /min-height:18px;[^{}]*-webkit-line-clamp:1/)
    assert.match(textOf(html), new RegExp(`Effort ${effort}`))
  }

  const withoutEffort = render({ item: { ...baseItem, effort: undefined }, compact: true })
  assert.doesNotMatch(withoutEffort, /min-height:18px;[^{}]*-webkit-line-clamp:1/)
  assert.match(withoutEffort, /-webkit-line-clamp:1/)
})

test('the regular card is unaffected by the compact layout', () => {
  const html = render({ item: { ...baseItem, tags: ['Customer'] }, currentIterationName: 'Sprint 42' })
  assert.doesNotMatch(html, /data-compact/)
  assert.match(html, /-webkit-line-clamp:2/)
  assert.doesNotMatch(html, /\stitle="/, 'the regular card uses StrataKit tooltips, not native titles')
  assert.match(textOf(html), /Customer/)
})

test('hover card details list the facts a compact card leaves out', () => {
  const item = {
    ...baseItem,
    state: 'Available for Testing',
    sprintName: 'Sprint 41',
    assignedTo: { displayName: 'Alex Example', uniqueName: 'alex@example.test' },
    activePullRequests: [
      pr({ id: 912, title: 'Folder rename API', repositoryName: 'pw-web' }),
      pr({ id: 913, title: 'Folder rename UI', repositoryName: 'pw-api', status: 'abandoned' }),
    ],
  }
  const html = renderToStaticMarkup(createElement(Root, null, createElement(DevelopmentCardDetails, {
    item,
    model: modelOf(item, { showRolloverIndicator: true }),
    changeDetail: { reason: 'Moved to Available for Testing', idleDays: 2, agingLevel: 1 },
  })))
  const text = textOf(html)

  assert.match(html, /<dl[^>]*data-card-details/)
  assert.match(text, /StateAvailable for Testing/)
  assert.match(text, /SprintSprint 41 \(rolled over\)/)
  assert.match(text, /Assigned toAAlex Example/)
  assert.match(text, /Last changeMoved to Available for Testing · 2 days ago/)
  assert.match(text, /PR 912Folder rename APIpw-web · Required checks passing/)
  assert.match(text, /PR 913Folder rename UIpw-api · Abandoned/)

  const pullRequestOnly = { id: 5, kind: 'pull-request', title: 'PR', status: 'Review', assignedTo: { displayName: 'Sam Developer' }, pullRequest: pr({ id: 77 }) }
  const prText = textOf(renderToStaticMarkup(createElement(Root, null, createElement(DevelopmentCardDetails, {
    item: pullRequestOnly,
    model: modelOf(pullRequestOnly),
  }))))
  assert.match(prText, /AuthorSSam Developer/)
  assert.match(prText, /ChecksRequired checks passing/)
  assert.doesNotMatch(prText, /State|Assigned to|Last change/)
})

test('cards render without native title tooltips, including closed StrataKit tooltips', () => {
  for (const compact of [false, true]) {
    const html = render({
      item: {
        ...baseItem,
        state: 'Available for Testing',
        sprintName: 'Sprint 41',
        tags: ['Customer'],
        activePullRequests: [pr()],
      },
      highlightState: 'new',
      changeDetail: { reason: 'Moved to Available for Testing', idleDays: 3, agingLevel: 2 },
      currentIterationName: 'Sprint 42',
      showRolloverIndicator: true,
      compact,
    })
    const dom = new JSDOM(html)
    try {
      assert.equal(dom.window.document.querySelectorAll('[title]').length, 0)
      const dots = dom.window.document.querySelector('[data-aging-dots]')
      assert.equal(dots?.getAttribute('aria-label'), 'Unchanged for 3 days')
      assert.equal(dots?.getAttribute('tabindex'), '0')
    } finally {
      dom.window.close()
    }
  }
})

test('app JSX reserves title props for tooltips and page or error headings', () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url))
  const allowed = new Set(['Tooltip', 'AppTooltip', 'PageToolbar', 'AdoErrorNotice'])
  const nativeTitles: string[] = []
  for (const path of readdirSync(src, { recursive: true })) {
    if (!path.endsWith('.tsx')) continue
    const source = ts.createSourceFile(path, readFileSync(join(src, path), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && !allowed.has(node.tagName.getText(source))) {
        if (node.attributes.properties.some((prop) => ts.isJsxAttribute(prop) && prop.name.getText(source) === 'title')) {
          nativeTitles.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.deepEqual(nativeTitles, [])
})
