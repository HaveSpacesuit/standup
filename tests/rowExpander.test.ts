import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { act, createElement, useState } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
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
const { createRoot } = await import('react-dom/client')
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
  plugins: [{
    name: 'inline-expander-icons',
    enforce: 'pre',
    async load(id) {
      // Match the single-file production build, where StrataKit copies data-URI icons into its sprite.
      if (!/[/\\]chevron-(right|down)\.svg$/.test(id)) return
      const svg = await readFile(id)
      return `export default ${JSON.stringify(`data:image/svg+xml;base64,${svg.toString('base64')}`)}`
    },
  }],
})
after(async () => {
  await server.close()
  dom.window.close()
})

const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { LaneHead } = await server.ssrLoadModule('/src/features/standup/components/BoardLane.tsx')
const { BacklogTable } = await server.ssrLoadModule('/src/features/standup/components/BacklogTable.tsx')
const { rankBacklogBug } = await server.ssrLoadModule('/src/features/standup/utils/backlogValue.ts')
const { createDefaultBacklogOptions } = await server.ssrLoadModule('/src/features/standup/utils/backlogOptions.ts')
const rightSvg = await readFile(new URL('../node_modules/@stratakit/icons/icons/chevron-right.svg', import.meta.url), 'utf8')
const rightPath = new dom.window.DOMParser().parseFromString(rightSvg, 'image/svg+xml')
  .querySelector('symbol[id="icon"] path')!.getAttribute('d')

function Lane({ initiallyCollapsed }: { initiallyCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  return createElement(LaneHead, {
    row: { key: 'unassigned', label: 'Unassigned', isUnassigned: true },
    collapsed,
    onToggleCollapsed: () => setCollapsed((value) => !value),
    load: [],
    loadLabel: 'No cards',
    caption: 'Nothing open',
    flags: [],
  })
}

function Backlog({ initiallyCollapsed }: { initiallyCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  return createElement(BacklogTable, {
    bugs: [rankBacklogBug({ id: 1, title: 'Bug', state: 'New' })],
    tierThresholds: createDefaultBacklogOptions().tierThresholds,
    collapsedTiers: new Set(collapsed ? ['low'] : []),
    onToggleTier: () => setCollapsed((value) => !value),
  })
}

for (const [name, Component] of [['Development and QA lane', Lane], ['Backlog tier', Backlog]] as const) {
  for (const initiallyCollapsed of [true, false]) {
    test(`${name} chevron follows repeated toggles, starting ${initiallyCollapsed ? 'collapsed' : 'expanded'}`, async (t) => {
      const host = dom.window.document.createElement('div')
      dom.window.document.body.append(host)
      const root = createRoot(host)
      t.after(async () => {
        await act(async () => root.unmount())
        host.remove()
      })
      await act(async () => root.render(createElement(Root, null, createElement(Component, { initiallyCollapsed }))))

      const toggle = host.querySelector<HTMLButtonElement>('button[aria-expanded]')!
      assert.ok(toggle)
      for (let step = 0; step < 4; step++) {
        const collapsed = step % 2 === 0 ? initiallyCollapsed : !initiallyCollapsed
        assert.equal(toggle.getAttribute('aria-expanded'), String(!collapsed))
        assert.match(toggle.getAttribute('aria-label')!, collapsed ? /^Expand / : /^Collapse /)
        const icon = toggle.querySelector('svg')!
        const href = icon.querySelector('use')!.getAttribute('href')!
        assert.ok(href.startsWith('#'), 'the icon uses the production-style inline sprite')
        const symbol = dom.window.document.getElementById(href.slice(1))!
        assert.equal(symbol.querySelector('path')!.getAttribute('d'), rightPath, 'the base chevron always points right')
        assert.equal(icon.style.transform, collapsed ? 'rotate(0deg)' : 'rotate(90deg)')
        await act(async () => toggle.click())
      }
    })
  }
}
