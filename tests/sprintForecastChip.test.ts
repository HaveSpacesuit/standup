import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement } from 'react'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import type { SprintForecast } from '../src/features/standup/utils/sprintForecast.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Document: dom.window.Document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  ShadowRoot: dom.window.ShadowRoot,
  MutationObserver: dom.window.MutationObserver,
  IS_REACT_ACT_ENVIRONMENT: true,
})
dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
  x: 16, y: 400, top: 400, left: 16, right: 216, bottom: 424, width: 200, height: 24,
  toJSON: () => ({}),
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
const { SprintForecastChip } = await server.ssrLoadModule('/src/features/standup/components/SprintForecastChip.tsx')

const ready: SprintForecast = {
  status: 'ready', totalEffort: 115, startTotalEffort: 100, addedEffort: 25, removedEffort: 10,
  rows: [
    { label: 'Remaining', start: 90, current: 65, projected: 40 },
    { label: 'Not started', nested: true, start: 60, current: 40, projected: 20 },
    { label: 'Complete', start: 10, current: 50, projected: 75 },
    { label: 'Added', start: 0, current: 25, projected: 25 },
    { label: 'Removed', start: 0, current: 10, projected: 10 },
  ],
}

async function setup(t: TestContext, forecast: SprintForecast) {
  const host = dom.window.document.createElement('div')
  dom.window.document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  await act(async () => root.render(createElement(Root, null, createElement(SprintForecastChip, {
    daysRemaining: 5, forecast,
  }))))
  const trigger = host.querySelector('button')!
  assert.ok(trigger)
  return trigger
}

test('focus opens an accessible forecast table without moving focus; Escape dismisses it', async (t) => {
  const trigger = await setup(t, ready)
  assert.equal(trigger.getAttribute('aria-expanded'), 'false')
  assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog')
  await act(async () => trigger.focus())
  assert.equal(trigger.getAttribute('aria-expanded'), 'true')
  assert.equal(dom.window.document.activeElement, trigger)

  const dialog = dom.window.document.querySelector('[role="dialog"]')!
  assert.ok(dialog)
  assert.equal(dialog.id, trigger.getAttribute('aria-controls'))
  assert.equal(dom.window.document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent, 'Current sprint forecast')
  assert.equal(dialog.querySelector('table')?.getAttribute('aria-label'), 'Sprint effort forecast')
  assert.deepEqual([...dialog.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) => cell.textContent),
  ), [
    ['Remaining', '90(90%)', '65(65%)', '40(40%)'],
    ['Not started', '60(60%)', '40(40%)', '20(20%)'],
    ['Complete', '10(10%)', '50(50%)', '75(75%)'],
    ['Added', '0(0%)', '25(25%)', '25(25%)'],
    ['Removed', '0(0%)', '10(10%)', '10(10%)'],
  ])
  assert.match(dialog.textContent!, /100 committed at start, \+25 added, −10 removed, 115 now/)
  assert.match(dialog.textContent!, /not a delivery guarantee/)
  await act(async () => trigger.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(trigger.getAttribute('aria-expanded'), 'false')
  assert.equal(dom.window.document.activeElement, trigger)
})

for (const forecast of [
  { status: 'loading' },
  { status: 'unavailable', reason: 'Work-item history could not be loaded. Refresh to retry.' },
] satisfies SprintForecast[]) {
  test(`click exposes ${forecast.status} state without a success-shaped table`, async (t) => {
    const trigger = await setup(t, forecast)
    await act(async () => trigger.click())
    const dialog = dom.window.document.querySelector('[role="dialog"]')!
    assert.ok(dialog)
    assert.equal(dialog.querySelector('table'), null)
    assert.equal(dialog.querySelector('[role="status"]')?.textContent,
      forecast.status === 'loading' ? 'Loading sprint history...' : forecast.reason)
  })
}
