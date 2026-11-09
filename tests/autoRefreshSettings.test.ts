import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { act, createElement, useState } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import type { AutoRefreshOptions } from '../src/features/standup/utils/autoRefresh.ts'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, Document: dom.window.Document,
  HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, ShadowRoot: dom.window.ShadowRoot,
  MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
})
const { createRoot } = await import('react-dom/client')
const server = await createServer({
  configFile: false, server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(async () => {
  await server.close()
  dom.window.close()
})
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { AutoRefreshSettings } = await server.ssrLoadModule('/src/features/standup/components/AutoRefreshSettings.tsx')

test('global auto-refresh defaults off, offers 15 minutes when enabled, and rejects non-positive or fractional input', async (t) => {
  const changes: AutoRefreshOptions[] = []
  function Settings() {
    const [options, setOptions] = useState({ enabled: false, minutes: 15 })
    return createElement(AutoRefreshSettings, {
      options, error: 'Storage is unavailable',
      onChange: (next: AutoRefreshOptions) => { changes.push(next); setOptions(next) },
    })
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => { await act(async () => root.unmount()); host.remove() })
  await act(async () => root.render(createElement(Root, null, createElement(Settings))))
  const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  assert.equal(toggle.checked, false)
  assert.equal(host.querySelector('input[type="number"]'), null)
  assert.match(host.textContent!, /Storage is unavailable/)
  await act(async () => toggle.click())
  const input = host.querySelector<HTMLInputElement>('input[type="number"]')!
  assert.equal(input.value, '15')
  assert.equal(input.labels?.[0].textContent, 'Refresh interval (minutes)')

  const setInput = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!
  const type = async (value: string) => {
    await act(async () => {
      setInput.call(input, value)
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    })
  }
  for (const invalid of ['', '0', '-1', '1.5']) {
    await type(invalid)
    assert.equal(input.getAttribute('aria-invalid'), 'true')
    assert.match(host.textContent!, /whole number of minutes/)
    assert.equal(changes.length, 1, 'invalid drafts are not applied')
  }
  await type('7')
  assert.deepEqual(changes.at(-1), { enabled: true, minutes: 7 })
  assert.equal(input.getAttribute('aria-invalid'), 'false')
  await act(async () => toggle.click())
  assert.deepEqual(changes.at(-1), { enabled: false, minutes: 7 })
  await act(async () => toggle.click())
  assert.equal(host.querySelector<HTMLInputElement>('input[type="number"]')!.value, '7')
})
