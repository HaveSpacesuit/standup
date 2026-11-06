import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import type { TestChartFocus, TestSeries } from '../src/features/standup/components/TestPassChart.tsx'
import type { TestChange, TestRun, TestRunSelection } from '../src/features/standup/utils/testHealth.ts'

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
const { TestPassChart } = await server.ssrLoadModule('/src/features/standup/components/TestPassChart.tsx')

const pipeline = (id: string, name: string, stageName: string) => ({
  id, name, stageName, orgName: 'example org', projectName: 'Example', kind: 'build' as const, definitionId: 7,
})
const run = (day: number, passed: number, total: number, runId: number) => ({
  date: new Date(2026, 9, day, 6).toISOString(), passed, total, runId,
})
// Thu Oct 1 through Wed Oct 14, 2026.
const range = { start: new Date(2026, 9, 1, 9).getTime(), end: new Date(2026, 9, 14, 9).getTime() }
const series: TestSeries[] = [
  {
    pipeline: pipeline('web', 'ProjectWise Web (PWW)', 'E2E'),
    color: 'var(--stratakit-color-bg-accent-base)',
    shape: 'circle',
    points: [run(1, 100, 100, 11), run(2, 97, 100, 12), run(8, 842 - 77, 842, 13)],
  },
  {
    pipeline: pipeline('view', 'WebView (WV)', 'Smoke'),
    color: 'var(--stratakit-color-bg-info-base)',
    shape: 'square',
    points: [run(5, 50, 50, 21), run(6, 49, 50, 22)],
  },
]

const markup = () => renderToStaticMarkup(createElement(Root, null, createElement(TestPassChart, { series, range, onSelectRun: () => {} })))

test('the overlay is an SVG with week ticks, shaded weekends, a titled log axis, and shaped markers', () => {
  const html = markup()

  assert.doesNotMatch(html, /<canvas/)
  assert.match(html, /<svg[^>]*role="img"[^>]*aria-label="E2E test pass percentage by pipeline over time"/)
  assert.match(html, />Tests passed</)
  assert.equal(html.match(/class="tests-weekend"/g)?.length, 4, 'two weekends in the range')
  for (const label of ['Oct 5', 'Oct 12']) assert.match(html, new RegExp(`>${label}</text>`))
  for (const tick of ['50%', '98%', '100%']) assert.match(html, new RegExp(`>${tick}</text>`))
  assert.equal(html.match(/<rect x="[^"]*" y="[^"]*" width="5\.6" height="5\.6"/g)?.length, 2, 'the second pipeline uses squares')
})

test('a gap of four or more days is dashed, and nearby runs are joined by straight lines', () => {
  const html = markup()
  assert.equal(html.match(/stroke-dasharray:4 4/g)?.length, 1, 'only the web pipeline has a long gap')
  assert.doesNotMatch(html, /\sC\d/, 'no curves')
})

test('the chart has no legend chips; the health tiles above it are the legend', () => {
  const html = markup()
  assert.doesNotMatch(html, /aria-label="Pipelines"/)
  assert.doesNotMatch(html, /Click to show or hide/)
  assert.doesNotMatch(html, /tests-focus-band/, 'no band without a focused pipeline')
})

type ChartExtras = {
  changes?: TestChange[]
  selection?: TestRunSelection | null
  onSelectRun?: (pipelineId: string, runId: number) => void
}

async function render(t: TestContext, focus: TestChartFocus | null = null, extra: ChartExtras = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  await act(async () => root.render(createElement(Root, null, createElement(TestPassChart, { series, range, focus, onSelectRun: () => {}, ...extra }))))
  return host
}

const document = dom.window.document

test('focusing a pipeline fades the others, shades its usual range, and limits hover to its runs', async (t) => {
  const host = await render(t, { id: 'view', highPosition: 0, lowPosition: Math.log10(3) })
  const svg = host.querySelector('svg[role="img"]')!
  const group = (id: string) => svg.querySelector<SVGGElement>(`g[data-pipeline="${id}"]`)!
  assert.equal(group('web').style.opacity, '0.18')
  assert.equal(group('view').style.opacity, '1')
  assert.ok(group('web').compareDocumentPosition(group('view')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 'the focused line draws on top')

  const band = svg.querySelector('[data-testid="tests-focus-band"]')!
  const gridY = (percentIndex: number) => Number(svg.querySelectorAll('.tests-grid line')[percentIndex].getAttribute('y1'))
  const bandTop = Number(band.getAttribute('y'))
  assert.ok(Math.abs(bandTop - gridY(6)) < 0.5, 'the band starts at 100%')
  assert.ok(Math.abs(bandTop + Number(band.getAttribute('height')) - gridY(5)) < 0.5, 'and ends at 98%')

  const fadedRun = [...group('web').querySelectorAll('circle')].at(-1)!
  const pointer = { bubbles: true, clientX: Number(fadedRun.getAttribute('cx')), clientY: Number(fadedRun.getAttribute('cy')) }
  await act(async () => svg.dispatchEvent(new dom.window.MouseEvent('mousemove', pointer)))
  assert.equal(document.querySelector('[role="tooltip"]'), null, 'faded runs are not hoverable')
})

test('hovering near a run leads with failures, and clicking selects the run', async (t) => {
  const selected: unknown[][] = []
  const host = await render(t, null, { onSelectRun: (...args) => selected.push(args) })
  const svg = host.querySelector('svg[role="img"]')!
  const lastRun = [...svg.querySelectorAll('circle')].at(-1)!
  const pointer = { bubbles: true, clientX: Number(lastRun.getAttribute('cx')) + 10, clientY: Number(lastRun.getAttribute('cy')) - 10 }

  await act(async () => svg.dispatchEvent(new dom.window.MouseEvent('mousemove', pointer)))
  const tip = document.querySelector('[role="tooltip"]')
  assert.ok(tip, 'the tooltip opens within 24px of a run')
  assert.match(tip.textContent!, /PWW · E2E/)
  assert.match(tip.textContent!, /77 failed of 842 · 90\.9% passed/)
  assert.match(tip.textContent!, /Click for run details/)
  assert.ok(svg.querySelector('.tests-hover-ring'))

  await act(async () => svg.dispatchEvent(new dom.window.MouseEvent('click', pointer)))
  assert.deepEqual(selected, [['web', 13]])

  // React builds onMouseLeave from mouseout.
  await act(async () => svg.dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })))
  assert.equal(svg.querySelector('.tests-hover-ring'), null)
})

test('runs with changes get a toned ring and list them in the tip; the selected run gets a dashed line', async (t) => {
  const run = { runId: 13, rate: 765 / 842 * 100, failed: 77, total: 842 } as TestRun
  const changes: TestChange[] = [{ id: 'web:drop:13', type: 'drop', pipelineId: 'web', run, day: 7, t: 7.25 }]
  const host = await render(t, null, { changes, selection: { pipelineId: 'web', runId: 13, changeId: 'web:drop:13' } })
  const svg = host.querySelector('svg[role="img"]')!
  const ring = svg.querySelector('[data-change="web:drop:13"]')!
  assert.match(ring.getAttribute('class')!, /tests-change-ring-critical/)
  assert.equal(ring.closest('g[data-pipeline]')!.getAttribute('data-pipeline'), 'web', 'the ring fades with its line')
  assert.equal(svg.querySelectorAll('.tests-change-ring').length, 1)

  const selected = svg.querySelector('[data-testid="tests-overlay-selected"]')!
  const lastRun = [...svg.querySelectorAll('g[data-pipeline="web"] circle:not(.tests-change-ring)')].at(-1)!
  assert.ok(Math.abs(Number(selected.querySelector('circle')!.getAttribute('cx')) - Number(lastRun.getAttribute('cx'))) < 0.1)

  const pointer = { bubbles: true, clientX: Number(lastRun.getAttribute('cx')), clientY: Number(lastRun.getAttribute('cy')) }
  await act(async () => svg.dispatchEvent(new dom.window.MouseEvent('mousemove', pointer)))
  assert.match(document.querySelector('[role="tooltip"]')!.textContent!, /Sharp drop to 90\.9%/)
})
