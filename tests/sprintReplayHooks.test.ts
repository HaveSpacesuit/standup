import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { act, createElement, useRef, type RefObject } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
})
const { createRoot } = await import('react-dom/client')
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(async () => {
  await server.close()
  dom.window.close()
})
const { useSprintReplay, REPLAY_STEP_MS } = await server.ssrLoadModule('/src/features/standup/hooks/useSprintReplay.ts')
const { useCardFlip } = await server.ssrLoadModule('/src/features/standup/hooks/useCardFlip.ts')
const { getSprintReplayTimeline } = await server.ssrLoadModule('/src/features/standup/utils/sprintReplay.ts')

const point = (date: string, value: number | null) => ({ date, Blocked: value, New: value, Active: value, Review: value, Done: value })
// Four days of history, then a day still to come.
const TIMELINE = getSprintReplayTimeline([
  point('2025-10-27', 1),
  point('2025-10-28', 1),
  point('2025-10-29', 1),
  point('2025-10-30', 1),
  point('2025-10-31', null),
])

type Replay = ReturnType<typeof useSprintReplay>

async function renderReplay(t: { after: (fn: () => unknown) => void }, timeline = TIMELINE) {
  let replay: Replay
  const changes: number[] = []
  function Harness({ timeline: current }: { timeline: typeof TIMELINE | null }) {
    replay = useSprintReplay(current, () => changes.push(replay?.index ?? -1))
    return null
  }
  const root = createRoot(document.createElement('div'))
  t.after(() => act(() => root.unmount()))
  await act(async () => root.render(createElement(Harness, { timeline })))
  return {
    get replay() { return replay! },
    changes,
    rerender: (next: typeof TIMELINE | null) => act(async () => root.render(createElement(Harness, { timeline: next }))),
  }
}

test('the replay shows today until a past day is picked, and steps stay within the sprint so far', async (t) => {
  const harness = await renderReplay(t)
  assert.equal(harness.replay.pastDay, null)
  assert.equal(harness.replay.index, 3)

  await act(async () => harness.replay.step(1))
  assert.equal(harness.replay.index, 3, 'there is no stepping past today')
  assert.deepEqual(harness.changes, [], 'nothing changed, so nothing was captured')

  await act(async () => harness.replay.goTo(1))
  assert.equal(harness.replay.pastDay?.day, 2)
  assert.deepEqual(harness.changes, [3], 'the board is captured while it still shows the old day')

  await act(async () => harness.replay.step(-5))
  assert.equal(harness.replay.index, 0)

  await act(async () => harness.replay.exit())
  assert.equal(harness.replay.pastDay, null)
  assert.deepEqual(harness.changes, [3, 1, 0])
})

test('Play walks one day at a time up to today, then stops', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const realSetTimeout = dom.window.setTimeout
  const realClearTimeout = dom.window.clearTimeout
  Object.assign(dom.window, { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout })
  t.after(() => Object.assign(dom.window, { setTimeout: realSetTimeout, clearTimeout: realClearTimeout }))
  const harness = await renderReplay(t)

  await act(async () => harness.replay.togglePlay())
  assert.equal(harness.replay.index, 0, 'Play from today starts at the first day')
  assert.equal(harness.replay.playing, true)

  for (const expected of [1, 2]) {
    await act(async () => t.mock.timers.tick(REPLAY_STEP_MS))
    assert.equal(harness.replay.index, expected)
  }

  await act(async () => harness.replay.togglePlay())
  assert.equal(harness.replay.playing, false, 'Pause stops on the day shown')
  await act(async () => t.mock.timers.tick(REPLAY_STEP_MS * 3))
  assert.equal(harness.replay.index, 2)

  await act(async () => harness.replay.togglePlay())
  await act(async () => t.mock.timers.tick(REPLAY_STEP_MS))
  assert.equal(harness.replay.pastDay, null, 'reaching today returns to the live board')
  assert.equal(harness.replay.playing, false)
})

test('without a timeline the replay shows today, and reset returns there without capturing', async (t) => {
  const harness = await renderReplay(t)
  await act(async () => harness.replay.goTo(0))
  assert.equal(harness.replay.pastDay?.day, 1)

  await harness.rerender(null)
  assert.equal(harness.replay.pastDay, null, 'history went away, so the board shows today')
  await act(async () => harness.replay.start())
  assert.equal(harness.replay.playing, false)

  await harness.rerender(TIMELINE)
  await act(async () => harness.replay.reset())
  assert.equal(harness.replay.pastDay, null)
  assert.deepEqual(harness.changes, [3])
})

test('card FLIP slides moved cards from where they were and fades in new ones', async (t) => {
  const container = document.createElement('div')
  document.body.append(container)
  t.after(() => container.remove())
  const positions = new Map<string, { left: number; top: number }>([['1', { left: 0, top: 0 }], ['2', { left: 0, top: 50 }]])
  const animations: Array<{ id: string; keyframes: Keyframe[] }> = []
  const rect = (left: number, top: number) => ({ left, top, right: left + 100, bottom: top + 40, width: 100, height: 40, x: left, y: top, toJSON: () => ({}) })
  Object.assign(dom.window.HTMLElement.prototype, {
    animate(this: HTMLElement, keyframes: Keyframe[], options: { id: string }) {
      animations.push({ id: this.dataset.cardId ?? 'container', keyframes })
      return { id: options.id, cancel() {} }
    },
    getAnimations: () => [],
    getBoundingClientRect(this: HTMLElement) {
      const position = this.dataset.cardId ? positions.get(this.dataset.cardId) : undefined
      return position ? rect(position.left, position.top) : rect(0, 0)
    },
  })
  Object.defineProperty(container, 'getBoundingClientRect', { value: () => ({ ...rect(0, 0), right: 1000, bottom: 1000 }) })
  t.after(() => {
    for (const name of ['animate', 'getAnimations', 'getBoundingClientRect']) {
      Reflect.deleteProperty(dom.window.HTMLElement.prototype, name)
    }
  })

  let capture: () => void
  function Board({ ids }: { ids: string[] }) {
    const ref = useRef<HTMLDivElement>(null)
    ;(ref as RefObject<HTMLDivElement | null>).current = container as HTMLDivElement
    capture = useCardFlip(ref)
    return createElement('div', null, ids.map((id) => createElement('div', { key: id, 'data-card-id': id })))
  }
  const root = createRoot(container)
  t.after(() => act(() => root.unmount()))
  await act(async () => root.render(createElement(Board, { ids: ['1', '2'] })))
  assert.equal(animations.length, 0, 'nothing animates without a capture')

  await act(async () => {
    capture!()
    positions.set('1', { left: 200, top: 0 })
    positions.set('3', { left: 0, top: 100 })
    root.render(createElement(Board, { ids: ['1', '2', '3'] }))
  })
  assert.deepEqual(animations.map((animation) => animation.id), ['1', '3'], 'the card that stayed put does not animate')
  assert.equal(animations[0].keyframes[0].transform, 'translate(-200px, 0px)')
  assert.equal(animations[1].keyframes[0].opacity, 0)
})
