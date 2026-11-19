import assert from 'node:assert/strict'
import { after, mock, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: ['react', 'react/jsx-runtime', '@mui/material'] },
  plugins: [{
    name: 'tag-match-field-test',
    enforce: 'pre',
    resolveId: (id) => ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@mui/material'].includes(id) ? `\0tag-match:${id}` : undefined,
    load: (id) => {
      if (id === '\0tag-match:react') return `
        let states = [], cursor = 0, dependencies = [], cleanups = [], pending = []
        export const beginRender = () => { cursor = 0; pending = [] }
        export const commitEffects = () => {
          for (const [index, effect] of pending) {
            cleanups[index]?.()
            cleanups[index] = effect()
          }
        }
        export const unmount = () => {
          cleanups.forEach((cleanup) => cleanup?.())
          states = []; dependencies = []; cleanups = []
        }
        export const useState = (initial) => {
          const index = cursor++
          if (!(index in states)) states[index] = initial
          return [states[index], (next) => { states[index] = next }]
        }
        export const useRef = (initial) => {
          const index = cursor++
          if (!(index in states)) states[index] = { current: initial }
          return states[index]
        }
        export const useEffect = (effect, deps) => {
          const index = cursor++
          if (!dependencies[index] || deps.some((dep, i) => !Object.is(dep, dependencies[index][i]))) {
            pending.push([index, effect])
            dependencies[index] = deps
          }
        }
      `
      if (id === '\0tag-match:react/jsx-runtime' || id === '\0tag-match:react/jsx-dev-runtime') return `
        export const jsx = (type, props) => ({ type, props })
        export const jsxs = jsx
        export const jsxDEV = jsx
      `
      if (id === '\0tag-match:@mui/material') return `export const TextField = 'TextField'`
    },
  }],
})
after(() => server.close())
const { TagMatchField, TAG_MATCH_COMMIT_DELAY_MS } = await server.ssrLoadModule('/src/features/standup/components/TagMatchField.tsx')
const { beginRender, commitEffects, unmount } = await server.ssrLoadModule('\0tag-match:react')

type Field = { props: { value: string; onChange: (event: unknown) => void; onBlur: () => void; onKeyDown: (event: unknown) => void } }

test('a typed tag match applies once typing pauses, on Enter, on leaving the field, or on closing, and only once', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const commits: string[] = []
    const props = { value: 'pr', onCommit: (tag: string) => commits.push(tag), placeholder: 'Tag match' }
    const render = (): Field => {
      beginRender()
      const field = TagMatchField(props)
      commitEffects()
      return field
    }
    const type = (field: Field, value: string) => {
      field.props.onChange({ target: { value } })
      return render()
    }

    let field = render()
    field = type(field, 'pr-')
    field = type(field, 'pr-o')
    mock.timers.tick(TAG_MATCH_COMMIT_DELAY_MS - 1)
    assert.deepEqual(commits, [], 'no commit while typing')
    assert.equal(field.props.value, 'pr-o')
    mock.timers.tick(1)
    assert.deepEqual(commits, ['pr-o'])
    field.props.onBlur()
    assert.deepEqual(commits, ['pr-o'], 'nothing left to apply')

    field = type(field, 'pr-ou')
    field.props.onKeyDown({ key: 'Enter' })
    mock.timers.tick(TAG_MATCH_COMMIT_DELAY_MS)
    assert.deepEqual(commits, ['pr-o', 'pr-ou'])

    field = type(field, 'blocked')
    field.props.onBlur()
    mock.timers.tick(TAG_MATCH_COMMIT_DELAY_MS)
    assert.deepEqual(commits, ['pr-o', 'pr-ou', 'blocked'])

    type(field, 'outdated')
    unmount()
    mock.timers.tick(TAG_MATCH_COMMIT_DELAY_MS)
    assert.deepEqual(commits, ['pr-o', 'pr-ou', 'blocked', 'outdated'])
  } finally {
    mock.timers.reset()
  }
})
