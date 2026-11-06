import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import { createTestTimeAxis, formatRunDay, testChanges, testPipelineHealth, type TestChange, type TestHealthEntry, type TestRunSelection } from '../src/features/standup/utils/testHealth.ts'

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
const { TestRowsChart } = await server.ssrLoadModule('/src/features/standup/components/TestRowsChart.tsx')
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
const iteration = (name: string, startDate?: string, finishDate?: string) => ({ name, path: `Example\\${name}`, timeFrame: 'past' as const, startDate, finishDate })
const iterations = [
  iteration('Sprint 43', '2026-10-20T00:00:00Z', '2026-11-02T00:00:00Z'),
  iteration('Sprint 40', '2026-09-08T00:00:00Z', '2026-09-21T00:00:00Z'),
  iteration('Sprint 41', '2026-09-22T00:00:00Z', '2026-10-05T00:00:00Z'),
  iteration('Sprint 44', '2026-11-03T00:00:00Z', '2026-11-16T00:00:00Z'),
  iteration('Backlog'),
  iteration('Sprint 42', '2026-10-06T00:00:00Z', '2026-10-19T00:00:00Z'),
]
const sprints = testSprintBands(iterations, axis)
const changes = testChanges(entries, axis, options)
const props = {
  entries, axis, sprints, lookbackDays: 30, focusId: null, onToggleFocus: () => {},
  changes, selection: null as TestRunSelection | null, onSelectRun: () => {}, onSelectChange: () => {},
}

test('sprint bands clip to the chart, skip undated or out-of-range sprints, and count working days in the current one', () => {
  assert.deepEqual(sprints, [
    { name: 'Sprint 41', start: 0, end: 5, clipped: true, current: false, label: 'Sprint 41' },
    { name: 'Sprint 42', start: 5, end: 19, clipped: false, current: false, label: 'Sprint 42' },
    { name: 'Sprint 43', start: 19, end: 30, clipped: false, current: true, label: 'Sprint 43 · Day 9 of 10' },
  ])
  assert.deepEqual(testSprintBands([], axis), [])
})

test('one labelled row per pipeline on a shared axis, with its usual band, sprint starts, and a toned latest value', () => {
  const html = renderToStaticMarkup(createElement(Root, null, createElement(TestRowsChart, props)))
  assert.equal(html.match(/<svg[^>]*data-row=/g)?.length, 5)
  assert.match(html, /aria-label="PWW E2E pass rate, last 30 days"/)
  assert.match(html, /aria-label="PWW E2E: 99\.3%, Usual"/)
  assert.match(html, /aria-label="WV E2E: 90%, Sharp drop"/)
  assert.match(html, /aria-label="PWE Smoke: 100%, Fewer tests"/)
  assert.match(html, /aria-label="ADM Entire pipeline: 99\.1%, No recent runs"/)
  assert.match(html, /121 of ~1,000 tests/)
  assert.match(html, /3 working days ago/)
  assert.equal(html.match(/class="tests-band"/g)?.length, 5)

  assert.match(html, /class="tests-sprint-label"[^>]*>Sprint 41</, 'a clipped sprint keeps its name')
  assert.match(html, /class="tests-sprint-label tests-sprint-label-current"[^>]*>Sprint 43 · Day 9 of 10</)
  assert.equal(html.match(/class="tests-sprint-line"/g)?.length, 2 * 6, 'Sprints 42 and 43 start on the chart: once in the header and in each row')

  assert.match(html, /class="tests-latest tests-latest-critical"[^>]*>90%</)
  assert.match(html, /class="tests-latest tests-latest-attention"[^>]*>100%</)
  assert.match(html, /class="tests-latest tests-latest-stale"[^>]*>99\.1%</)
  assert.equal(html.match(/class="tests-latest"/g)?.length, 2, 'usual pipelines stay neutral')
})

test('only a stale pipeline hatches the days since its last run', () => {
  const html = renderToStaticMarkup(createElement(Root, null, createElement(TestRowsChart, props)))
  assert.equal(html.match(/<pattern /g)?.length, 1)
  assert.equal(html.match(/data-testid="tests-row-stale"/g)?.length, 1)
  assert.match(html, />No runs for<\/tspan>.*>3 working days<\/tspan>/)
  assert.doesNotMatch(html, /tests-row-crosshair/, 'no crosshair until a row is hovered')
})

const document = dom.window.document
const PLOT_LEFT = 40
const PLOT_WIDTH = 1110 - 150 - 40 - 54

async function render(t: TestContext, focusId: string | null = null, onToggleFocus: (id: string) => void = () => {}, extra: Partial<typeof props> = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  await act(async () => root.render(createElement(Root, null, createElement(TestRowsChart, { ...props, focusId, onToggleFocus, ...extra }))))
  return host
}

const row = (host: HTMLElement, id: string) => host.querySelector<SVGSVGElement>(`svg[data-row="${id}"]`)!

async function hover(target: Element, day: number) {
  const clientX = PLOT_LEFT + ((day + 0.5) / axis.dayCount) * PLOT_WIDTH
  await act(async () => target.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, clientX })))
}

const pill = (host: HTMLElement, id: string) => {
  const group = row(host, id).querySelector('.tests-pill')
  return group ? { text: group.textContent, tone: group.getAttribute('class')!.replace('tests-pill ', '') } : null
}

test('hovering any row shows a crosshair on every row for that day, with each pipeline\'s lowest run', async (t) => {
  const host = await render(t)
  await hover(row(host, 'view'), axis.todayIndex)
  assert.equal(host.querySelectorAll('[data-testid="tests-row-crosshair"]').length, 5)
  assert.deepEqual(pill(host, 'web'), { text: '99.3%', tone: 'tests-pill-plain' })
  assert.deepEqual(pill(host, 'view'), { text: '90%', tone: 'tests-pill-critical' })
  assert.deepEqual(pill(host, 'smoke'), { text: '100%', tone: 'tests-pill-attention' })
  assert.deepEqual(pill(host, 'adm'), { text: 'no run', tone: 'tests-pill-muted' })
  assert.deepEqual(pill(host, 'api'), { text: 'not run yet', tone: 'tests-pill-muted' }, 'today is not over for a pipeline that still reports')
  assert.equal(host.querySelector('[data-testid="tests-rows-head"] .tests-pill')!.textContent, formatRunDay(new Date(2026, 9, 30)))

  await hover(row(host, 'adm'), axis.todayIndex - 1)
  assert.deepEqual(pill(host, 'web'), { text: '98% · lowest of 2', tone: 'tests-pill-attention' })
  assert.deepEqual(pill(host, 'api'), { text: '99%', tone: 'tests-pill-plain' })

  await hover(host.querySelector('button[data-pipeline="web"]')!, 0)
  assert.equal(host.querySelectorAll('[data-testid="tests-row-crosshair"]').length, 0, 'leaving the plots clears the crosshair')
})

test('clicking a row selects that day\'s lowest run', async (t) => {
  const selected: unknown[][] = []
  const host = await render(t, null, () => {}, { onSelectRun: (...args: unknown[]) => selected.push(args) })
  await hover(row(host, 'web'), axis.todayIndex - 1)
  await act(async () => row(host, 'web').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.deepEqual(selected, [['web', 2914]])

  await hover(row(host, 'adm'), axis.todayIndex)
  await act(async () => row(host, 'adm').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(selected.length, 1, 'a day without a run has nothing to select')
})

test('changes get a toned marker above their row; clicking one selects the change, not the day', async (t) => {
  assert.deepEqual(changes.map((change) => change.id), ['view:drop:30', 'smoke:fewer:30', 'adm:stale:27'])
  const picked: TestChange[] = []
  const days: unknown[] = []
  const host = await render(t, null, () => {}, {
    onSelectChange: (change: TestChange) => picked.push(change),
    onSelectRun: (...args: unknown[]) => days.push(args),
  })
  const marker = (id: string) => host.querySelector<SVGPolygonElement>(`polygon[data-change="${id}"]`)!
  assert.match(marker('view:drop:30').getAttribute('class')!, /tests-marker-critical/)
  assert.match(marker('smoke:fewer:30').getAttribute('class')!, /tests-marker-attention/)
  assert.match(marker('adm:stale:27').getAttribute('class')!, /tests-marker-neutral/)
  assert.equal(marker('view:drop:30').closest('svg')!.getAttribute('data-row'), 'view')
  assert.equal(marker('view:drop:30').querySelector('title')!.textContent, 'Sharp drop to 90%')
  assert.equal(row(host, 'web').querySelectorAll('.tests-marker').length, 0, 'a usual pipeline has no markers')

  await hover(row(host, 'view'), axis.todayIndex)
  await act(async () => marker('view:drop:30').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.deepEqual(picked.map((change) => change.id), ['view:drop:30'])
  assert.equal(days.length, 0)
})

test('the selected run gets a dashed line and ring in its own row, and its marker is highlighted', async (t) => {
  const host = await render(t, null, () => {}, { selection: { pipelineId: 'view', runId: 30, changeId: 'view:drop:30' } })
  const marked = host.querySelectorAll('[data-testid="tests-row-selected"]')
  assert.equal(marked.length, 1)
  assert.equal(marked[0].closest('svg')!.getAttribute('data-row'), 'view')
  assert.match(host.querySelector('polygon[data-change="view:drop:30"]')!.getAttribute('class')!, /tests-marker-selected/)
  assert.doesNotMatch(host.querySelector('polygon[data-change="smoke:fewer:30"]')!.getAttribute('class')!, /tests-marker-selected/)
})

test('clicking a row label toggles focus on its pipeline; the other rows dim', async (t) => {
  const toggled: string[] = []
  const host = await render(t, 'view', (id) => toggled.push(id))
  const label = (id: string) => host.querySelector<HTMLButtonElement>(`button[data-pipeline="${id}"]`)!
  assert.equal(label('view').getAttribute('aria-pressed'), 'true')
  assert.equal(label('web').getAttribute('aria-pressed'), 'false')
  assert.equal(label('web').style.opacity, '0.4')
  assert.equal(label('view').style.opacity, '1')
  assert.equal((row(host, 'web').parentElement as HTMLElement).style.opacity, '0.4')
  assert.equal((row(host, 'view').parentElement as HTMLElement).style.opacity, '1')

  await act(async () => label('web').click())
  assert.deepEqual(toggled, ['web'])
})
