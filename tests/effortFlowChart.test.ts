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
    'react/jsx-runtime': { jsx: (type: unknown, props: unknown) => ({ type, props }) },
    '@mui/material': { Box: 'Box', Typography: 'Typography' },
    '@mui/material/styles': { useTheme: () => ({ palette, vars }) },
    'chart.js': { Chart: { register() {} } },
    'react-chartjs-2': { Line: 'Line' },
    '../utils/statusColumnStyles': {
      STATUS_COLUMNS: ['Done'],
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
  const points = [{ date: '2026-10-16', Done: 5 }]
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
      return result.props.children.props.options
    },
  }
}

test('effort flow axes and legend use resolved theme text colors, including live theme changes', () => {
  const chart = createChartHarness()
  for (const scheme of ['light', 'dark', 'light'] as const) {
    const options = chart.render(scheme)
    const expected = scheme === 'dark' ? 'rgb(240, 240, 240)' : 'rgb(30, 30, 30)'
    assert.equal(options.scales.x.ticks.color, expected)
    assert.equal(options.scales.y.ticks.color, expected)
    assert.equal(options.plugins.legend.labels.color, expected)
    assert.equal(options.scales.x.display, true)
    assert.equal(options.scales.y.display, true)
    assert.equal(options.plugins.legend.display, true)
  }
})

test('compact effort flow still hides axes and legend in both themes', () => {
  const chart = createChartHarness()
  for (const scheme of ['light', 'dark'] as const) {
    const options = chart.render(scheme, 'compact')
    assert.equal(options.scales.x.display, false)
    assert.equal(options.scales.y.display, false)
    assert.equal(options.plugins.legend.display, false)
  }
})
