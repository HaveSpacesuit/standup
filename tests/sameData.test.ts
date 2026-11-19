import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { haveSameDataProps, isSameData } = await server.ssrLoadModule('/src/features/standup/utils/sameData.ts')

test('plain objects and arrays compare by value to the given depth; other objects by identity', () => {
  assert.equal(isSameData({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] }, 3), true)
  assert.equal(isSameData({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] }, 2), false, 'deeper than the depth compares by identity')
  assert.equal(isSameData({ a: 1 }, { a: 1, b: undefined }, 1), false)
  assert.equal(isSameData({ a: undefined }, { b: undefined }, 1), false)
  assert.equal(isSameData([1], { 0: 1 }, 1), false)
  assert.equal(isSameData(Number.NaN, Number.NaN, 0), true)

  const date = new Date(0)
  assert.equal(isSameData({ at: date }, { at: date }, 1), true)
  assert.equal(isSameData({ at: date }, { at: new Date(0) }, 1), false)
  assert.equal(isSameData(new Map([[1, 1]]), new Map([[1, 1]]), 1), false)
})

test('card props rebuilt with equal data compare equal, down to the fields of their pull requests', () => {
  const item = { id: 1, tags: ['pr'], activePullRequests: [{ id: 42, reviewers: ['Reviewer'] }] }
  const props = { item, owner: { displayName: 'Developer' }, compact: false }
  const rebuilt = { ...props, item: { ...item, activePullRequests: item.activePullRequests.map((pr) => ({ ...pr })) }, owner: { ...props.owner } }
  assert.equal(haveSameDataProps(props, rebuilt), true)
  assert.equal(haveSameDataProps(props, { ...rebuilt, item: { ...rebuilt.item, tags: ['pr', 'blocked'] } }), false)
  assert.equal(haveSameDataProps(props, { ...props, onSelect: () => undefined }), false)
})
