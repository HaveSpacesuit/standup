import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { parseStoredQaOptions, qaOptionsStorageKey, serializeQaOptions } from '../src/features/standup/utils/qaOptions.ts'
import {
  qaCardHighlightOptionsStorageKey,
  serializeCardHighlightOptions,
  type CardHighlightOptions,
} from '../src/features/standup/utils/cardHighlightOptions.ts'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: ['react', 'react/jsx-runtime', '@mui/material', /^@stratakit\//] },
  plugins: [{
    name: 'qa-options-dialog-test',
    enforce: 'pre',
    resolveId: (id) => ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@mui/material', '@stratakit/mui'].includes(id) ? `\0qa-test:${id}` : undefined,
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
        let mobileViewport = false
        export const setMobileViewport = value => { mobileViewport = value }
        export const useMediaQuery = () => mobileViewport
        export const Alert = 'Alert', Box = 'Box', Button = 'Button', Checkbox = 'Checkbox', Chip = 'Chip',
          CircularProgress = 'CircularProgress', Dialog = 'Dialog', DialogActions = 'DialogActions',
          DialogContent = 'DialogContent', DialogTitle = 'DialogTitle', FormControlLabel = 'FormControlLabel',
          IconButton = 'IconButton', ListItemText = 'ListItemText', MenuItem = 'MenuItem', OutlinedInput = 'OutlinedInput',
          Select = 'Select', Tab = 'Tab', Tabs = 'Tabs', TextField = 'TextField', Typography = 'Typography'
      `
      if (id === '\0qa-test:@stratakit/mui') return `export const Icon = 'Icon'`
    },
  }],
})
after(() => server.close())
const { QaOptionsDialog } = await server.ssrLoadModule('/src/features/standup/components/QaOptionsDialog.tsx')
const { HiddenTagsDialog } = await server.ssrLoadModule('/src/features/standup/components/HiddenTagsDialog.tsx')
const material = await server.ssrLoadModule('\0qa-test:@mui/material')
const hooks = await server.ssrLoadModule('\0qa-test:react')
const { useStandupAppState } = await server.ssrLoadModule('/src/features/standup/hooks/useStandupAppState.ts')
const { parseStoredAssignmentOptions, serializeAssignmentOptions, assignmentOptionsStorageKey } =
  await server.ssrLoadModule('/src/features/standup/utils/assignmentOptions.ts')
const { createDefaultAssignmentOptions, createDefaultQaOptions } =
  await server.ssrLoadModule('/src/features/standup/utils/standupOptionDefaults.ts')
const { buildTeamDataExport, parseImportedTeamData, serializeTeamDataExport } =
  await server.ssrLoadModule('/src/teamDataTransfer.ts')

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

function findAll(element: unknown, match: (node: Element) => boolean, results: Element[] = []): Element[] {
  if (Array.isArray(element)) {
    for (const child of element) findAll(child, match, results)
  } else if (element && typeof element === 'object' && 'props' in element) {
    const node = element as Element
    if (match(node)) results.push(node)
    findAll(node.props.children, match, results)
  }
  return results
}

test('Assignments selectors have purpose and tag-rule context in accessible names', () => {
  hooks.reset()
  const props = {
    open: true,
    tagRules: [{ id: 'one', tag: 'Blocked', action: 'Blocked' }],
    onChange: () => {},
    onClose: () => {},
    cardHighlightOptions: { freshDays: 1, staleDays: 7 },
    onCardHighlightOptionsChange: () => {},
    projectWorkItemTypes: ['Bug'],
    includeWorkItemTypes: [],
    onIncludeWorkItemTypesChange: () => {},
    sprintFilter: { current: true, next: true, nextNext: false, iterationPaths: [] },
    onSprintFilterChange: () => {},
    teamIterations: [{ name: 'Sprint 1', path: 'Project\\Sprint 1', timeFrame: 'current' }],
    teamIterationsLoading: false,
  }
  function render() {
    hooks.beginRender()
    return HiddenTagsDialog(props)
  }

  let tree = render()
  assert.equal(find(tree, (node) => node.type === 'Select')?.props['aria-label'], 'Work item types')
  const tabs = find(tree, (node) => node.type === 'Tabs')!
  ;(tabs.props.onChange as (event: null, value: string) => void)(null, 'sprints')
  tree = render()
  assert.equal(find(tree, (node) => node.type === 'Select')?.props['aria-label'], 'Additional sprints')
  ;(tabs.props.onChange as (event: null, value: string) => void)(null, 'tag-rules')
  tree = render()
  assert.equal(find(tree, (node) => node.type === 'Select')?.props['aria-label'], 'Destination for tag rule Blocked')
})

test('Assignments member option defaults off and reports both toggle values', () => {
  hooks.reset()
  const changes: boolean[] = []
  const props = {
    open: true, tagRules: [], onChange: () => {}, onClose: () => {},
    cardHighlightOptions: { freshDays: 1, staleDays: 7 }, onCardHighlightOptionsChange: () => {},
    onHideUsersWithNoActivityChange: (next: boolean) => { changes.push(next) },
  }
  hooks.beginRender()
  const initial = HiddenTagsDialog(props)
  const tabs = find(initial, (node) => node.type === 'Tabs')!
  ;(tabs.props.onChange as (event: null, value: string) => void)(null, 'members')
  hooks.beginRender()
  let tree = HiddenTagsDialog(props)
  let label = find(tree, (node) => node.props.label === 'Hide users with no activity')!
  assert.ok(label)
  let checkbox = label.props.control as Element
  assert.equal(checkbox.props.checked, false)
  ;(checkbox.props.onChange as (event: null, checked: boolean) => void)(null, true)
  hooks.beginRender()
  tree = HiddenTagsDialog({ ...props, hideUsersWithNoActivity: true })
  label = find(tree, (node) => node.props.label === 'Hide users with no activity')!
  checkbox = label.props.control as Element
  assert.equal(checkbox.props.checked, true)
  ;(checkbox.props.onChange as (event: null, checked: boolean) => void)(null, false)
  assert.deepEqual(changes, [true, false])
})

test('Assignments inactive member setting defaults false for missing and older settings', () => {
  assert.equal(createDefaultAssignmentOptions().hideUsersWithNoActivity, false)
  for (const raw of [null, '{}', '{bad', '{"includeWorkItemTypes":["Bug"]}', '{"hideUsersWithNoActivity":"true"}']) {
    assert.equal(parseStoredAssignmentOptions(raw).hideUsersWithNoActivity, false)
  }
  for (const hideUsersWithNoActivity of [true, false]) {
    const options = { ...createDefaultAssignmentOptions(), hideUsersWithNoActivity, includeWorkItemTypes: ['Bug'] }
    assert.deepEqual(parseStoredAssignmentOptions(serializeAssignmentOptions(options)), options)
  }
})

test('Assignments inactive member setting is persisted per team and restored after reload', (t) => {
  const profile = {
    orgName: 'org', projectName: 'project', displayName: 'Team',
    areaPath: 'area', iterationPath: 'iteration', teamName: 'Team', repoName: 'repo',
  }
  const storage = new Map([
    ['standup:team-profiles', JSON.stringify([{ ...profile, id: 'one' }, { ...profile, id: 'two' }])],
  ])
  setupAppStorage(storage, t)
  function useReloadAppState() {
    hooks.reset()
    hooks.beginRender()
    return useStandupAppState()
  }
  let state = useReloadAppState()
  assert.equal(state.assignmentOptionsByTeam.one.hideUsersWithNoActivity, false)
  state.setAssignmentOptionsForTeam('one', {
    ...state.assignmentOptionsByTeam.one, hideUsersWithNoActivity: true,
  })
  assert.equal(JSON.parse(storage.get(assignmentOptionsStorageKey('one'))!).hideUsersWithNoActivity, true)
  state = useReloadAppState()
  assert.equal(state.assignmentOptionsByTeam.one.hideUsersWithNoActivity, true)
  assert.equal(state.assignmentOptionsByTeam.two.hideUsersWithNoActivity, false)
  state.setAssignmentOptionsForTeam('one', {
    ...state.assignmentOptionsByTeam.one, hideUsersWithNoActivity: false,
  })
  assert.equal(useReloadAppState().assignmentOptionsByTeam.one.hideUsersWithNoActivity, false)
})

test('team exports preserve the inactive member setting and older imports default false', () => {
  const data = buildTeamDataExport({
    teamProfile: {
      id: 'team', orgName: 'org', projectName: 'project', displayName: 'Team',
      areaPath: 'area', iterationPath: 'iteration', teamName: 'Team', repoName: 'repo',
    },
    assignmentOptions: { ...createDefaultAssignmentOptions(), hideUsersWithNoActivity: true },
    assignmentTagRules: [],
    qaOptions: createDefaultQaOptions(),
  })
  assert.equal(parseImportedTeamData(serializeTeamDataExport(data)).assignmentOptions.hideUsersWithNoActivity, true)
  const legacy = JSON.parse(serializeTeamDataExport(data))
  delete legacy.assignmentOptions.hideUsersWithNoActivity
  assert.equal(parseImportedTeamData(JSON.stringify(legacy)).assignmentOptions.hideUsersWithNoActivity, false)
})

test('QA selectors have purpose and column context in accessible names', () => {
  hooks.reset()
  const props = {
    open: true,
    options: parseStoredQaOptions(null),
    onChange: () => {},
    onClose: () => {},
    cardHighlightOptions: { freshDays: 1, staleDays: 7 },
    onCardHighlightOptionsChange: () => {},
    projectWorkItemStates: [{ name: 'Active' }],
    projectWorkItemTypes: ['Bug'],
    projectWorkItemStatesLoading: false,
    teamIterations: [{ name: 'Sprint 1', path: 'Project\\Sprint 1', timeFrame: 'current' }],
    teamIterationsLoading: false,
  }
  function render() {
    hooks.beginRender()
    return QaOptionsDialog(props)
  }

  let tree = render()
  assert.equal(find(tree, (node) => node.type === 'Select')?.props['aria-label'], 'QA work item types')
  const tabs = find(tree, (node) => node.type === 'Tabs')!
  ;(tabs.props.onChange as (event: null, value: number) => void)(null, 2)
  tree = render()
  assert.equal(find(tree, (node) => node.type === 'Select')?.props['aria-label'], 'QA additional sprints')
  ;(tabs.props.onChange as (event: null, value: number) => void)(null, 4)
  tree = render()
  const stateSelects = findAll(tree, (node) => node.type === 'Select')
  assert.deepEqual(stateSelects.map((select) => select.props['aria-label']), [
    'Ready for QA column states',
    'Recently completed column states',
    'Needs follow-up column states',
    'Newly added column states',
  ])
})

test('tabbed dialogs use compact navigation and responsive forms on mobile', () => {
  material.setMobileViewport(true)
  hooks.reset()
  hooks.beginRender()
  const qaTree = QaOptionsDialog({
    open: true,
    options: parseStoredQaOptions(null),
    onChange: () => {},
    onClose: () => {},
    cardHighlightOptions: { freshDays: 1, staleDays: 7 },
    onCardHighlightOptionsChange: () => {},
    projectWorkItemStates: [],
    projectWorkItemTypes: [],
    projectWorkItemStatesLoading: false,
    teamIterations: [],
    teamIterationsLoading: false,
  })
  const qaTabs = find(qaTree, (node) => node.type === 'Tabs')!
  assert.equal(qaTabs.props.orientation, 'horizontal')
  assert.equal(qaTabs.props.variant, 'scrollable')
  assert.deepEqual(find(qaTree, (node) => node.type === 'DialogContent')?.props.sx.flexDirection, {
    xs: 'column',
    sm: 'row',
  })

  hooks.reset()
  hooks.beginRender()
  const assignmentTree = HiddenTagsDialog({
    open: true,
    tagRules: [{ id: 'one', tag: 'Blocked', action: 'Blocked' }],
    onChange: () => {},
    onClose: () => {},
    cardHighlightOptions: { freshDays: 1, staleDays: 7 },
    onCardHighlightOptionsChange: () => {},
  })
  const assignmentTabs = find(assignmentTree, (node) => node.type === 'Tabs')!
  ;(assignmentTabs.props.onChange as Function)(null, 'tag-rules')
  hooks.beginRender()
  const tagRulesTree = HiddenTagsDialog({
    open: true,
    tagRules: [{ id: 'one', tag: 'Blocked', action: 'Blocked' }],
    onChange: () => {},
    onClose: () => {},
    cardHighlightOptions: { freshDays: 1, staleDays: 7 },
    onCardHighlightOptionsChange: () => {},
  })
  const ruleGrid = find(tagRulesTree, (node) => node.props.sx?.gridTemplateColumns)!
  assert.equal(ruleGrid.props.sx.gridTemplateColumns.xs, 'repeat(3, auto) minmax(0, 1fr)')
  assert.equal(ruleGrid.props.sx.gridTemplateColumns.sm, 'minmax(0, 1fr) 140px auto auto auto')
  assert.equal(find(tagRulesTree, (node) => node.props.placeholder === 'Tag match')?.props.sx.gridColumn.xs, '1 / -1')
  assert.equal(find(tagRulesTree, (node) => node.type === 'Select')?.props.sx.gridColumn.xs, '1 / -1')
  material.setMobileViewport(false)
})

for (const [name, Component, typesTab] of [
  ['QA', QaOptionsDialog, 0],
  ['Assignments', HiddenTagsDialog, 'work-item-types'],
] as const) {
  test(`${name} options distinguish metadata failure, loading, empty results, and recovery`, () => {
    hooks.reset()
    let retries = 0
    const props = {
      open: true,
      options: parseStoredQaOptions(null),
      tagRules: [],
      onChange: () => {},
      onClose: () => {},
      cardHighlightOptions: { freshDays: 1, staleDays: 7 },
      onCardHighlightOptionsChange: () => {},
      projectWorkItemStates: [],
      projectWorkItemTypes: [] as string[],
      projectWorkItemStatesLoading: false,
      projectWorkItemTypesLoading: false,
      projectWorkItemStatesError: 'Unable to load work item types and states: 503 Service Unavailable',
      retryProjectWorkItemStates: () => { retries++ },
      teamIterations: [],
      teamIterationsLoading: false,
    }
    function render() {
      hooks.beginRender()
      const tree = Component(props)
      hooks.flushEffects()
      return tree
    }
    let tree = render()
    const tabs = find(tree, (node) => node.type === 'Tabs')!
    ;(tabs.props.onChange as Function)(null, typesTab)
    tree = render()
    const alert = find(tree, (node) => node.type === 'Alert' && node.props.role === 'alert')!
    assert.ok(alert)
    assert.match(String(alert.props.children), /work item types and states.*503/)
    assert.equal(find(tree, (node) => node.props.children === 'No work item types found for this project.'), undefined)
    const retry = find(alert.props.action, (node) => node.type === 'Button' && node.props.children === 'Retry')!
    ;(retry.props.onClick as Function)()
    assert.equal(retries, 1)

    props.projectWorkItemStatesLoading = true
    props.projectWorkItemTypesLoading = true
    tree = render()
    assert.ok(find(tree, (node) => node.props.children === 'Loading types…'))
    assert.equal(find(tree, (node) => node.type === 'Alert'), undefined)

    props.projectWorkItemStatesLoading = false
    props.projectWorkItemTypesLoading = false
    props.projectWorkItemStatesError = ''
    tree = render()
    assert.ok(find(tree, (node) => node.props.children === 'No work item types found for this project.'))
    assert.equal(find(tree, (node) => node.type === 'Alert'), undefined)

    props.projectWorkItemTypes = ['Bug', 'Product Backlog Item']
    tree = render()
    assert.ok(find(tree, (node) => node.type === 'MenuItem' && node.props.value === 'Bug'))
    assert.ok(find(tree, (node) => node.type === 'MenuItem' && node.props.value === 'Product Backlog Item'))

    if (name === 'QA') {
      props.projectWorkItemStatesError = 'Unable to load work item types and states: 503 Service Unavailable'
      ;(tabs.props.onChange as Function)(null, 4)
      tree = render()
      assert.ok(find(tree, (node) => node.type === 'Alert' && node.props.role === 'alert'))
      assert.equal(find(tree, (node) => node.props.children === 'No states found for this project.'), undefined)
    }
  })
}

function setup(unreadable = false) {
  hooks.reset()
  let committed = { freshDays: 1, staleDays: 7 }
  const storageKey = qaCardHighlightOptionsStorageKey('team')
  const storage = new Map([[storageKey, serializeCardHighlightOptions(committed)]])
  const qaStorageKey = qaOptionsStorageKey('team')
  if (unreadable) storage.set(qaStorageKey, '{bad')
  const calls: string[] = []
  const props = {
    open: true,
    options: parseStoredQaOptions(storage.get(qaStorageKey) ?? null),
    recoveryWarning: unreadable ? 'Saved QA options could not be read. Defaults are in use.' : undefined,
    cardHighlightOptions: committed,
    onChange: (next: ReturnType<typeof parseStoredQaOptions>) => {
      calls.push('options')
      storage.set(qaStorageKey, serializeQaOptions(next))
    },
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
    props, calls, storage, storageKey, qaStorageKey, render, node, change, freshnessTab,
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
    assert.deepEqual(dialog.calls, ['freshness', 'close'])
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

for (const closeVia of ['button', 'escapeKeyDown', 'backdropClick']) {
  test(`unchanged defaults preserve unreadable QA data when closing via ${closeVia}`, () => {
    const dialog = setup(true)
    assert.match(String(dialog.node((node) => node.type === 'Alert').props.children), /could not be read/)
    if (closeVia === 'button') {
      const close = dialog.node((node) => node.type === 'Button' && node.props.children === 'Close')
      ;(close.props.onClick as () => void)()
    } else {
      const modal = dialog.node((node) => node.type === 'Dialog')
      ;(modal.props.onClose as (event: unknown, reason: string) => void)({}, closeVia)
    }
    assert.deepEqual(dialog.calls, ['close'])
    assert.equal(dialog.storage.get(dialog.qaStorageKey), '{bad')
  })
}

test('changing only freshness preserves unreadable QA options', () => {
  const dialog = setup(true)
  dialog.change('Fresh threshold (days)', '3')
  const close = dialog.node((node) => node.type === 'Button' && node.props.children === 'Close')
  ;(close.props.onClick as () => void)()
  assert.deepEqual(dialog.calls, ['freshness', 'close'])
  assert.equal(dialog.storage.get(dialog.qaStorageKey), '{bad')
})

test('editing QA options deliberately replaces unreadable data on close', () => {
  const dialog = setup(true)
  const tabs = dialog.node((node) => node.type === 'Tabs')
  ;(tabs.props.onChange as (event: null, value: number) => void)(null, 1)
  dialog.render()
  dialog.change('Lookback window (days)', '14')
  assert.equal(dialog.storage.get(dialog.qaStorageKey), '{bad')
  const close = dialog.node((node) => node.type === 'Button' && node.props.children === 'Close')
  ;(close.props.onClick as () => void)()
  assert.deepEqual(dialog.calls, ['options', 'close'])
  assert.equal(JSON.parse(dialog.storage.get(dialog.qaStorageKey)!).lookbackDays, 14)
})

test('explicitly accepting defaults replaces unreadable QA options', () => {
  const dialog = setup(true)
  const reset = dialog.node((node) => node.type === 'Button' && node.props.children === 'Use default QA options')
  ;(reset.props.onClick as () => void)()
  assert.deepEqual(dialog.calls, ['options', 'close'])
  assert.equal(dialog.storage.get(dialog.qaStorageKey), serializeQaOptions(parseStoredQaOptions(null)))
})

test('app state preserves corrupt profiles without seeding and clears recovery after replacement', (t) => {
  const storage = new Map([['standup:team-profiles', '{bad']])
  setupAppStorage(storage, t)
  hooks.reset()
  hooks.beginRender()
  let state = useStandupAppState()
  assert.equal(state.teamProfilesUnreadable, true)
  assert.deepEqual(state.teamProfiles, [])
  assert.deepEqual([...storage], [['standup:team-profiles', '{bad']])
  state.replaceTeamProfiles([])
  hooks.beginRender()
  state = useStandupAppState()
  assert.equal(state.teamProfilesUnreadable, false)
  assert.equal(storage.get('standup:team-profiles'), '[]')
})

test('QA recovery is team-specific and clears only after saving that team', (t) => {
  const profile = {
    orgName: 'org', projectName: 'project', displayName: 'Team',
    areaPath: 'area', iterationPath: 'iteration', teamName: 'Team', repoName: 'repo',
  }
  const storage = new Map([
    ['standup:team-profiles', JSON.stringify([{ ...profile, id: 'broken' }, { ...profile, id: 'valid' }])],
    [qaOptionsStorageKey('broken'), '{bad'],
    [qaOptionsStorageKey('valid'), serializeQaOptions({ ...parseStoredQaOptions(null), lookbackDays: 10 })],
  ])
  setupAppStorage(storage, t)
  hooks.reset()
  hooks.beginRender()
  let state = useStandupAppState()
  assert.deepEqual(state.qaOptionsUnreadableByTeam, { broken: true, valid: false })
  assert.equal(state.qaOptionsByTeam.valid.lookbackDays, 10)
  assert.equal(storage.get(qaOptionsStorageKey('broken')), '{bad')
  state.setQaOptionsForTeam('broken', parseStoredQaOptions(null))
  hooks.beginRender()
  state = useStandupAppState()
  assert.deepEqual(state.qaOptionsUnreadableByTeam, { broken: false, valid: false })
  assert.equal(storage.get(qaOptionsStorageKey('broken')), serializeQaOptions(parseStoredQaOptions(null)))
})

function setupAppStorage(storage: Map<string, string>, t: import('node:test').TestContext) {
  for (const [name, entries] of [['localStorage', storage], ['sessionStorage', new Map<string, string>()]] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => entries.set(key, value),
        removeItem: (key: string) => entries.delete(key),
      },
    })
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    })
  }
}
