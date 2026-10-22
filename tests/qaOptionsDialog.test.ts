import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { parseStoredQaOptions } from '../src/features/standup/utils/qaOptions.ts'
import {
  qaCardHighlightOptionsStorageKey,
  serializeCardHighlightOptions,
  type CardHighlightOptions,
} from '../src/features/standup/utils/cardHighlightOptions.ts'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: ['react', 'react/jsx-runtime', '@mui/material'] },
  plugins: [{
    name: 'qa-options-dialog-test',
    enforce: 'pre',
    resolveId: (id) => ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@mui/material'].includes(id) ? `\0qa-test:${id}` : undefined,
    load: (id) => {
      if (id === '\0qa-test:react') return `
        let states = [], cursor = 0, dependencies = [], effects = []
        export const reset = () => { states = []; dependencies = [] }
        export const beginRender = () => { cursor = 0; effects = [] }
        export const flushEffects = () => effects.forEach(effect => effect())
        export const useState = (initial) => {
          const index = cursor++
          if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
          return [states[index], next => {
            states[index] = typeof next === 'function' ? next(states[index]) : next
          }]
        }
        export const useEffect = (effect, deps) => {
          const index = cursor++
          if (!dependencies[index] || deps.some((dep, i) => !Object.is(dep, dependencies[index][i]))) {
            effects.push(effect)
            dependencies[index] = deps
          }
        }
        export const useMemo = (calculate) => calculate()
      `
      if (id === '\0qa-test:react/jsx-runtime' || id === '\0qa-test:react/jsx-dev-runtime') return `
        export const jsx = (type, props) => ({ type, props })
        export const jsxs = jsx
        export const jsxDEV = jsx
      `
      if (id === '\0qa-test:@mui/material') return `
        export const Box = 'Box', Button = 'Button', Checkbox = 'Checkbox', Chip = 'Chip',
          CircularProgress = 'CircularProgress', Dialog = 'Dialog', DialogActions = 'DialogActions',
          DialogContent = 'DialogContent', DialogTitle = 'DialogTitle', FormControlLabel = 'FormControlLabel',
          ListItemText = 'ListItemText', MenuItem = 'MenuItem', OutlinedInput = 'OutlinedInput',
          Select = 'Select', Tab = 'Tab', Tabs = 'Tabs', TextField = 'TextField', Typography = 'Typography'
      `
    },
  }],
})
after(() => server.close())
const { QaOptionsDialog } = await server.ssrLoadModule('/src/features/standup/components/QaOptionsDialog.tsx')
const hooks = await server.ssrLoadModule('\0qa-test:react')

type Element = { type: string; props: Record<string, unknown> }

function find(element: unknown, match: (node: Element) => boolean): Element | undefined {
  if (Array.isArray(element)) {
    for (const child of element) {
      const result = find(child, match)
      if (result) return result
    }
  } else if (element && typeof element === 'object' && 'props' in element) {
    const node = element as Element
    return match(node) ? node : find(node.props.children, match)
  }
}

function setup() {
  hooks.reset()
  let committed = { freshDays: 1, staleDays: 7 }
  const storageKey = qaCardHighlightOptionsStorageKey('team')
  const storage = new Map([[storageKey, serializeCardHighlightOptions(committed)]])
  const calls: string[] = []
  const props = {
    open: true,
    options: parseStoredQaOptions(null),
    cardHighlightOptions: committed,
    onChange: () => calls.push('options'),
    onCardHighlightOptionsChange: (next: CardHighlightOptions) => {
      calls.push('freshness')
      committed = next
      props.cardHighlightOptions = next
      storage.set(storageKey, serializeCardHighlightOptions(next))
    },
    onClose: () => { calls.push('close'); props.open = false },
    projectWorkItemStates: [],
    projectWorkItemTypes: [],
    projectWorkItemStatesLoading: false,
    teamIterations: [],
    teamIterationsLoading: false,
  }
  let tree: Element
  function render() {
    hooks.beginRender()
    tree = QaOptionsDialog(props)
    hooks.flushEffects()
    hooks.beginRender()
    tree = QaOptionsDialog(props)
  }
  function node(match: (element: Element) => boolean) {
    const result = find(tree, match)
    assert.ok(result)
    return result
  }
  function change(label: string, value: string) {
    const field = node((element) => element.props.label === label)
    ;(field.props.onChange as (event: unknown) => void)({ target: { value } })
    render()
  }
  function freshnessTab() {
    const tabs = node((element) => element.type === 'Tabs')
    ;(tabs.props.onChange as (event: null, value: number) => void)(null, 5)
    render()
  }
  render()
  freshnessTab()
  return {
    props, calls, storage, storageKey, render, node, change, freshnessTab,
    committed: () => committed,
  }
}

for (const closeVia of ['button', 'escapeKeyDown', 'backdropClick']) {
  test(`Freshness stays draft-only until closing via ${closeVia}`, () => {
    const dialog = setup()
    dialog.change('Fresh threshold (days)', '30')
    dialog.change('Stale threshold (days)', '40')

    assert.deepEqual(dialog.calls, [])
    assert.deepEqual(dialog.committed(), { freshDays: 1, staleDays: 7 })
    assert.equal(dialog.storage.get(dialog.storageKey), '{"freshDays":1,"staleDays":7}')
    assert.equal(dialog.node((node) => node.props.label === 'Fresh threshold (days)').props.value, 30)
    assert.equal(dialog.node((node) => node.props.label === 'Stale threshold (days)').props.value, 40)

    if (closeVia === 'button') {
      const close = dialog.node((node) => node.type === 'Button' && node.props.children === 'Close')
      ;(close.props.onClick as () => void)()
    } else {
      const modal = dialog.node((node) => node.type === 'Dialog')
      ;(modal.props.onClose as (event: unknown, reason: string) => void)({}, closeVia)
    }
    assert.deepEqual(dialog.calls, ['options', 'freshness', 'close'])
    assert.deepEqual(dialog.committed(), { freshDays: 30, staleDays: 40 })
    assert.equal(dialog.storage.get(dialog.storageKey), '{"freshDays":30,"staleDays":40}')

    dialog.render()
    dialog.props.cardHighlightOptions = { freshDays: 2, staleDays: 9 }
    dialog.props.open = true
    dialog.render()
    dialog.freshnessTab()
    assert.equal(dialog.node((node) => node.props.label === 'Fresh threshold (days)').props.value, 2)
    assert.equal(dialog.node((node) => node.props.label === 'Stale threshold (days)').props.value, 9)
  })
}

test('Freshness normalizes against the latest draft without committing', () => {
  const dialog = setup()
  dialog.change('Fresh threshold (days)', '30')
  assert.equal(dialog.node((node) => node.props.label === 'Stale threshold (days)').props.value, 31)
  dialog.change('Stale threshold (days)', '20')
  assert.equal(dialog.node((node) => node.props.label === 'Stale threshold (days)').props.value, 31)
  dialog.change('Fresh threshold (days)', '999')
  assert.equal(dialog.node((node) => node.props.label === 'Fresh threshold (days)').props.value, 364)
  assert.equal(dialog.node((node) => node.props.label === 'Stale threshold (days)').props.value, 365)
  assert.deepEqual(dialog.calls, [])
})
