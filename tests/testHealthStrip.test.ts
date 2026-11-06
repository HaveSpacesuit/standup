import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import { createTestTimeAxis, testPipelineHealth, type TestHealthEntry } from '../src/features/standup/utils/testHealth.ts'

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
const { TestHealthStrip } = await server.ssrLoadModule('/src/features/standup/components/TestHealthStrip.tsx')

// Thu Oct 1 through Fri Oct 30, 2026.
const axis = createTestTimeAxis({ start: new Date(2026, 9, 1, 9).getTime(), end: new Date(2026, 9, 30, 9).getTime() })
const options = { staleDays: 2, fewerPercent: 80 }
const at = (day: number, passed: number, total = 1000) => ({ date: new Date(2026, 9, day, 6).toISOString(), passed, total, runId: day })
const weekdays = [1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29]
const usual = weekdays.map((day, index) => at(day, [990, 992, 994, 991, 993][index % 5]))
const pipeline = (id: string, name: string, stageName: string, shortName?: string) => ({
  id, name, stageName, shortName, orgName: 'org', projectName: 'Example', kind: 'build' as const, definitionId: 7,
})
const entry = (pipelineValue: ReturnType<typeof pipeline>, points: ReturnType<typeof at>[]): TestHealthEntry => ({
  pipeline: pipelineValue, color: 'var(--stratakit-color-bg-accent-base)', shape: 'circle', health: testPipelineHealth(points, axis, options)!,
})
const entries = [
  entry(pipeline('web', 'ProjectWise Web (PWW)', 'E2E'), [...usual, at(30, 993)]),
  entry(pipeline('view', 'WebView (WV)', 'E2E', 'WebView'), [...usual, at(30, 900)]),
  entry(pipeline('smoke', 'ProjectWise Web (PWE)', 'Smoke'), [...usual, at(30, 121, 121)]),
  entry(pipeline('adm', 'Admin (ADM)', 'Entire pipeline'), usual.filter((run) => Date.parse(run.date) < new Date(2026, 9, 28).getTime())),
]
const props = { entries, axis, options, lookbackDays: 30, focusId: null, onToggleFocus: () => {} }

test('one tile per pipeline shows its latest pass rate, change, status, and a status reason for assistive tech', () => {
  const html = renderToStaticMarkup(createElement(Root, null, createElement(TestHealthStrip, props)))
  assert.match(html, /role="group" aria-label="Pipeline health"/)
  assert.match(html, /aria-label="PWW E2E: 99\.3%, Usual"/)
  assert.match(html, /aria-label="WebView E2E: 90%, Sharp drop"/, 'a saved short name replaces the default')
  assert.match(html, /aria-label="PWE Smoke: 100%, Fewer tests"/)
  assert.match(html, /aria-label="ADM Entire pipeline: 99\.1%, No recent runs"/)
  assert.match(html, /\+0\.1 vs median 99\.2%/)
  assert.match(html, /1,000 tests · 7 failed/)
  assert.match(html, /121 of ~1,000 tests/)
  assert.match(html, /3 working days ago/)
  assert.match(html, /last result/)
  assert.equal(html.match(/aria-pressed="false"/g)?.length, 4)
  const describedBy = /aria-describedby="([^"]+)"/.exec(html)![1]
  assert.match(html, new RegExp(`id="${describedBy}"[^>]*>Latest run is within or above this pipeline&#x27;s usual range, 99–99\\.4%`))
})

test('sparklines show the usual band, hatch the days since a stale run, and dot only flagged runs and the latest', () => {
  const html = renderToStaticMarkup(createElement(Root, null, createElement(TestHealthStrip, props)))
  assert.equal(html.match(/class="tests-band"/g)?.length, 4)
  assert.equal(html.match(/<pattern /g)?.length, 1, 'only the stale pipeline hatches')
  assert.match(html, /class="tests-point tests-point-sharp"/)
  assert.match(html, /class="tests-point tests-point-fewer"/)
  assert.equal(html.match(/class="tests-point/g)?.length, 4, 'one latest dot per tile; the earlier runs were all usual')
})

const document = dom.window.document

async function render(t: TestContext, focusId: string | null, onToggleFocus: (id: string) => void) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  await act(async () => root.render(createElement(Root, null, createElement(TestHealthStrip, { ...props, focusId, onToggleFocus }))))
  return host
}

test('clicking a tile toggles focus on its pipeline; the other tiles dim', async (t) => {
  const toggled: string[] = []
  const host = await render(t, 'view', (id) => toggled.push(id))
  const tile = (id: string) => host.querySelector<HTMLButtonElement>(`button[data-pipeline="${id}"]`)!
  assert.equal(tile('view').getAttribute('aria-pressed'), 'true')
  assert.equal(tile('web').getAttribute('aria-pressed'), 'false')
  assert.equal(tile('web').style.opacity, '0.55')
  assert.equal(tile('view').style.opacity, '1')

  await act(async () => tile('web').click())
  await act(async () => tile('view').click())
  assert.deepEqual(toggled, ['web', 'view'])
})
