import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import { createTestTimeAxis, testChanges, testPipelineHealth, type TestHealthEntry } from '../src/features/standup/utils/testHealth.ts'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { TestChangesPanel } = await server.ssrLoadModule('/src/features/standup/components/TestChangesPanel.tsx')
const { testSprintBands } = await server.ssrLoadModule('/src/features/standup/utils/testSprints.ts')

// Thu Oct 1 through Fri Oct 30, 2026; today is Oct 30 (day 29).
const axis = createTestTimeAxis({ start: new Date(2026, 9, 1, 9).getTime(), end: new Date(2026, 9, 30, 9).getTime() })
const options = { staleDays: 2, fewerPercent: 80 }
const at = (day: number, passed: number, total = 1000) => ({ date: new Date(2026, 9, day, 6).toISOString(), passed, total, runId: day })
const weekdays = [1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29]
const usual = weekdays.map((day, index) => at(day, [990, 992, 994, 991, 993][index % 5]))
const entry = (id: string, name: string, stageName: string, points: ReturnType<typeof at>[]): TestHealthEntry => ({
  pipeline: { id, name, stageName, orgName: 'org', projectName: 'Example', kind: 'build', definitionId: 7 },
  color: 'var(--stratakit-color-bg-accent-base)', shape: 'circle', health: testPipelineHealth(points, axis, options)!,
})
const entries = [
  entry('web', 'ProjectWise Web (PWW)', 'E2E', [...usual.map((run) => run.runId === 8 ? at(8, 850) : run), at(30, 993)]),
  entry('view', 'WebView (WV)', 'E2E', [...usual, at(30, 900)]),
  entry('api', 'Service API (API)', 'Integration', [...usual, at(30, 992)]),
]
const changes = testChanges(entries, axis, options)
const sprints = testSprintBands([
  { name: 'Sprint 43', path: 'Example\\Sprint 43', timeFrame: 'current', startDate: '2026-10-20T00:00:00Z', finishDate: '2026-11-02T00:00:00Z' },
], axis)
const props = {
  loading: false, entries, changes, axis, sprints, lookbackDays: 30, focusId: null, onClearFocus: () => {},
  selectedChangeId: null, onSelectChange: () => {},
}
const render = (overrides: Partial<typeof props> = {}) => {
  const html = renderToStaticMarkup(createElement(Root, null, createElement(TestChangesPanel, { ...props, ...overrides })))
  const doc = new JSDOM(html).window.document
  // Emotion inlines <style> elements next to styled elements during SSR.
  for (const style of doc.querySelectorAll('style')) style.remove()
  return doc
}
const items = (doc: Document, label: string) =>
  [...doc.querySelectorAll(`ul[aria-label="${label}"] button[data-change]`)].map((item) => item.getAttribute('data-change'))
const heading = (doc: Document) => doc.querySelector('h2')!.textContent

test('changes are grouped into this sprint and earlier, newest first, each naming its pipeline and detail', () => {
  assert.deepEqual(changes.map((change) => change.id), ['view:drop:30', 'web:recover:9', 'web:drop:8'])
  const doc = render()
  assert.equal(heading(doc), 'Changes3')
  assert.deepEqual([...doc.querySelectorAll('h3')].map((group) => group.textContent), ['This sprint1Sprint 43 · Day 9 of 10', 'Earlier2'])
  assert.deepEqual(items(doc, 'Changes this sprint'), ['view:drop:30'])
  assert.deepEqual(items(doc, 'Earlier changes'), ['web:recover:9', 'web:drop:8'])
  const drop = doc.querySelector('button[data-change="view:drop:30"]')!
  assert.equal(drop.getAttribute('aria-pressed'), 'false')
  assert.match(drop.textContent!, /^Sharp drop to 90%Oct 30WV · E2E · 100 failed of 1,000 · usually 99–99\.4%$/)
  assert.match(doc.body.textContent!, /Detected against each pipeline’s usual range\. Select one to see its run\./)
})

test('without a current sprint, the recent group is the last two weeks', () => {
  const doc = render({ sprints: [] })
  assert.deepEqual([...doc.querySelectorAll('h3')].map((group) => group.textContent), ['Last 2 weeks1', 'Earlier2'])
  assert.deepEqual(items(doc, 'Changes in the last 2 weeks'), ['view:drop:30'])
})

test('a focused pipeline shows only its changes with a way back to all, and the selected change is pressed', () => {
  const doc = render({ focusId: 'web', selectedChangeId: 'web:drop:8' })
  assert.equal(heading(doc), 'Changes2')
  assert.match(doc.body.textContent!, /Showing PWW · E2E only\. Show all/)
  assert.match(doc.body.textContent!, /No changes this sprint\./)
  assert.deepEqual(items(doc, 'Earlier changes'), ['web:recover:9', 'web:drop:8'])
  assert.equal(doc.querySelector('button[data-change="web:drop:8"]')!.getAttribute('aria-pressed'), 'true')

  assert.match(render({ focusId: 'api' }).body.textContent!, /No changes for API · Integration in the last 30 days\./)
})

test('while loading, the panel shows placeholder rows and no count', () => {
  const doc = render({ loading: true, changes: [] })
  assert.equal(heading(doc), 'Changes')
  assert.equal(doc.querySelectorAll('[aria-hidden="true"] .MuiSkeleton-root').length, 4)
  assert.equal(doc.querySelectorAll('button[data-change]').length, 0)
})
