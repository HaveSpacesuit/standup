import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'

for (const name of ['localStorage', 'sessionStorage']) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, value: { getItem: () => null } })
  after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  })
}

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { default: issueReportIcon } = await server.ssrLoadModule('@stratakit/icons/issue-report.svg')
const { default: binderIcon } = await server.ssrLoadModule('@stratakit/icons/binder.svg')
const { AppNavigationRail } = await server.ssrLoadModule('/src/features/standup/components/AppNavigationRail.tsx')

const noop = () => {}

// renderToStaticMarkup escapes attribute values, so undo that before comparing against the raw icon href.
const unescapeAttribute = (value: string) => value
  .replaceAll('&#x27;', "'")
  .replaceAll('&quot;', '"')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&')

function renderNavigation(activeView: string) {
  return renderToStaticMarkup(createElement(Root, null, createElement(AppNavigationRail, {
    activeView,
    colorScheme: 'light',
    onToggleColorScheme: noop,
    patConfigured: true,
    patValue: '',
    onPatSave: noop,
    onPatClear: noop,
    onExportTeamData: noop,
    onImportTeamData: noop,
    selectedTeamId: '',
    teamProfiles: [],
    onTeamProfilesChange: noop,
    patCreationUrl: '',
  })))
}

function renderNavigationAnchors(activeView: string) {
  const anchors = renderNavigation(activeView).matchAll(/<a ([^>]*)>(.*?NavigationRailItemActionLabel">([^<]*)<\/span>)<\/a>/g)
  return [...anchors].map(([, attributes, content, label]) => ({
    label,
    href: /href="([^"]*)"/.exec(attributes)?.[1],
    active: /aria-current="true"/.test(attributes),
    icon: unescapeAttribute(/<use href="([^"]*)"/.exec(content)?.[1] ?? ''),
  }))
}

test('the navigation rail shows ADO Team Explorer with the binder icon', () => {
  const dom = new JSDOM(renderNavigation('development'))
  try {
    const icon = dom.window.document.querySelector('svg[aria-label="ADO Team Explorer"]')
    assert.ok(icon)
    assert.equal(icon.querySelector('use')?.getAttribute('href'), `${binderIcon}#icon-large`)
    assert.ok([...dom.window.document.querySelectorAll('p')].some((node) => node.textContent === 'ADO Team Explorer'))
    assert.doesNotMatch(dom.window.document.body.textContent!, /Standup Check In/)
  } finally {
    dom.window.close()
  }
})

test('the initial window title and favicon use the ADO Team Explorer branding', () => {
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'))
  const favicon = new JSDOM(readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8'), { contentType: 'image/svg+xml' })
  const binder = new JSDOM(readFileSync(new URL(import.meta.resolve('@stratakit/icons/binder.svg')), 'utf8'), { contentType: 'image/svg+xml' })
  try {
    assert.equal(dom.window.document.title, 'ADO Team Explorer')
    assert.equal(dom.window.document.querySelector('link[rel="icon"]')?.getAttribute('href'), '/favicon.svg')
    const svg = favicon.window.document.documentElement
    assert.equal(svg.getAttribute('viewBox'), '0 0 16 16')
    assert.equal(svg.querySelector('use')?.getAttribute('href'), '#icon')
    assert.equal(svg.querySelector('#icon path')?.getAttribute('d'), binder.window.document.querySelector('#icon path')?.getAttribute('d'))
  } finally {
    dom.window.close()
    favicon.window.close()
    binder.window.close()
  }
})

test('the navigation rail lists Backlog between Quality Assurance and Tests', () => {
  assert.deepEqual(
    renderNavigationAnchors('development').map(({ label, href }) => [label, href]),
    [
      ['Development', '#development'],
      ['Quality Assurance', '#qa-activity'],
      ['Backlog', '#backlog'],
      ['Tests', '#tests'],
    ],
  )
})

test('the Backlog link uses the issue-report (bug) icon', () => {
  const backlog = renderNavigationAnchors('development').find(({ label }) => label === 'Backlog')
  assert.equal(backlog?.icon, `${issueReportIcon}#icon-large`)
})

test('the Backlog link is the only active link while the backlog view is shown', () => {
  const anchors = renderNavigationAnchors('backlog')
  assert.deepEqual(anchors.filter(({ active }) => active).map(({ label }) => label), ['Backlog'])
})

test('the Backlog link is not active on the other views', () => {
  for (const view of ['development', 'qa-activity', 'tests']) {
    const backlog = renderNavigationAnchors(view).find(({ label }) => label === 'Backlog')
    assert.equal(backlog?.active, false, `${view} should not mark Backlog active`)
  }
})
