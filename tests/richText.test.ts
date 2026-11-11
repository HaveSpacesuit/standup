import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { act, createElement } from 'react'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import type { RichTextNode } from '../src/features/standup/utils/richText.ts'
import type { WorkItemPreviewImages } from '../src/features/standup/hooks/useWorkItemPreview.ts'

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
const { parseRichText, RICH_TEXT_MAX_DEPTH, RICH_TEXT_MAX_NODES } = await server.ssrLoadModule('/src/features/standup/utils/richText.ts')
const { RichText } = await server.ssrLoadModule('/src/features/standup/components/RichText.tsx')

const parse = (html: string): RichTextNode[] => parseRichText(html, new dom.window.DOMParser())
const text = (value: string): RichTextNode => ({ kind: 'text', text: value })

function walk(nodes: RichTextNode[], visit: (node: RichTextNode, depth: number) => void, depth = 0) {
  for (const node of nodes) {
    visit(node, depth)
    if (node.kind === 'element') walk(node.children, visit, depth + 1)
  }
}

test('only plain formatting survives: no script, styles, frames or attributes', () => {
  assert.deepEqual(parse(
    '<p style="color:#000" class="x" onclick="steal()">Hi <span style="font-size:20px"><font color="red">there</font></span>'
    + '<script>alert(1)</script></p><style>p{color:red}</style><iframe src="https://example.test"></iframe><b>bold</b>',
  ), [
    { kind: 'element', tag: 'p', children: [text('Hi '), text('there')] },
    { kind: 'element', tag: 'b', children: [text('bold')] },
  ])
  assert.deepEqual(parse('<strike>old</strike><tt>code</tt><h2>Steps</h2>'), [
    { kind: 'element', tag: 's', children: [text('old')] },
    { kind: 'element', tag: 'code', children: [text('code')] },
    { kind: 'element', tag: 'div', heading: true, children: [text('Steps')] },
  ])
})

test('links keep only web and mail addresses; others become their text', () => {
  assert.deepEqual(parse(
    '<a href="javascript:alert(1)">bad</a><a href="/relative">relative</a><a href=" https://example.test/a ">web</a><a href="mailto:qa@example.test">mail</a>',
  ), [
    text('bad'),
    text('relative'),
    { kind: 'element', tag: 'a', href: 'https://example.test/a', children: [text('web')] },
    { kind: 'element', tag: 'a', href: 'mailto:qa@example.test', children: [text('mail')] },
  ])
})

test('images keep web addresses and inline pictures, never script or SVG', () => {
  const attachment = 'https://dev.azure.com/org/_apis/wit/attachments/0f8fad5b-d9cb-469f-a165-70867728950e'
  assert.deepEqual(parse(
    `<img src="${attachment}" alt=" Screenshot "><img src="data:image/png;base64,AAAA"><img src="data:image/svg+xml;base64,AAAA">`
    + '<img src="javascript:alert(1)"><img src="ftp://example.test/i.png"><img><a href="https://example.test"><img src="https://example.test/i.png"></a>',
  ), [
    { kind: 'image', src: attachment, alt: 'Screenshot', inLink: false },
    { kind: 'image', src: 'data:image/png;base64,AAAA', alt: '', inLink: false },
    { kind: 'element', tag: 'a', href: 'https://example.test/', children: [{ kind: 'image', src: 'https://example.test/i.png', alt: '', inLink: true }] },
  ])
})

test('tables keep their cells and spans, without formatting whitespace', () => {
  const [table] = parse('<table>\n <tbody>\n <tr>\n <td colspan="2" rowspan="200" style="width:9px">a</td>\n <th rowspan="3">b</th>\n </tr>\n </tbody>\n</table>')
  const cells: RichTextNode[] = []
  walk([table], (node) => {
    assert.ok(node.kind !== 'text' || node.text.trim(), 'no whitespace-only text inside the table')
    if (node.kind === 'element' && (node.tag === 'td' || node.tag === 'th')) cells.push(node)
  })
  assert.deepEqual(cells.map((cell) => cell.kind === 'element' && [cell.tag, cell.colSpan, cell.rowSpan]), [['td', 2, undefined], ['th', undefined, 3]])
})

test('ordered lists keep a start number other than 1', () => {
  const starts = parse('<ol><li>a</li></ol><ol start="3"><li>c</li></ol><ol start=""><li>x</li></ol><ol start="x"><li>y</li></ol><ol start="1"><li>z</li></ol>')
    .map((node) => node.kind === 'element' ? node.start ?? null : 'text')
  assert.deepEqual(starts, [null, 3, null, null, null])
})

test('very deep or very long markup is cut short', () => {
  const depth = RICH_TEXT_MAX_DEPTH + 10
  let deepest = 0
  const nested = parse(`${'<div>'.repeat(depth)}deep${'</div>'.repeat(depth)}`)
  walk(nested, (_node, at) => { deepest = Math.max(deepest, at) })
  assert.ok(deepest <= RICH_TEXT_MAX_DEPTH)
  assert.ok(JSON.stringify(nested).includes('deep'), 'the flattened text is kept')

  let count = 0
  walk(parse('<p>x</p>'.repeat(RICH_TEXT_MAX_NODES)), () => { count++ })
  assert.ok(count <= RICH_TEXT_MAX_NODES)
})

test('without an HTML parser there is no tree, for the caller to show plain text', () => {
  assert.equal(parseRichText('<p>x</p>'), null)
})

async function renderRichText(t: TestContext, html: string, images?: WorkItemPreviewImages) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  t.after(async () => {
    await act(async () => root.unmount())
    host.remove()
  })
  await act(async () => root.render(createElement(Root, null, createElement(RichText, { html, images }))))
  return host.querySelector<HTMLElement>('.MuiBox-root')!
}

function withDomParser(t: TestContext) {
  Object.assign(globalThis, { DOMParser: dom.window.DOMParser })
  t.after(() => Reflect.deleteProperty(globalThis, 'DOMParser'))
}

test('the first and last blocks are marked so the text sits evenly in its box', async (t) => {
  withDomParser(t)
  const box = await renderRichText(t, '<h3>Title</h3><p>middle</p><table><tr><td>x</td></tr></table>')
  assert.deepEqual([...box.children].map((child) => [child.tagName.toLowerCase(), child.className]), [
    ['div', 'rt-heading rt-first'],
    ['p', ''],
    ['div', 'rt-table rt-last'],
  ])
  const single = await renderRichText(t, '<ol start="3"><li>c</li></ol>')
  assert.equal(single.querySelector('ol')!.className, 'rt-first rt-last')
  assert.equal(single.querySelector('ol')!.getAttribute('start'), '3')
})

test('links open in a new tab', async (t) => {
  withDomParser(t)
  const link = (await renderRichText(t, '<a href="https://example.test/a">web</a>')).querySelector('a')!
  assert.deepEqual([link.href, link.target, link.rel], ['https://example.test/a', '_blank', 'noopener noreferrer'])
})

test('attachment screenshots load with the token; other images are only linked', async (t) => {
  withDomParser(t)
  const attachment = 'https://dev.azure.com/org/_apis/wit/attachments/0f8fad5b-d9cb-469f-a165-70867728950e'
  const requested: string[] = []
  const images: WorkItemPreviewImages = {
    canLoad: (src) => src.startsWith('https://dev.azure.com/org/'),
    load: (src) => {
      requested.push(src)
      return Promise.resolve(new Blob(['png'], { type: 'image/png' }))
    },
  }
  const box = await renderRichText(t, `<img src="${attachment}" alt="Screenshot"><img src="https://example.test/i.png" alt="Logo"><img src="data:image/png;base64,AAAA">`, images)

  assert.deepEqual(requested, [attachment])
  const [loaded, inline] = [...box.querySelectorAll('img')]
  assert.match(loaded.src, /^blob:/)
  assert.equal(loaded.closest('a')!.getAttribute('href'), attachment)
  assert.equal(loaded.closest('a')!.getAttribute('aria-label'), 'Screenshot, open full size in Azure DevOps')
  assert.equal(inline.getAttribute('src'), 'data:image/png;base64,AAAA')
  const note = box.querySelector<HTMLAnchorElement>('a.rt-image-note')!
  assert.equal(note.textContent, 'Logo from example.test')
  assert.equal(note.getAttribute('href'), 'https://example.test/i.png')
})

test('a screenshot that fails to load links to Azure DevOps instead', async (t) => {
  withDomParser(t)
  const attachment = 'https://dev.azure.com/org/_apis/wit/attachments/0f8fad5b-d9cb-469f-a165-70867728950e'
  const box = await renderRichText(t, `<img src="${attachment}">`, { canLoad: () => true, load: () => Promise.reject(new Error('HTTP 500')) })
  const note = box.querySelector<HTMLAnchorElement>('a.rt-image-note')!
  assert.equal(note.textContent, 'Image unavailable · open in Azure DevOps')
  assert.equal(note.getAttribute('href'), attachment)
  assert.equal(box.querySelector('img'), null)
})

test('without an HTML parser the text shows plain', async (t) => {
  const box = await renderRichText(t, '<p>Hello <b>there</b></p><script>x</script>')
  assert.equal(box.querySelector('p, b, script'), null)
  assert.match(box.textContent!, /^Hello there/)
})
