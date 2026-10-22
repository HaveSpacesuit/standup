import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Exercise the component's options and theme-update effects without a canvas renderer.
function createChartHarness() {
  const hooks: { value?: unknown; deps?: unknown[] }[] = []
  let cursor = 0
  let effects: (() => void)[] = []
  let computedColor = 'rgb(30, 30, 30)'
  const palette = { text: { primary: 'rgba(0, 0, 0, 0.87)' } }
  const vars = { palette: { text: { primary: 'var(--text-primary)' } } }
  const memo = (factory: () => unknown, deps: unknown[]) => {
    const index = cursor++
    const previous = hooks[index]
    if (!previous || deps.some((dep, i) => dep !== previous.deps?.[i])) {
      hooks[index] = { value: factory(), deps }
    }
    return hooks[index].value
  }
  const modules: Record<string, unknown> = {
    react: {
      useMemo: memo,
      useRef: (value: unknown) => memo(() => ({ current: value }), []),
      useState: (initial: () => unknown) => {
        const index = cursor++
        hooks[index] ??= { value: initial() }
        return [hooks[index].value, (value: unknown) => { hooks[index].value = value }]
      },
      useLayoutEffect: (effect: () => void, deps: unknown[]) => {
        memo(() => { effects.push(effect) }, deps)
      },
    },
    'react/jsx-runtime': {
      jsx: (type: unknown, props: unknown) => ({ type, props }),
      jsxs: (type: unknown, props: unknown) => ({ type, props }),
    },
    '@mui/material': { Box: 'Box', Typography: 'Typography' },
    '@mui/material/styles': { useTheme: () => ({ palette, vars }) },
    'chart.js': { Chart: { register() {} } },
    'react-chartjs-2': { Line: 'Line' },
    '../utils/statusColumnStyles': {
      STATUS_COLUMNS: ['Blocked', 'New', 'Active', 'Review', 'Done'],
      getTintedStatusColor: () => 'rgb(0, 120, 0)',
      getStatusColumnColor: () => 'rgb(0, 120, 0)',
    },
    '../utils/dateOnly': { formatDateLabel: (date: string) => date },
  }
  const source = readFileSync(new URL('../src/features/standup/components/EffortFlowChart.tsx', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports: Record<string, Function> = {}
  runInNewContext(outputText, {
    exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected import: ${name}`)
      return modules[name]
    },
    window: {},
    document: {
      createElement: () => ({ style: {}, remove() {} }),
      body: { appendChild() {} },
    },
    getComputedStyle: (probe: { style: { color: string } }) => ({
      color: probe.style.color === vars.palette.text.primary ? computedColor : probe.style.color,
    }),
  })
  const points = [
    { date: '2026-10-16', Blocked: 0, New: 1, Active: 2, Review: 3, Done: 5 },
    { date: '2026-10-19', Blocked: null, New: null, Active: null, Review: null, Done: null },
  ]
  return {
    render(colorScheme: 'light' | 'dark', variant = 'detailed') {
      cursor = 0
      effects = []
      // Render before the theme attribute changes, then commit it and run layout effects.
      exports.EffortFlowChart({ points, isLoading: false, colorScheme, variant })
      computedColor = colorScheme === 'dark' ? 'rgb(240, 240, 240)' : 'rgb(30, 30, 30)'
      effects.forEach((effect) => effect())
      cursor = 0
      const result = exports.EffortFlowChart({ points, isLoading: false, colorScheme, variant })
      return result
    },
  }
}

function findNode(node: unknown, predicate: (candidate: { type: unknown; props: Record<string, unknown> }) => boolean): { type: unknown; props: Record<string, unknown> } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate)
      if (found) return found
    }
    return undefined
  }
  if (!node || typeof node !== 'object') return undefined
  const candidate = node as { type: unknown; props: Record<string, unknown> }
  if (predicate(candidate)) return candidate
  const children = candidate.props?.children
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findNode(child, predicate)
    if (found) return found
  }
  return undefined
}

function textContent(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join(' ')
  if (!node || typeof node !== 'object') return ''
  const children = (node as { props?: { children?: unknown } }).props?.children
  return (Array.isArray(children) ? children : [children]).map(textContent).join(' ')
}

test('effort flow axes and legend use resolved theme text colors, including live theme changes', () => {
  const chart = createChartHarness()
  for (const scheme of ['light', 'dark', 'light'] as const) {
    const rendered = chart.render(scheme)
    const canvas = findNode(rendered, ({ type }) => type === 'Line')
    const options = (canvas?.props.options ?? {}) as Record<string, any>
    const expected = scheme === 'dark' ? 'rgb(240, 240, 240)' : 'rgb(30, 30, 30)'
    assert.equal(options.scales.x.ticks.color, expected)
    assert.equal(options.scales.y.ticks.color, expected)
    assert.equal(options.plugins.legend.labels.color, expected)
    assert.equal(options.scales.x.display, true)
    assert.equal(options.scales.y.display, true)
    assert.equal(options.plugins.legend.display, true)
    assert.equal(canvas?.props.role, 'img')
    assert.match(String(canvas?.props['aria-label']), /effort flow chart.*by status/i)
  }
})

test('compact effort flow still hides axes and legend in both themes', () => {
  const chart = createChartHarness()
  for (const scheme of ['light', 'dark'] as const) {
    const rendered = chart.render(scheme, 'compact')
    const canvas = findNode(rendered, ({ type }) => type === 'Line')
    const options = (canvas?.props.options ?? {}) as Record<string, any>
    assert.equal(options.scales.x.display, false)
    assert.equal(options.scales.y.display, false)
    assert.equal(options.plugins.legend.display, false)
    assert.ok(canvas?.props['aria-label'])
    assert.equal(findNode(rendered, ({ type, props }) => type === 'Box' && props.component === 'details'), undefined)
  }
})

test('detailed effort flow exposes a keyboard-operable table of dates and status values', () => {
  const rendered = createChartHarness().render('light')
  const details = findNode(rendered, ({ type, props }) => type === 'Box' && props.component === 'details')
  const summary = findNode(rendered, ({ type, props }) => type === 'Box' && props.component === 'summary')
  const table = findNode(rendered, ({ type, props }) => type === 'Box' && props.component === 'table')
  assert.ok(details)
  assert.equal(textContent(summary), 'View effort flow data table')
  assert.ok(table)
  const tableText = textContent(table)
  for (const value of ['Daily effort totals by status', 'Date', 'Blocked', 'New', 'Active', 'Review', 'Done', '2026-10-16', '2026-10-19', '5', 'No data']) {
    assert.ok(tableText.includes(value), `Expected data table to contain "${value}", got "${tableText}"`)
  }
})
