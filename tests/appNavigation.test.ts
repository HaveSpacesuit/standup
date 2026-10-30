import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: ['react'] },
  plugins: [{
    name: 'navigation-hook-test',
    enforce: 'pre',
    resolveId: (id) => id === 'react' ? '\0navigation-react' : undefined,
    load: (id) => id === '\0navigation-react' ? `
      export const effects = []
      export const useEffect = (effect) => { effects.push(effect) }
      export const useCallback = (callback) => callback
      export const useState = (initialize) => [initialize(), () => {}]
    ` : undefined,
  }],
})
after(() => server.close())
const { useAppNavigation } = await server.ssrLoadModule('/src/features/standup/hooks/useAppNavigation.ts')
const { effects } = await server.ssrLoadModule('\0navigation-react')

function setup(t: TestContext, {
  view = 'development',
  modal = false,
  mounted = true,
  filterInsideModal = false,
  focusable = true,
  hasQuickFilter = true,
} = {}) {
  const events = new EventTarget()
  const calls = { focus: 0, select: 0, cycle: [] as string[] }
  const input = {
    focus: () => {
      calls.focus++
      if (focusable) browserDocument.activeElement = input
    },
    select: () => { calls.select++ },
  }
  const browserWindow = {
    location: { hash: `#${view}` },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  }
  const browserDocument = {
    activeElement: null as unknown,
    title: '',
    querySelector: (selector: string) => {
      assert.equal(selector, '[aria-modal="true"]')
      return modal ? { contains: (element: unknown) => filterInsideModal && element === input } : null
    },
  }
  const restoreGlobals: (() => void)[] = []
  for (const [name, value] of Object.entries({ window: browserWindow, document: browserDocument })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value })
    restoreGlobals.push(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    })
  }

  let activeView: unknown
  function Navigation() {
    activeView = useAppNavigation({
      patConfigured: true,
      memberFilterOptions: ['Alice', 'Bob'],
      selectedMemberFilter: '',
      onMemberFilterChange: (member: string) => calls.cycle.push(member),
      quickFilterInputRefs: hasQuickFilter ? { [view]: { current: mounted ? input : null } } : {},
    }).activeView
  }
  Navigation()
  const cleanups = effects.splice(0).map((effect: () => (() => void) | undefined) => effect())
  t.after(() => {
    cleanups.forEach((cleanup: (() => void) | undefined) => cleanup?.())
    restoreGlobals.forEach((restore) => restore())
  })

  return {
    activeView,
    calls,
    press: (target = { tagName: 'BUTTON', isContentEditable: false }, modifiers = { ctrlKey: true, metaKey: false }, key = 'f') => {
      const event = new Event('keydown', { cancelable: true })
      Object.assign(event, { key, altKey: false, ...modifiers })
      Object.defineProperty(event, 'target', { value: target })
      events.dispatchEvent(event)
      return event
    },
  }
}

for (const view of ['development', 'qa-activity', 'backlog']) {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    test(`${modifier}+F focuses and selects the ${view} quick filter from the toolbar`, (t) => {
      const { calls, press } = setup(t, { view })
      assert.equal(press(undefined, { ctrlKey: modifier === 'ctrlKey', metaKey: modifier === 'metaKey' }, 'F').defaultPrevented, true)
      assert.deepEqual(calls, { focus: 1, select: 1, cycle: [] })
    })

    for (const target of [
      { tagName: 'INPUT', isContentEditable: false },
      { tagName: 'TEXTAREA', isContentEditable: false },
      { tagName: 'DIV', isContentEditable: true },
      { tagName: 'SPAN', isContentEditable: true },
    ]) {
      test(`${modifier}+F leaves an editable ${target.tagName} alone on ${view}`, (t) => {
        const { calls, press } = setup(t, { view })
        assert.equal(press(target, { ctrlKey: modifier === 'ctrlKey', metaKey: modifier === 'metaKey' }).defaultPrevented, false)
        assert.deepEqual(calls, { focus: 0, select: 0, cycle: [] })
      })
    }

    test(`${modifier}+F does not focus behind an active modal on ${view}`, (t) => {
      const { calls, press } = setup(t, { view, modal: true })
      assert.equal(press(undefined, { ctrlKey: modifier === 'ctrlKey', metaKey: modifier === 'metaKey' }).defaultPrevented, false)
      assert.deepEqual(calls, { focus: 0, select: 0, cycle: [] })
    })
  }
}

test('a quick filter inside the active modal can still receive focus', (t) => {
  const { calls, press } = setup(t, { modal: true, filterInsideModal: true })
  assert.equal(press().defaultPrevented, true)
  assert.deepEqual(calls, { focus: 1, select: 1, cycle: [] })
})

test('an unmounted quick filter does not suppress browser Find', (t) => {
  const { calls, press } = setup(t, { mounted: false })
  assert.equal(press().defaultPrevented, false)
  assert.deepEqual(calls, { focus: 0, select: 0, cycle: [] })
})

for (const view of ['development', 'qa-activity', 'backlog']) {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    test(`${modifier}+F preserves browser Find when the ${view} filter cannot receive focus`, (t) => {
      const { calls, press } = setup(t, { view, focusable: false })
      assert.equal(press(undefined, { ctrlKey: modifier === 'ctrlKey', metaKey: modifier === 'metaKey' }).defaultPrevented, false)
      assert.deepEqual(calls, { focus: 1, select: 0, cycle: [] })
    })
  }
}

test('member cycling still ignores editable targets and works from the toolbar', (t) => {
  const { calls, press } = setup(t)
  assert.equal(press({ tagName: 'INPUT', isContentEditable: false }, undefined, 'ArrowDown').defaultPrevented, false)
  assert.equal(press(undefined, undefined, 'ArrowDown').defaultPrevented, true)
  assert.deepEqual(calls, { focus: 0, select: 0, cycle: ['Alice'] })
})

for (const [hash, expectedView] of [
  ['development', 'development'],
  ['qa-activity', 'qa-activity'],
  ['backlog', 'backlog'],
  ['tests', 'tests'],
  ['unknown-page', 'development'],
]) {
  test(`the #${hash} hash opens the ${expectedView} view`, (t) => {
    assert.equal(setup(t, { view: hash, hasQuickFilter: false }).activeView, expectedView)
  })
}

for (const modifier of ['ctrlKey', 'metaKey']) {
  test(`${modifier}+F keeps browser Find on the Tests view, which has no quick filter`, (t) => {
    const { calls, press } = setup(t, { view: 'tests', hasQuickFilter: false })
    assert.equal(press(undefined, { ctrlKey: modifier === 'ctrlKey', metaKey: modifier === 'metaKey' }).defaultPrevented, false)
    assert.deepEqual(calls, { focus: 0, select: 0, cycle: [] })
  })
}

test('member cycling shortcuts are not active on the Backlog view', (t) => {
  const { calls, press } = setup(t, { view: 'backlog' })
  assert.equal(press(undefined, undefined, 'ArrowDown').defaultPrevented, false)
  assert.deepEqual(calls, { focus: 0, select: 0, cycle: [] })
})
