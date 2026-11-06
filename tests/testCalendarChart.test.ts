import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import { createTestTimeAxis, testChanges, testPipelineHealth, type TestHealthEntry, type TestRunSelection } from '../src/features/standup/utils/testHealth.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Document: dom.window.Document,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  ShadowRoot: dom.window.ShadowRoot,
  MutationObserver: dom.window.MutationObserver,
  IS_REACT_ACT_ENVIRONMENT: true,
})

const { createRoot } = await import('react-dom/client')
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(async () => {
  await server.close()
  dom.window.close()
})
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { TestCalendarChart } = await server.ssrLoadModule('/src/features/standup/components/TestCalendarChart.tsx')
const { testSprintBands } = await server.ssrLoadModule('/src/features/standup/utils/testSprints.ts')

// Thu Oct 1 through Fri Oct 30, 2026; today is Oct 30 (day 29).
const axis = createTestTimeAxis({ start: new Date(2026, 9, 1, 9).getTime(), end: new Date(2026, 9, 30, 9).getTime() })
const options = { staleDays: 2, fewerPercent: 80 }
const at = (day: number, passed: number, total = 1000, hour = 6, runId = day) =>
  ({ date: new Date(2026, 9, day, hour).toISOString(), passed, total, runId })
const weekdays = [1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29]
const usual = weekdays.map((day, index) => at(day, [990, 992, 994, 991, 993][index % 5]))
const pipeline = (id: string, name: string, stageName: string) => ({
  id, name, stageName, orgName: 'org', projectName: 'Example', kind: 'build' as const, definitionId: 7,
})
const entry = (pipelineValue: ReturnType<typeof pipeline>, points: ReturnType<typeof at>[]): TestHealthEntry => ({
  pipeline: pipelineValue, color: 'var(--stratakit-color-bg-accent-base)', shape: 'circle', health: testPipelineHealth(points, axis, options)!,
})
const entries = [
  entry(pipeline('web', 'ProjectWise Web (PWW)', 'E2E'), [...usual, at(29, 980, 1000, 14, 2914), at(30, 993)]),
  entry(pipeline('view', 'WebView (WV)', 'E2E'), [...usual, at(30, 900)]),
  entry(pipeline('smoke', 'ProjectWise Web (PWE)', 'Smoke'), [...usual, at(30, 121, 121)]),
  entry(pipeline('adm', 'Admin (ADM)', 'Entire pipeline'), usual.filter((run) => Date.parse(run.date) < new Date(2026, 9, 28).getTime())),
  entry(pipeline('api', 'Service API (API)', 'Integration'), usual),
]
const iteration = (name: string, startDate: string, finishDate: string) => ({ name, path: `Example\\${name}`, timeFrame: 'past' as const, startDate, finishDate })
const sprints = testSprintBands([
  iteration('Sprint 41', '2026-09-22T00:00:00Z', '2026-10-05T00:00:00Z'),
  iteration('Sprint 42', '2026-10-06T00:00:00Z', '2026-10-19T00:00:00Z'),
  iteration('Sprint 43', '2026-10-20T00:00:00Z', '2026-11-02T00:00:00Z'),
], axis)
const changes = testChanges(entries, axis, options)
const props = {
  entries, axis, sprints, lookbackDays: 30, focusId: null as string | null, onToggleFocus: (_id: string) => {},
  changes, selection: null as TestRunSelection | null, onSelectRun: (_pipelineId: string, _runId: number) => {},
}

const document = dom.window.document

async function render(t: TestContext, extra: Partial<typeof props> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  await act(async () => root.render(createElement(Root, null, createElement(TestCalendarChart, { ...props, ...extra }))))
  return host
}

const row = (host: ParentNode, id: string) => host.querySelector<SVGSVGElement>(`svg[data-calendar="${id}"]`)!
const cell = (host: ParentNode, id: string, day: number) => row(host, id).querySelector<SVGRectElement>(`rect[data-day="${day}"]`)
const kinds = (host: ParentNode, id: string) => {
  const counts: Record<string, number> = {}
  for (const rect of row(host, id).querySelectorAll('rect[data-day]')) {
    const kind = rect.getAttribute('class')!.split(' ').find((name) => name.startsWith('tests-cal-') && name !== 'tests-cal-cell' && name !== 'tests-cal-selected')!
    counts[kind] = (counts[kind] ?? 0) + 1
  }
  return counts
}

test('one row of day cells per pipeline, colored by each day\'s worst run, with no cells on weekends nobody runs', async (t) => {
  const host = await render(t)
  assert.equal(host.querySelectorAll('svg[data-calendar]').length, 5)
  assert.deepEqual(kinds(host, 'web'), { 'tests-cal-ok': 21, 'tests-cal-below': 1 })
  assert.deepEqual(kinds(host, 'view'), { 'tests-cal-ok': 21, 'tests-cal-sharp': 1 })
  assert.deepEqual(kinds(host, 'smoke'), { 'tests-cal-ok': 21, 'tests-cal-fewer': 1 })
  assert.deepEqual(kinds(host, 'adm'), { 'tests-cal-ok': 19, 'tests-cal-miss': 3 }, 'a stale pipeline\'s today is a missed day')
  assert.deepEqual(kinds(host, 'api'), { 'tests-cal-ok': 21, 'tests-cal-today': 1 })

  assert.match(cell(host, 'web', 28)!.getAttribute('class')!, /tests-cal-below/, 'the below-usual run outranks the usual one that day')
  assert.match(cell(host, 'view', axis.todayIndex)!.getAttribute('class')!, /tests-cal-sharp/)
  assert.equal(cell(host, 'web', 2), null, 'Saturday has no cell')
  assert.equal(cell(host, 'web', 3), null, 'nor Sunday')

  assert.equal(row(host, 'smoke').querySelectorAll('pattern').length, 1, 'only a row with fewer tests needs the hatch')
  assert.equal(row(host, 'web').querySelectorAll('pattern').length, 0)
  const fewer = row(host, 'smoke').querySelector('.tests-cal-fewer')!
  assert.equal(fewer.getAttribute('fill'), `url(#${row(host, 'smoke').querySelector('pattern')!.id})`)

  assert.equal(
    row(host, 'adm').getAttribute('aria-label'),
    'ADM Entire pipeline, one cell per day for the last 30 days: 19 usual days, 3 days without a run',
  )
  assert.equal(
    row(host, 'web').getAttribute('aria-label'),
    'PWW E2E, one cell per day for the last 30 days: 21 usual days, 1 day below usual',
  )
})

test('a pipeline that runs on weekends gets missed-day cells on weekends, but never on the partial first day', async (t) => {
  const weekend = entry(pipeline('daily', 'Daily (DLY)', 'E2E'), [...usual.slice(1), at(3, 991), at(4, 992)])
  const host = await render(t, { entries: [weekend] })
  assert.equal(cell(host, 'daily', 0), null, 'the window opens partway through its first day')
  assert.match(cell(host, 'daily', 2)!.getAttribute('class')!, /tests-cal-ok/)
  assert.match(cell(host, 'daily', 9)!.getAttribute('class')!, /tests-cal-miss/, 'a later Saturday without a run')
})

test('hovering a cell tips its day, run, and changes; clicking selects that day\'s worst run', async (t) => {
  const selected: unknown[][] = []
  const host = await render(t, { onSelectRun: (...args) => selected.push(args) })
  const hover = async (target: Element) => act(async () => target.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true })))
  const tip = () => document.querySelector('[role="tooltip"]')?.textContent ?? null

  await hover(cell(host, 'web', 28)!)
  assert.match(tip()!, /PWW E2E/)
  assert.match(tip()!, /Below usual · worst of 2 runs/)
  assert.match(tip()!, /98% passed · 20 failed of 1,000/)
  assert.match(tip()!, /Click for run details/)
  await act(async () => cell(host, 'web', 28)!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.deepEqual(selected, [['web', 2914]])

  await hover(cell(host, 'smoke', axis.todayIndex)!)
  assert.match(tip()!, /Fewer tests ran/)
  assert.match(tip()!, /100% passed · 0 failed of 121 \(usually ~1,000\)/)

  await hover(cell(host, 'view', axis.todayIndex)!)
  assert.match(tip()!, /Sharp drop to 90%/)

  await hover(cell(host, 'api', axis.todayIndex)!)
  assert.match(tip()!, /Not run yet today/)
  await act(async () => cell(host, 'api', axis.todayIndex)!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(selected.length, 1, 'a day without a run has nothing to select')
})

test('the selected run\'s cell is outlined and drawn last, so its outline sits over its neighbors', async (t) => {
  const host = await render(t, { selection: { pipelineId: 'view', runId: 30, changeId: 'view:drop:30' } })
  const marked = host.querySelectorAll('.tests-cal-selected')
  assert.equal(marked.length, 1)
  assert.equal(marked[0], cell(host, 'view', axis.todayIndex))
  assert.equal(row(host, 'view').querySelector('rect[data-day]:last-of-type'), marked[0])
})

test('the head marks sprint starts and Mondays, and the key names every cell', async (t) => {
  const host = await render(t)
  const head = host.querySelector('[data-testid="tests-calendar-head"]')!
  assert.deepEqual([...head.querySelectorAll('.tests-sprint-label')].map((label) => label.textContent), ['Sprint 41', 'Sprint 42', 'Sprint 43 · Day 9 of 10'])
  assert.deepEqual([...head.querySelectorAll('.tests-axis')].map((label) => label.textContent), ['Oct 5', 'Oct 12', 'Oct 19', 'Oct 26'])
  assert.equal(head.querySelectorAll('.tests-sprint-line').length, 2, 'Sprints 42 and 43 start on the calendar')
  assert.equal(host.querySelectorAll('svg[data-calendar] .tests-sprint-line').length, 2 * 5, 'and the lines run through every row')
  assert.deepEqual(
    [...host.querySelectorAll('[data-testid="tests-calendar-key"] > span')].map((item) => item.textContent),
    ['Usual', 'Below usual', 'Sharp drop', 'Fewer tests ran', 'No run', 'Not run yet today'],
  )
})

test('clicking a row label toggles focus on its pipeline; the other rows dim', async (t) => {
  const toggled: string[] = []
  const host = await render(t, { focusId: 'view', onToggleFocus: (id) => toggled.push(id) })
  const label = (id: string) => host.querySelector<HTMLButtonElement>(`button[data-pipeline="${id}"]`)!
  assert.equal(label('view').getAttribute('aria-pressed'), 'true')
  assert.equal(label('web').style.opacity, '0.4')
  assert.equal((row(host, 'web').parentElement as HTMLElement).style.opacity, '0.4')
  assert.equal((row(host, 'view').parentElement as HTMLElement).style.opacity, '1')

  await act(async () => label('web').click())
  assert.deepEqual(toggled, ['web'])
})

test('server rendering draws every row without measuring', () => {
  const html = renderToStaticMarkup(createElement(Root, null, createElement(TestCalendarChart, props)))
  assert.equal(html.match(/<svg[^>]*data-calendar=/g)?.length, 5)
  assert.match(html, /data-testid="tests-calendar-key"/)
})
