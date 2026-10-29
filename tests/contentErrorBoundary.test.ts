import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { act, createElement, useEffect, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Document: dom.window.Document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
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
const { ContentErrorBoundary } =
  await server.ssrLoadModule('/src/features/standup/components/ContentErrorBoundary.tsx')

test('content boundary renders children normally', () => {
  const html = renderToStaticMarkup(createElement(ContentErrorBoundary, null, 'Board content'))
  assert.equal(html, 'Board content')
})

test('content boundary replaces failed content with an accessible recovery action', () => {
  const boundary = new ContentErrorBoundary({ children: 'Failed content' })
  boundary.state = ContentErrorBoundary.getDerivedStateFromError(new Error('Render failure'))
  const html = renderToStaticMarkup(createElement(Root, null, boundary.render()))

  assert.match(html, /role="alert"/)
  assert.match(html, /This view could not be displayed/)
  assert.match(html, /Reload the page to fetch fresh data/)
  assert.match(html, /<button[^>]*>Reload page<\/button>/)
  assert.doesNotMatch(html, /Failed content|Render failure/)
})

test('content boundary resets a failure when its reset key changes', () => {
  assert.deepEqual(
    ContentErrorBoundary.getDerivedStateFromProps(
      { children: 'Board content', resetKey: 'team-b' },
      { hasError: true, resetKey: 'team-a' },
    ),
    { hasError: false, resetKey: 'team-b' },
  )
})

test('content boundary preserves a failure when its reset key is unchanged', () => {
  assert.equal(
    ContentErrorBoundary.getDerivedStateFromProps(
      { children: 'Board content', resetKey: 'team-a' },
      { hasError: true, resetKey: 'team-a' },
    ),
    null,
  )
})

test('changing the boundary reset key preserves the mounted child subtree', async (t) => {
  let mounts = 0
  let unmounts = 0
  function StatefulChild() {
    const [count, setCount] = useState(0)
    useEffect(() => {
      mounts++
      return () => { unmounts++ }
    }, [])
    return createElement('button', { onClick: () => setCount((value) => value + 1) }, `Count ${count}`)
  }

  const host = dom.window.document.createElement('div')
  dom.window.document.body.append(host)
  const root = createRoot(host)
  t.after(() => act(() => root.unmount()))

  await act(async () => {
    root.render(createElement(ContentErrorBoundary, { resetKey: 'team-a' }, createElement(StatefulChild)))
  })
  const button = host.querySelector('button')!
  await act(async () => button.click())

  await act(async () => {
    root.render(createElement(ContentErrorBoundary, { resetKey: 'team-b' }, createElement(StatefulChild)))
  })

  assert.equal(host.querySelector('button'), button)
  assert.equal(button.textContent, 'Count 1')
  assert.equal(mounts, 1)
  assert.equal(unmounts, 0)
})
