import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

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
const { AppNavigationRail } = await server.ssrLoadModule('/src/features/standup/components/AppNavigationRail.tsx')

const noop = () => {}

// renderToStaticMarkup escapes attribute values, so undo that before comparing against the raw icon href.
const unescapeAttribute = (value: string) => value
  .replaceAll('&#x27;', "'")
  .replaceAll('&quot;', '"')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&')

function renderNavigationAnchors(activeView: string) {
  const html = renderToStaticMarkup(createElement(Root, null, createElement(AppNavigationRail, {
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
  const anchors = html.matchAll(/<a ([^>]*)>(.*?NavigationRailItemActionLabel">([^<]*)<\/span>)<\/a>/g)
  return [...anchors].map(([, attributes, content, label]) => ({
    label,
    href: /href="([^"]*)"/.exec(attributes)?.[1],
    active: /aria-current="true"/.test(attributes),
    icon: unescapeAttribute(/<use href="([^"]*)"/.exec(content)?.[1] ?? ''),
  }))
}

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
