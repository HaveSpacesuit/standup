import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import type { WorkItemSummary } from '../src/ado/queryEngine'
import type { StatusColumn } from '../src/features/standup/utils/statusColumnStyles'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())

const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { SprintViewBoard } = await server.ssrLoadModule('/src/features/standup/components/SprintSummaryBoard.tsx')

function renderBoard(status: StatusColumn, visitedStatuses: StatusColumn[]) {
  const item: WorkItemSummary = {
    id: 123,
    title: 'Moved work item',
    status,
    state: status,
    sprintName: 'Sprint 1',
    workItemUrl: 'https://example.com/work-items/123',
  }
  const html = renderToStaticMarkup(createElement(Root, null, createElement(SprintViewBoard, {
    patConfigured: true,
    isLoading: false,
    colorScheme: 'light',
    workItemsError: null,
    workItems: [item],
    currentIterationName: 'Sprint 1',
    visitedStatusesByItemId: { [item.id]: visitedStatuses },
    members: [],
    workItemAssignees: {},
    changeHighlightsByItemId: {},
  })))
  return new JSDOM(html)
}

function getStyles(element: Element) {
  return [...element.ownerDocument.querySelectorAll('style')].map((style) => style.textContent ?? '')
    .filter((css) => [...element.classList].some((className) => css.includes(`.${className}{`)))
    .join('')
}

for (const { status, visitedStatuses, borderSide } of [
  { status: 'Review', visitedStatuses: ['New', 'Active', 'Review'], borderSide: 'left' },
  { status: 'New', visitedStatuses: ['Review', 'Active', 'New'], borderSide: 'right' },
] satisfies { status: StatusColumn; visitedStatuses: StatusColumn[]; borderSide: string }[]) {
  test(`${borderSide === 'left' ? 'right' : 'left'}-pointing arrow stays above elevated cards and below sticky labels`, () => {
    const dom = renderBoard(status, visitedStatuses)
    try {
      const { document } = dom.window
      const line = document.querySelector('svg line')
      const arrow = line?.parentElement?.parentElement
      const head = arrow?.lastElementChild
      const card = document.querySelector('.MuiCard-root')
      assert.ok(arrow)
      assert.ok(head)
      assert.ok(card)
      assert.equal(arrow.getAttribute('aria-hidden'), 'true')

      const arrowStyle = getStyles(arrow)
      assert.match(arrowStyle, /z-index:2;/)
      assert.match(arrowStyle, /pointer-events:none;/)
      assert.ok(getStyles(head).includes(`border-${borderSide}:8px solid`))
      assert.ok(card.compareDocumentPosition(arrow) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)

      const cardStyle = getStyles(card)
      for (const selector of [':hover', ':focus-within']) {
        assert.ok(cardStyle.includes(`${selector}{z-index:2;transform:translateY(-2px) scale(1.05);`))
      }

      const sprintLabel = [...document.querySelectorAll('div')].find((element) =>
        element.textContent === 'Sprint 1' && getStyles(element).includes('position:sticky;'),
      )
      assert.ok(sprintLabel)
      assert.match(getStyles(sprintLabel), /z-index:3;/)
    } finally {
      dom.window.close()
    }
  })
}

test('items without a different visited status do not get an arrow', () => {
  for (const visitedStatuses of [[], ['Active']] satisfies StatusColumn[][]) {
    const dom = renderBoard('Active', visitedStatuses)
    try {
      assert.equal(dom.window.document.querySelector('svg line'), null)
      assert.ok(dom.window.document.querySelector('.MuiCard-root'))
    } finally {
      dom.window.close()
    }
  }
})
