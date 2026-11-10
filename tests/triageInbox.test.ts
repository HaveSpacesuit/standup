import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { TriageItem } from '../src/ado/types.ts'

// The assignee avatars read the saved PAT from the bare storage globals.
for (const name of ['localStorage', 'sessionStorage']) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value: { getItem: () => null } })
  after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  })
}
const server = await createServer({
  configFile: false, server: { middlewareMode: true, ws: false }, ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { TriageInbox } = await server.ssrLoadModule('/src/features/standup/components/TriageInbox.tsx')
const { createBacklogSprintResolver } = await server.ssrLoadModule('/src/features/standup/utils/backlogSprint.ts')
const {
  formatTriageCreated, formatTriageMoment, formatTriageVisit, formatTriageWhen, getTriageEntry, getTriageItemAge,
  getTriageWaiting, groupTriageInbox, summarizeTriageInbox,
} = await server.ssrLoadModule('/src/features/standup/utils/triageInbox.ts')

// Local times, as the Inbox speaks in the viewer's days: "now" is Thursday 30 April 2026, 10 AM.
const at = (month: number, day: number, hour = 10, minute = 0) => new Date(2026, month - 1, day, hour, minute).toISOString()
const now = new Date(2026, 3, 30, 10)
const lastVisit = new Date(2026, 3, 29, 17).getTime()
const person = (displayName: string) => ({ displayName, uniqueName: `${displayName.toLowerCase()}@example.com` })
const url = (id: number) => `https://dev.azure.com/org/Project/_workitems/edit/${id}`
const checks = { bug: ['severity'], other: ['effort'] }

const filed: TriageItem = {
  id: 1, title: 'Filed this morning', workItemType: 'Bug', state: 'New', inInitialState: true, severity: '2 - High',
  createdAt: at(4, 30, 9), createdBy: person('Ana'), tags: ['Triage'], reasons: ['Tag: Triage'], workItemUrl: url(1),
  history: { tagsAdded: { triage: { at: at(4, 30, 9, 1), by: person('Ana') } } },
}
const tagged: TriageItem = {
  id: 2, title: 'Tagged later', workItemType: 'Product Backlog Item', state: 'Approved', inInitialState: false, effort: 3,
  createdAt: at(4, 20), createdBy: person('Ana'), tags: ['Triage', 'UI'], reasons: ['Tag: Triage'], workItemUrl: url(2),
  history: { tagsAdded: { triage: { at: at(4, 29, 15), by: person('Ben') } } },
}
const moved: TriageItem = {
  id: 3, title: 'Moved back to New', workItemType: 'Bug', state: 'New', inInitialState: true,
  createdAt: at(4, 1), createdBy: person('Ana'), tags: [], reasons: ['New bug'], workItemUrl: url(3),
  history: { tagsAdded: {}, stateSince: { at: at(4, 27, 11), by: person('Cy') } },
}
const waiting: TriageItem = {
  id: 4, title: 'Waiting on QA', workItemType: 'Bug', state: 'New', inInitialState: true, severity: '3 - Medium',
  createdAt: at(4, 14), createdBy: person('Ana'), tags: ['Triage', 'Needs Info'], reasons: ['Tag: Triage'], workItemUrl: url(4),
  history: { tagsAdded: { triage: { at: at(4, 14, 10, 10) }, 'needs info': { at: at(4, 28, 9), by: person('Eric') } } },
  latestComment: { at: at(4, 29, 12), by: person('Quinn'), text: 'Repros on Edge only' },
}
const stale: TriageItem = {
  id: 5, title: 'Sitting a while', workItemType: 'Task', state: 'To Do', inInitialState: true,
  createdAt: at(4, 22), createdBy: person('Ana'), tags: ['Triage'], reasons: ['Tag: Triage'], workItemUrl: url(5),
}
const items = [filed, tagged, moved, waiting, stale]

test('an item entered triage when it was filed, unless a rule it meets began later: a tag added or a move back to its first state', () => {
  assert.deepEqual(getTriageEntry(filed), { at: filed.createdAt, by: person('Ana'), kind: 'filed' }, 'tagged within an hour counts as filed')
  assert.deepEqual(getTriageEntry(stale), { at: stale.createdAt, by: person('Ana'), kind: 'filed' }, 'no history counts as filed')
  assert.deepEqual(getTriageEntry(tagged), { at: at(4, 29, 15), by: person('Ben'), kind: 'tagged', tag: 'Triage' })
  assert.deepEqual(getTriageEntry(moved), { at: at(4, 27, 11), by: person('Cy'), kind: 'moved' })
  const both = { ...moved, tags: ['triage'], reasons: ['Tag: Triage', 'New bug'], history: { ...moved.history!, tagsAdded: { triage: { at: at(4, 24) } } } }
  assert.deepEqual(getTriageEntry(both), { at: at(4, 24), kind: 'tagged', tag: 'Triage' }, 'the earliest rule to apply wins, matched ignoring case')
  assert.equal(getTriageEntry({ ...stale, createdAt: undefined }), undefined)
})

test('waiting tags mark an item as waiting on others, and a newer comment from someone else is a reply', () => {
  assert.equal(getTriageWaiting(waiting, []), undefined, 'no waiting tags configured')
  assert.equal(getTriageWaiting(tagged, ['Needs Info']), undefined)
  assert.deepEqual(getTriageWaiting(waiting, ['needs info']), {
    tags: ['Needs Info'], since: { at: at(4, 28, 9), by: person('Eric') }, reply: waiting.latestComment,
  }, 'tags match ignoring case and keep the item’s spelling')
  const ownComment = { ...waiting, latestComment: { at: at(4, 29), by: { displayName: 'Eric Again', uniqueName: 'ERIC@example.com' }, text: 'Ping' } }
  assert.equal(getTriageWaiting(ownComment, ['Needs Info'])?.reply, undefined, 'a comment from whoever added the tag is not a reply')
  const earlier = { ...waiting, latestComment: { ...waiting.latestComment!, at: at(4, 27) } }
  assert.equal(getTriageWaiting(earlier, ['Needs Info'])?.reply, undefined, 'a comment from before the tag is not a reply')
  assert.deepEqual(getTriageWaiting({ ...waiting, history: undefined }, ['Needs Info']), { tags: ['Needs Info'], since: undefined, reply: undefined },
    'without history the item still waits, with no time and no reply')

  assert.equal(getTriageItemAge(waiting, 2, [], now)?.flagged, true)
  assert.deepEqual(getTriageItemAge(waiting, 2, ['Needs Info'], now), { ...getTriageItemAge(waiting, 2, [], now), flagged: false },
    'an item waiting on others keeps its age but is never flagged')
  assert.equal(getTriageItemAge(moved, 2, [], now)?.workingDays, 3, 'age counts from entering triage, not from creation')
})

test('the Inbox groups items new since the last visit, still to triage and waiting, each longest in triage first', () => {
  const ids = (groups: Array<{ key: string; items: TriageItem[] }>) => groups.map(({ key, items: grouped }) => [key, grouped.map(({ id }) => id)])
  const undated = { ...stale, id: 6, createdAt: undefined }
  assert.deepEqual(ids(groupTriageInbox([...items, undated], ['Needs Info'], lastVisit)), [
    ['new', [1]], ['todo', [5, 3, 2, 6]], ['waiting', [4]],
  ], 'an item with no known entry sorts last and is never new')
  assert.deepEqual(ids(groupTriageInbox(items, ['Needs Info'], null)), [['todo', [5, 3, 2, 1]], ['waiting', [4]]],
    'with no earlier visit nothing counts as new')
  assert.deepEqual(ids(groupTriageInbox(items, [], Date.parse(at(5, 1)))), [['todo', [4, 5, 3, 2, 1]]],
    'empty groups are left out')

  const groups = groupTriageInbox(items, ['Needs Info'], lastVisit)
  assert.deepEqual(summarizeTriageInbox(groups, checks, 2, ['Needs Info'], now), { total: 5, newCount: 1, ready: 3, waiting: 1, stale: 2 })
  assert.equal(summarizeTriageInbox(groups, { bug: [], other: [] }, 2, ['Needs Info'], now).ready, undefined, 'no checks, no ready count')
})

test('Inbox times read naturally: relative today, then yesterday, the weekday and the date', () => {
  assert.equal(formatTriageWhen(new Date(2026, 3, 30, 9, 59, 30).toISOString(), now), 'just now')
  assert.equal(formatTriageWhen(at(4, 30, 11), now), 'just now', 'a clock running ahead is not in the future')
  assert.equal(formatTriageWhen(at(4, 30, 9, 55), now), '5m ago')
  assert.equal(formatTriageWhen(at(4, 30, 6, 30), now), '3h ago')
  assert.equal(formatTriageWhen(at(4, 29, 23), now), 'yesterday')
  assert.equal(formatTriageWhen(at(4, 27), now), 'Monday')
  assert.equal(formatTriageWhen(at(4, 23), now), 'Apr 23')
  assert.equal(formatTriageWhen(new Date(2025, 11, 1).toISOString(), now), 'Dec 1, 2025')
  assert.equal(formatTriageWhen('not a date', now), '')

  assert.match(formatTriageVisit(new Date(2026, 3, 30, 9, 5).getTime(), now), /^9:05\sAM$/)
  assert.match(formatTriageVisit(lastVisit, now), /^yesterday 5:00\sPM$/)
  assert.match(formatTriageVisit(Date.parse(at(4, 27, 16, 12)), now), /^Monday 4:12\sPM$/)
  assert.match(formatTriageVisit(Date.parse(at(4, 20, 16, 12)), now), /^Apr 20, 4:12\sPM$/)
  assert.match(formatTriageMoment(at(4, 28, 16, 12)), /^Tue, Apr 28, 4:12\sPM$/)
  assert.equal(formatTriageMoment('not a date'), '')
  assert.equal(formatTriageCreated(at(4, 20), now), 'Apr 20')
  assert.equal(formatTriageCreated(new Date(2025, 11, 1).toISOString(), now), 'Dec 1, 2025')
})

function renderInbox(overrides: Record<string, unknown> = {}) {
  const html = renderToStaticMarkup(createElement(Root, null, createElement(TriageInbox, {
    items, lastVisit, now, resolveSprint: createBacklogSprintResolver([]), ageFlagDays: 2, readinessChecks: checks,
    excludedIterationPaths: [], waitingTags: ['Needs Info'], ...overrides,
  })))
  const dom = new JSDOM(html)
  for (const style of dom.window.document.querySelectorAll('style')) style.remove()
  return dom
}
const squash = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

test('the Inbox summarizes the queue and lists each group under a heading with its count', () => {
  const dom = renderInbox()
  try {
    const doc = dom.window.document
    const summary = [...doc.querySelectorAll('ul[aria-label="Triage summary"] > li')]
    assert.deepEqual(summary.map((entry) => squash(entry.textContent)),
      ['5 in triage', '1 new since yesterday 5:00 PM', '3 ready to clear', '1 waiting on others', '2 in triage 2+ working days'])
    assert.ok(summary[4].classList.contains('attention'))
    const sections = [...doc.querySelectorAll('main section')]
    assert.deepEqual(sections.map((section) => [
      section.querySelector('h2')!.firstChild!.textContent,
      section.querySelector('h2 .count')!.textContent,
      squash(section.querySelector('h2 .subtitle')?.textContent),
      [...section.querySelectorAll('[data-triage-card]')].map((card) => card.getAttribute('data-triage-card')),
    ]), [
      ['New since your last visit', '1', 'since yesterday 5:00 PM', ['1']],
      ['Still to triage', '3', 'longest in triage first', ['5', '3', '2']],
      ['Waiting on others', '1', 'tagged “Needs Info”', ['4']],
    ])
    for (const section of sections) {
      assert.equal(doc.getElementById(section.getAttribute('aria-labelledby')!), section.querySelector('h2'))
    }
  } finally { dom.window.close() }

  const first = renderInbox({ lastVisit: null })
  try {
    const doc = first.window.document
    assert.deepEqual([...doc.querySelectorAll('main section h2')].map((heading) => heading.firstChild!.textContent), ['To triage', 'Waiting on others'])
    assert.doesNotMatch(doc.querySelector('ul[aria-label="Triage summary"]')!.textContent!, /new since/, 'the first visit has nothing new')
  } finally { first.window.close() }

  const unchecked = renderInbox({ readinessChecks: { bug: [], other: [] }, items: [tagged] })
  try {
    assert.deepEqual([...unchecked.window.document.querySelectorAll('ul[aria-label="Triage summary"] > li')].map((entry) => squash(entry.textContent)),
      ['1 in triage', '0 new since yesterday 5:00 PM'], 'no ready count without checks, and no waiting or stale count when there are none')
  } finally { unchecked.window.close() }
})

test('each card says how the item arrived, why it is listed, what it is waiting on, and what it still needs', () => {
  const dom = renderInbox()
  try {
    const doc = dom.window.document
    const card = (id: number) => doc.querySelector(`[data-triage-card="${id}"]`)!
    // The parts of the meta line, without the decorative separators between them.
    const meta = (id: number) => [...card(id).querySelector('.card-meta')!.children]
      .filter((part) => part.getAttribute('aria-hidden') !== 'true')
      .map((part) => squash(part.textContent))
    assert.deepEqual(meta(1), ['Filed 1h ago by Ana', 'Triage tag'])
    assert.deepEqual(meta(2), ['Tagged “Triage” yesterday by Ben', 'created Apr 20', 'Triage tag', 'Approved'],
      'an item tagged later says when it was created, and a state other than the first is shown')
    assert.deepEqual(meta(3), ['Moved to New Monday by Cy', 'created Apr 1', 'New bug', '3 working days in triage'],
      'the first state is not repeated, and age counts from entering triage')
    assert.deepEqual(meta(4), ['Filed Apr 14 by Ana', 'Triage tag', 'Needs Info since Tuesday', 'Quinn replied yesterday'],
      'an item waiting on others is not called stale')
    assert.deepEqual(meta(5), ['Filed Apr 22 by Ana', 'Triage tag', '6 working days in triage'])

    assert.deepEqual([...card(4).querySelectorAll('.card-title ul[aria-label="Tags"] li')].map((tag) => tag.textContent), [],
      'the matched Triage tag and the waiting tag are named in the meta line instead of the title')
    assert.deepEqual([...card(2).querySelectorAll('.card-title ul[aria-label="Tags"] li')].map((tag) => tag.textContent), ['UI'])
    assert.deepEqual(['1', '2', '3', '4', '5'].map((id) => card(Number(id)).classList.contains('ready')), [true, true, false, true, false],
      'ready items have the positive edge')
    assert.deepEqual([...card(3).querySelectorAll('ul[aria-label="Readiness checks"] li')].map((check) => check.textContent), ['?Severity: missing'])
    assert.match(card(3).textContent!, /Clears when you move it out of New\./)
    assert.match(squash(card(1).querySelector('.card-fields')!.textContent), /S2 · High/)
  } finally { dom.window.close() }
})
