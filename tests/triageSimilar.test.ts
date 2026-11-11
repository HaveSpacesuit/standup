import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { BacklogBug, ClosedBug, TriageItem } from '../src/ado/types.ts'

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
const { TriageTable } = await server.ssrLoadModule('/src/features/standup/components/TriageTable.tsx')
const { TriageInbox } = await server.ssrLoadModule('/src/features/standup/components/TriageInbox.tsx')
const { describeTriageMatch } = await server.ssrLoadModule('/src/features/standup/components/triageSimilarDisplay.ts')
const { createBacklogSprintResolver } = await server.ssrLoadModule('/src/features/standup/utils/backlogSprint.ts')
const { filterTriageItems } = await server.ssrLoadModule('/src/features/standup/utils/triageDisplay.ts')
const {
  collectTriageMatchCandidates, findTriageMatches, formatTriageMatchLead, getSharedTitleWords, getTitleStems, splitTitleByStems,
  stemWord, toTriageMatchCandidate, triagePairKey, TRIAGE_MATCH_MIN_SCORE,
} = await server.ssrLoadModule('/src/features/standup/utils/triageSimilar.ts')

const url = (id: number) => `https://dev.azure.com/org/Project/_workitems/edit/${id}`
const now = new Date(2026, 3, 30, 10)
const bugIcon = 'https://dev.azure.com/org/_apis/wit/workItemIcons/icon_insect'
const queued = (id: number, title: string, extra: Partial<TriageItem> = {}): TriageItem => ({
  id, title, workItemType: 'Bug', state: 'New', tags: ['Triage'], reasons: ['Tag: Triage'], workItemUrl: url(id), ...extra,
})
const openBug = (id: number, title: string, extra: Partial<BacklogBug> = {}): BacklogBug => ({ id, title, state: 'Active', workItemUrl: url(id), ...extra })
const closedBug = (id: number, title: string, extra: Partial<ClosedBug> = {}): ClosedBug => ({ id, title, state: 'Done', workItemUrl: url(id), ...extra })

// Item 1 shares four words with closed bug 20 and three with open bug 10; items 2 and 3 are the same crash filed twice.
const queue = [
  queued(1, 'Watermark missing from exported PDF drawings', { workItemIconUrl: bugIcon }),
  queued(2, 'Viewer crashes on large models'),
  queued(3, 'Viewer crashed opening large model', { workItemType: 'Product Backlog Item' }),
  queued(4, 'Toolbar icons blurry in dark theme'),
]
const openBugs = [openBug(10, 'Watermark missing in PDF preview', { iterationPath: 'Project\\Sprint 1', assignedTo: { displayName: 'Ana Diaz' } })]
const closedBugs = [closedBug(20, 'Exported PDF drawings lose watermark', { closedAt: new Date(2026, 3, 14, 12).toISOString() })]
const candidates = collectTriageMatchCandidates(queue, openBugs, closedBugs)
const sprints = createBacklogSprintResolver([{ name: 'Sprint 1', path: 'Project\\Sprint 1', timeFrame: 'current' }])

test('a light stem reads a word\'s forms as one, but keeps words with digits and endings that are not plurals', () => {
  for (const [words, stem] of [
    [['crash', 'crashes', 'crashed', 'crashing', 'Crashes'], 'crash'],
    [['stop', 'stops', 'stopped', 'stopping'], 'stop'],
    [['rename', 'renames', 'renamed', 'renaming'], 'renam'],
    [['fix', 'fixes', 'fixed', 'fixing'], 'fix'],
    [['property', 'properties'], 'property'],
    [['address', 'addresses'], 'address'],
    [['miss', 'missing', 'missed'], 'miss'],
    [['need', 'needs', 'needed'], 'need'],
  ] as const) {
    assert.deepEqual(words.map(stemWord), words.map(() => stem), stem)
  }
  assert.deepEqual(['status', 'class', 'analysis', 'bus'].map(stemWord), ['status', 'class', 'analysis', 'bus'])
  assert.deepEqual(['3D', 'E2E', 'v10s'].map(stemWord), ['3d', 'e2e', 'v10s'])
})

test('a title\'s stems leave out common words, single letters and repeats', () => {
  assert.deepEqual(getTitleStems('The viewer crashes when the user opens a 3D model, then crashes again'),
    ['viewer', 'crash', 'user', 'open', '3d', 'model'])
  assert.deepEqual(getTitleStems('It is not on the'), [])
  assert.deepEqual(getTitleStems(''), [])
})

test('the queue is compared with itself, then with the open and closed bugs not in it, which borrow a queued bug\'s icon', () => {
  assert.deepEqual(candidates.map(({ kind, id }) => `${kind} ${id}`), ['queue 1', 'queue 2', 'queue 3', 'queue 4', 'open 10', 'closed 20'])
  assert.deepEqual(candidates.slice(4).map(({ workItemType, workItemIconUrl }) => [workItemType, workItemIconUrl]), [['Bug', bugIcon], ['Bug', bugIcon]])
  assert.equal(candidates[5].closedAt, closedBugs[0].closedAt)
  assert.deepEqual(toTriageMatchCandidate(queue[2]), { ...candidates[2] })

  const deduped = collectTriageMatchCandidates([queue[1]], [openBug(2, 'Also open'), openBug(10, 'Open')], [closedBug(10, 'Closed since'), closedBug(20, 'Closed')])
  assert.deepEqual(deduped.map(({ kind, id }) => `${kind} ${id}`), ['queue 2', 'open 10', 'closed 20'], 'each item is compared once, as its first source')
  assert.equal(deduped[1].workItemIconUrl, undefined, 'with no queued bug to borrow from, the icon falls back')
})

test('each item\'s closest match is found by rare shared words, never itself, and two items in the queue match each other', () => {
  const matches = findTriageMatches(queue, candidates)
  assert.deepEqual([...matches].map(([id, match]) => `${id} → ${match.candidate.kind} ${match.candidate.id}`),
    ['1 → closed 20', '2 → queue 3', '3 → queue 2'])
  const watermark = matches.get(1)!
  assert.deepEqual(watermark.stems, ['draw', 'export', 'pdf', 'watermark'], 'rarest first, then alphabetical')
  assert.ok(watermark.score > TRIAGE_MATCH_MIN_SCORE && watermark.score <= 1)
  assert.equal(matches.get(2)!.score, matches.get(3)!.score)
})

test('a pair marked as not duplicates is skipped, so the next closest match shows, or none', () => {
  assert.equal(triagePairKey(20, 1), '1:20')
  assert.equal(triagePairKey(1, 20), '1:20')
  const next = findTriageMatches(queue, candidates, new Set(['1:20']))
  assert.equal(next.get(1)?.candidate.id, 10)
  assert.deepEqual(next.get(1)?.stems, ['miss', 'pdf', 'watermark'])
  const none = findTriageMatches(queue, candidates, new Set(['1:20', '1:10', '2:3']))
  assert.deepEqual([...none.keys()], [])
})

test('a match needs two shared words and a high enough score', () => {
  const lone = [queued(5, 'Watermark')]
  assert.equal(findTriageMatches(lone, collectTriageMatchCandidates(lone, [], [closedBug(6, 'Watermark')])).size, 0,
    'one shared word is not enough, however rare')

  const short = [queued(7, 'Viewer crash')]
  const compare = (title: string) => findTriageMatches(short, collectTriageMatchCandidates(short, [openBug(8, title)], [])).get(7)
  assert.ok(compare('Viewer crash on open'))
  assert.equal(compare('Viewer crash when exporting large drawings to PDF with custom watermark settings applied'), undefined,
    'two shared words are too few in a long title')
})

test('equally close matches prefer the queue, then open bugs, then closed bugs, then the lowest id', () => {
  const title = 'Login fails offline'
  const tied = [queued(7, title), queued(8, title)]
  const pool = collectTriageMatchCandidates(tied, [openBug(41, title), openBug(40, title)], [closedBug(30, title)])
  assert.equal(findTriageMatches(tied, pool).get(7)?.candidate.id, 8)
  assert.equal(findTriageMatches(tied, pool, new Set(['7:8'])).get(7)?.candidate.id, 40)
  assert.equal(findTriageMatches(tied, pool, new Set(['7:8', '7:40', '7:41'])).get(7)?.candidate.id, 30)
})

test('a title splits into runs with the shared words marked, and the shared words are listed once as written', () => {
  assert.deepEqual(splitTitleByStems('Exported PDF drawings lose watermark.', ['draw', 'export', 'pdf', 'watermark']), [
    { text: 'Exported', shared: true }, { text: ' ', shared: false }, { text: 'PDF', shared: true }, { text: ' ', shared: false },
    { text: 'drawings', shared: true }, { text: ' ', shared: false }, { text: 'lose', shared: false }, { text: ' ', shared: false },
    { text: 'watermark', shared: true }, { text: '.', shared: false },
  ])
  assert.deepEqual(splitTitleByStems('The crash', ['crash']).filter(({ shared }) => shared).map(({ text }) => text), ['crash'])
  assert.deepEqual(getSharedTitleWords('Crash: crashes, CRASH (viewer)', ['crash']), ['Crash', 'crashes'])
})

test('a match leads with what it is and its id, and its detail tells it apart', () => {
  const matches = findTriageMatches(queue, candidates)
  assert.equal(formatTriageMatchLead(matches.get(1)), 'Possible regression of 20')
  assert.equal(formatTriageMatchLead(matches.get(2)), 'Also in triage: 3')
  assert.equal(formatTriageMatchLead(findTriageMatches(queue, candidates, new Set(['1:20'])).get(1)), 'Similar open bug 10')

  const describe = (candidate: object) => describeTriageMatch({ candidate, score: 1, stems: [] }, sprints, now)
  assert.equal(describe(candidates[5]), 'Done Apr 14')
  assert.equal(describe({ ...candidates[5], state: undefined, closedAt: undefined }), 'Closed')
  assert.equal(describe(candidates[4]), 'This sprint · Ana Diaz')
  assert.equal(describe({ ...candidates[4], iterationPath: undefined, assignedTo: undefined }), 'Backlog · Unassigned')
  assert.equal(describe({ ...candidates[1], createdAt: new Date(2026, 3, 29, 23).toISOString() }), 'filed yesterday')
  assert.equal(describe(candidates[1]), '')
})

test('the quick filter finds an item by its match', () => {
  const matches = findTriageMatches(queue, candidates)
  const filter = (input: string) => filterTriageItems(queue, input, sprints, { bug: [], other: [] }, matches).map(({ id }: TriageItem) => id)
  assert.deepEqual(filter('possible regression'), [1])
  assert.deepEqual(filter('also in triage'), [2, 3])
  assert.deepEqual(filter('regression'), [1])
  assert.deepEqual(filterTriageItems(queue, 'regression', sprints, { bug: [], other: [] }), [], 'without matches, nothing says regression')
})

function renderDocument(component: unknown, props: Record<string, unknown>) {
  const html = renderToStaticMarkup(createElement(Root, null, createElement(component as never, {
    items: queue, resolveSprint: sprints, ageFlagDays: 2, readinessChecks: { bug: [], other: [] }, excludedIterationPaths: [],
    waitingTags: [], matches: findTriageMatches(queue, candidates), onCompare: () => {}, ...props,
  })))
  const dom = new JSDOM(html)
  for (const style of dom.window.document.querySelectorAll('style')) style.remove()
  return dom.window.document
}

test('the Table puts a one-line strip under a matched title, tinted for a possible regression', () => {
  const doc = renderDocument(TriageTable, {})
  const strip = (id: number) => doc.querySelector(`tr:has(a[href="${url(id)}"]) [data-triage-match]`)
  assert.equal(strip(4), null)
  const regression = strip(1)!
  assert.equal(regression.getAttribute('data-triage-match'), 'closed')
  assert.ok(regression.classList.contains('regression') && regression.classList.contains('compact'))
  assert.equal(regression.querySelector('.lead')?.textContent, 'Possible regression of 20')
  assert.equal(regression.querySelector('.match-title'), null, 'the title and detail wait in the tooltip')
  assert.equal(regression.querySelector('button')?.textContent, 'Compare 1 with 20')
  assert.equal(strip(2)?.getAttribute('data-triage-match'), 'queue')
  assert.ok(!strip(2)!.classList.contains('regression'))
  assert.equal(strip(2)?.querySelector('.lead')?.textContent, 'Also in triage: 3')
})

test('an Inbox card shows the full strip: the matched title with its shared words marked, and the detail', () => {
  const doc = renderDocument(TriageInbox, { lastVisit: new Date(2026, 3, 29, 17).getTime(), now })
  const strip = doc.querySelector('[data-triage-card="1"] [data-triage-match]')!
  assert.ok(!strip.classList.contains('compact'))
  assert.equal(strip.querySelector('.lead')?.textContent, 'Possible regression of 20')
  assert.equal(strip.querySelector('.match-title')?.textContent, 'Exported PDF drawings lose watermark')
  assert.deepEqual([...strip.querySelectorAll('.match-title mark')].map((mark) => mark.textContent), ['Exported', 'PDF', 'drawings', 'watermark'])
  assert.equal(strip.querySelector('.detail')?.textContent, '· Done Apr 14')
  assert.equal(strip.querySelector('button')?.textContent, 'Compare 1 with 20')
  assert.equal(doc.querySelector('[data-triage-card="4"] [data-triage-match]'), null)
})
