import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())
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
