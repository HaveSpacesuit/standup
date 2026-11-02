import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())
const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { SprintRibbon } = await server.ssrLoadModule('/src/features/standup/components/SprintRibbon.tsx')
type RibbonProps = ComponentProps<typeof import('../src/features/standup/components/SprintRibbon.tsx').SprintRibbon>

const props: RibbonProps = {
  iterationWindow: {
    current: { name: 'Sprint 12', fullName: 'Project\\Team\\Sprint 12', startDate: '2001-03-05', finishDate: '2001-03-16' },
    next: { name: 'Sprint 13', fullName: 'Project\\Team\\Sprint 13', startDate: '2001-03-19', finishDate: '2001-03-30' },
  },
  effortTotals: { Blocked: 2, New: 5, Active: 8, Review: 3, Done: 13 },
  effortFlowPoints: [],
  effortFlowLoading: false,
  sprintForecast: {
    status: 'ready',
    start: { complete: 0, inProgress: 10, notStarted: 21, total: 31 },
    current: { complete: 13, inProgress: 11, notStarted: 7, total: 31 },
    projected: { complete: 29, inProgress: 2, notStarted: 0, total: 31 },
    addedEffort: 0,
    removedEffort: 0,
  },
  colorScheme: 'light',
}

const render = (overrides: Partial<RibbonProps> = {}) =>
  renderToStaticMarkup(createElement(Root, null, createElement(SprintRibbon, { ...props, ...overrides })))
const text = (html: string) => html.replace(/<style[^>]*>[^<]*<\/style>/g, '').replace(/<[^>]+>/g, '')

test('renders the sprint, progress, effort, forecast, and next sprint in one labelled section', () => {
  const html = render()
  assert.match(html, /<section[^>]*aria-label="Current sprint"/)
  assert.match(text(html), /Sprint 12/)
  assert.match(text(html), /Sprint ended/)
  assert.match(text(html), /Current sprint effort: 31 pts/)
  assert.match(html, /role="img"[^>]*aria-label="Current sprint effort by status: Blocked 2, New 5, Active 8, Review 3, Done 13"/)
  assert.match(html, /aria-label="On track · 94% projected. Sprint forecast"/)
  assert.match(text(html), /Effort flow unavailable for this sprint/)
  assert.match(html, /aria-label="Effort flow"/)
  assert.match(text(html), /Next: Sprint 13 · starts /)
})

test('an upcoming sprint shows its start date and no next sprint when none is scheduled', () => {
  const html = render({
    iterationWindow: {
      current: { name: 'Sprint 99', fullName: 'Project\\Team\\Sprint 99', startDate: '2999-01-07', finishDate: '2999-01-18' },
      next: null,
    },
  })
  assert.match(text(html), new RegExp(`Starts ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(2999, 0, 7))}`))
  assert.doesNotMatch(text(html), /Next:/)
})

test('falls back without a current sprint and keeps loading and error states in the same section', () => {
  const empty = text(render({ iterationWindow: { current: null, next: null } }))
  assert.match(empty, /Current sprint/)
  assert.match(empty, /Dates unavailable/)
  assert.match(empty, /Days: unavailable/)

  assert.match(text(render({ isLoading: true })), /Loading sprint info/)
  const error = render({ error: 'boom' })
  assert.match(error, /<section[^>]*aria-label="Current sprint"/)
  assert.match(error, /role="status"[^>]*>Sprint summary unavailable/)
  assert.doesNotMatch(text(error), /Sprint 12/)
})
