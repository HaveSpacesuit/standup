import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

// boardLayout.ts imports its siblings without file extensions, so Vite loads it rather than Node directly.
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { getBoardLayout, getCollapsedCellCardLimit, isCompactStatusColumn } =
  await server.ssrLoadModule('/src/features/standup/utils/boardLayout.ts')

test('in-flight columns get the widest tracks and Done the narrowest', () => {
  const layout = getBoardLayout(true)

  assert.equal(
    layout.gridTemplate,
    '208px minmax(220px, 1fr) minmax(210px, 0.95fr) minmax(250px, 1.2fr) minmax(250px, 1.2fr) minmax(200px, 0.75fr)',
  )
  assert.equal(layout.minWidth, 208 + 220 + 210 + 250 + 250 + 200)
  assert.equal(layout.blockedRail, false)
})

test('an empty Blocked column becomes a fixed rail and the minimum width shrinks with it', () => {
  const layout = getBoardLayout(false)

  assert.match(layout.gridTemplate, /^208px 44px minmax\(210px/)
  assert.equal(layout.minWidth, getBoardLayout(true).minWidth - 220 + 44)
  assert.equal(layout.blockedRail, true)
})

test('the lane column width can be changed without changing the status tracks', () => {
  const layout = getBoardLayout(true, 240)

  assert.match(layout.gridTemplate, /^240px minmax\(220px/)
  assert.equal(layout.minWidth, getBoardLayout(true).minWidth + 32)
})

test('New and Done are always compact; Compact cards extends it to every column', () => {
  for (const status of ['New', 'Done']) {
    assert.equal(isCompactStatusColumn(status, false), true)
  }
  for (const status of ['Blocked', 'Active', 'Review']) {
    assert.equal(isCompactStatusColumn(status, false), false)
    assert.equal(isCompactStatusColumn(status, true), true)
  }

  assert.equal(getCollapsedCellCardLimit(true), 5)
  assert.equal(getCollapsedCellCardLimit(false), 3)
})
