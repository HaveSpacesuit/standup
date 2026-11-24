import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import type { TeamProfile } from '../src/appSettings.ts'
import type { TeamDataExport } from '../src/teamDataTransfer.ts'

const appTestModules: Record<string, string> = {
  './features/standup/hooks/useBoardViewModel': `export const useBoardViewModel = () => ({
    selectedTeamId: 'one', tagRulesByTeam: {}, selectedAssignmentWorkItemTypes: ['Bug'],
    backlogBugs: [],
    setTagRulesForTeam: () => {}, onTeamChange: () => {}, applyCommittedPreferences: () => {},
  })`,
  './features/standup/hooks/useQualityAssurancePageModel': `export const useQualityAssurancePageModel = () => ({})`,
  './features/standup/hooks/useBacklogPageModel': `export const useBacklogPageModel = () => ({})`,
  './features/standup/hooks/useAppNavigation': `export const useAppNavigation = () => ({ activeView: 'development' })`,
  './features/standup/components/StandupContent': `export const StandupContent = 'StandupContent'`,
  './features/standup/components/WorkItemEditing': `export const WorkItemEditingProvider = 'WorkItemEditingProvider'`,
  './features/standup/components/PatEntryDialog': `export const PatEntryDialog = 'PatEntryDialog'`,
}

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: ['react', 'react/jsx-runtime', '@mui/material', /^@stratakit\//] },
  plugins: [{
    name: 'navigation-settings-test',
    enforce: 'pre',
    resolveId: (id) => id in appTestModules || ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@mui/material', '@stratakit/mui', '@stratakit/structures', './AppTooltip'].includes(id) ? `\0settings-test:${id}` : undefined,
    load: (id) => {
      if (id.startsWith('\0settings-test:') && id.slice('\0settings-test:'.length) in appTestModules) {
        return appTestModules[id.slice('\0settings-test:'.length)]
      }
      if (id === '\0settings-test:react') return `
        let scopes = new Map(), states = [], cursor = 0
        export const reset = () => { scopes = new Map(); states = [] }
        export const beginRender = (scope = 'rail') => {
          cursor = 0
          if (!scopes.has(scope)) scopes.set(scope, [])
          states = scopes.get(scope)
        }
        export const useState = initial => {
          const index = cursor++
          if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
          const store = states
          return [store[index], next => { store[index] = typeof next === 'function' ? next(store[index]) : next }]
        }
        export const useRef = initial => useState(() => ({ current: initial }))[0]
        export const useMemo = calculate => calculate()
        export const useCallback = callback => callback
        export const useEffect = () => {}
      `
      if (id === '\0settings-test:react/jsx-runtime' || id === '\0settings-test:react/jsx-dev-runtime') return `
        export const jsx = (type, props) => ({ type, props })
        export const jsxs = jsx
        export const jsxDEV = jsx
      `
      if (id === '\0settings-test:@mui/material') return `
        export const useMediaQuery = () => false
        export const Alert = 'Alert', Box = 'Box', Button = 'Button', Dialog = 'Dialog', DialogActions = 'DialogActions',
          DialogContent = 'DialogContent', DialogTitle = 'DialogTitle', Divider = 'Divider',
          FormControlLabel = 'FormControlLabel', InputAdornment = 'InputAdornment', Link = 'Link', List = 'List',
          ListItemButton = 'ListItemButton', ListItemText = 'ListItemText', Stack = 'Stack', Switch = 'Switch',
          Tab = 'Tab', Tabs = 'Tabs', TextField = 'TextField', Typography = 'Typography'
      `
      if (id === '\0settings-test:@stratakit/mui') return `export const Icon = 'Icon'`
      if (id === '\0settings-test:@stratakit/structures') return `
        export const unstable_NavigationRail = Object.fromEntries(
          ['Root', 'Header', 'ToggleButton', 'Content', 'List', 'ListItem', 'Anchor', 'Footer', 'Button'].map(key => [key, 'Rail' + key]))
      `
      if (id === '\0settings-test:./AppTooltip') return `export const AppTooltip = 'Tooltip'`
    },
  }],
})
after(() => server.close())
const { AppNavigationRail } = await server.ssrLoadModule('/src/features/standup/components/AppNavigationRail.tsx')
const { AutoRefreshSettings } = await server.ssrLoadModule('/src/features/standup/components/AutoRefreshSettings.tsx')
const hooks = await server.ssrLoadModule('\0settings-test:react')
const { buildTeamDataExport } = await server.ssrLoadModule('/src/teamDataTransfer.ts')
const { createDefaultAssignmentOptions, createDefaultQaOptions } = await server.ssrLoadModule('/src/features/standup/utils/standupOptionDefaults.ts')
const { useStandupAppState: renderAppState } = await server.ssrLoadModule('/src/features/standup/hooks/useStandupAppState.ts')
const { useTeamDataTransferActions: createTransferActions } = await server.ssrLoadModule('/src/features/standup/hooks/useTeamDataTransferActions.ts')
const { TEAM_PROFILES_STORAGE_KEY } = await server.ssrLoadModule('/src/appSettings.ts')
const { AUTO_REFRESH_STORAGE_KEY } = await server.ssrLoadModule('/src/features/standup/utils/autoRefresh.ts')
const { qaOptionsStorageKey } = await server.ssrLoadModule('/src/features/standup/utils/qaOptions.ts')
const { assignmentOptionsStorageKey } = await server.ssrLoadModule('/src/features/standup/utils/assignmentOptions.ts')
const { backlogOptionsStorageKey } = await server.ssrLoadModule('/src/features/standup/utils/backlogOptions.ts')
const { triageOptionsStorageKey } = await server.ssrLoadModule('/src/features/standup/utils/triageOptions.ts')
const { tagRulesStorageKey, SELECTED_TEAM_STORAGE_KEY } = await server.ssrLoadModule('/src/features/standup/hooks/useBoardPreferences.ts')
const { useBoardPreferences: renderBoardPreferences } = await server.ssrLoadModule('/src/features/standup/hooks/useBoardPreferences.ts')
const { getPatSessionSignal } = await server.ssrLoadModule('/src/adoAuth.ts')
const { default: App } = await server.ssrLoadModule('/src/App.tsx')

type Element = { type: unknown; props: Record<string, any> }
function find(tree: unknown, match: (node: Element) => boolean): Element | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const result = find(child, match)
      if (result) return result
    }
  } else if (tree && typeof tree === 'object' && 'props' in tree) {
    const node = tree as Element
    return match(node) ? node : find(node.props.children, match) ?? find(node.props.control, match)
  }
}
const team: TeamProfile = {
  id: 'one', orgName: 'org', projectName: 'project', displayName: 'One',
  areaPath: 'project\\one', iterationPath: 'project\\iteration', teamName: 'one', repoName: 'repo',
}
const secondTeam = { ...team, id: 'two', displayName: 'Two' }

function setup(overrides: Record<string, unknown> = {}) {
  hooks.reset()
  const calls: { name: string; args: any[] }[] = []
  const callback = (name: string) => (...args: any[]) => { calls.push({ name, args }) }
  const props: Record<string, any> = {
    activeView: 'development', colorScheme: 'light', onToggleColorScheme: callback('color'),
    rememberLastView: false, onRememberLastViewChange: callback('remember'),
    autoRefresh: { enabled: false, minutes: 15 }, onAutoRefreshChange: callback('refresh'),
    patConfigured: true, patValue: 'saved-pat', onPatSave: callback('pat'), onPatClear: callback('clear'),
    onExportTeamData: callback('export'), onImportTeamData: callback('import'),
    selectedTeamId: 'one', teamProfiles: [team, secondTeam], onTeamProfilesChange: callback('teams'),
    patCreationUrl: '', ...overrides,
  }
  props.onSaveSettings ??= (draft: any) => {
    if (JSON.stringify(draft.autoRefresh) !== JSON.stringify(props.autoRefresh)) {
      if (props.onAutoRefreshChange(draft.autoRefresh) === false) throw new Error('Unable to save auto-refresh settings.')
    }
    for (const imported of draft.imports) props.onImportTeamData(JSON.stringify(imported), draft.teamProfiles)
    if (JSON.stringify(draft.teamProfiles) !== JSON.stringify(props.teamProfiles) || draft.imports.length) {
      props.onTeamProfilesChange(draft.teamProfiles)
    }
    if (draft.rememberLastView !== props.rememberLastView) props.onRememberLastViewChange(draft.rememberLastView)
    if (draft.colorScheme !== undefined) props.onToggleColorScheme()
    if (draft.pat === null) props.onPatClear()
    else if (draft.pat !== undefined) props.onPatSave(draft.pat)
  }
  const render = () => { hooks.beginRender(); return AppNavigationRail(props) }
  const node = (match: (node: Element) => boolean) => {
    const result = find(render(), match)
    assert.ok(result)
    return result
  }
  const button = (label: string) => node((node) => node.type === 'Button' && node.props.children === label)
  const click = (label: string) => button(label).props.onClick()
  const open = () => node((node) => node.type === 'RailButton' && node.props.label === 'Settings').props.onClick()
  const tab = (value: string) => node((node) => node.type === 'Tabs').props.onChange(null, value)
  const field = (label: string, value: string) => node((node) => node.type === 'TextField' && node.props.label === label).props.onChange({ target: { value } })
  const dialog = () => node((node) => node.type === 'Dialog' && find(node, child => child.type === 'DialogTitle')?.props.children === 'Settings')
  open()
  return { calls, props, render, node, click, open, tab, field, dialog }
}

test('global preferences, PAT, team edits and reorder stay local until Save; all dismissals discard', () => {
  for (const dismissal of ['Cancel', 'escapeKeyDown', 'backdropClick']) {
    const ui = setup()
    ui.field('Personal access token', 'draft-pat')
    ui.click('Use PAT')
    ui.tab('teams')
    ui.field('Display name', 'Renamed')
    ui.click('Save team')
    ui.node(node => node.type === 'Button' && node.props['aria-label'] === 'Move Renamed (org/project) down').props.onClick({ stopPropagation() {} })
    ui.tab('display')
    ui.node(node => node.type === 'Switch' && !node.props.slotProps).props.onChange(null, true)
    ui.node(node => node.type === 'Switch' && !!node.props.slotProps).props.onChange(null, true)
    const refresh = ui.node(node => node.type === AutoRefreshSettings)
    refresh.props.onChange({ enabled: true, minutes: 8 })
    refresh.props.onMinutesChange('8')
    assert.deepEqual(ui.calls, [])
    if (dismissal === 'Cancel') ui.click('Cancel')
    else ui.dialog().props.onClose(null, dismissal)
    assert.equal(ui.dialog().props.open, false)
    assert.deepEqual(ui.calls, [])
    ui.open()
    assert.equal(ui.node(node => node.type === 'TextField' && node.props.label === 'Personal access token').props.value, 'saved-pat')
    ui.tab('teams')
    assert.equal(ui.node(node => node.type === 'TextField' && node.props.label === 'Display name').props.value, 'One')
    ui.tab('display')
    assert.equal(ui.node(node => node.type === AutoRefreshSettings).props.minutesValue, '15')
    ui.click('Save')
    assert.deepEqual(ui.calls, [], 'a no-op Save does not overwrite recovery data')
  }
})

test('global Save commits valid drafts including un-staged editor changes; clearing PAT waits for Save', () => {
  const ui = setup()
  ui.click('Clear PAT')
  assert.equal(ui.dialog().props.open, true)
  ui.tab('teams')
  ui.field('Display name', ' Renamed ')
  ui.tab('display')
  ui.node(node => node.type === 'Switch' && !node.props.slotProps).props.onChange(null, true)
  ui.node(node => node.type === 'Switch' && !!node.props.slotProps).props.onChange(null, true)
  ui.click('Save')
  assert.deepEqual(ui.calls.map(call => call.name), ['teams', 'remember', 'color', 'clear'])
  assert.equal(ui.calls[0].args[0][0].displayName, 'Renamed')
  assert.equal(ui.dialog().props.open, false)
  const replacement = setup()
  replacement.click('Clear PAT')
  replacement.field('Personal access token', ' replacement-pat ')
  replacement.click('Save')
  assert.deepEqual(replacement.calls, [{ name: 'pat', args: ['replacement-pat'] }])
})

test('team additions and deletions are drafts and global Cancel discards them', () => {
  const ui = setup()
  ui.tab('teams')
  ui.click('Add team')
  for (const [label, value] of Object.entries({
    'Display name': 'Three', Organization: 'org', Project: 'project', 'Azure DevOps team name': 'three',
    'Repository name': 'repo', 'Area path': 'project\\three', 'Iteration path': 'project\\iteration',
  })) ui.field(label, value)
  ui.click('Save team')
  ui.click('Remove team')
  ui.click('Remove team')
  assert.deepEqual(ui.calls, [])
  ui.click('Cancel')
  ui.open()
  ui.tab('teams')
  assert.ok(find(ui.render(), node => node.type === 'Button' && node.props['aria-label'] === 'Move One (org/project) down'))
  ui.click('Save')
  assert.deepEqual(ui.calls, [])
})

test('invalid PAT, team and refresh drafts block all Save callbacks, including across tabs', () => {
  const ui = setup()
  ui.field('Personal access token', ' ')
  ui.click('Save')
  assert.equal(ui.dialog().props.open, true)
  assert.deepEqual(ui.calls, [])
  ui.field('Personal access token', 'draft')
  ui.tab('teams')
  ui.field('Organization', '')
  ui.tab('display')
  ui.click('Save')
  assert.equal(ui.dialog().props.open, true)
  assert.deepEqual(ui.calls, [])
  ui.field('Organization', 'org')
  ui.tab('display')
  ui.node(node => node.type === AutoRefreshSettings).props.onChange({ enabled: true, minutes: 15 })
  ui.node(node => node.type === AutoRefreshSettings).props.onMinutesChange('1.5')
  ui.tab('azure-devops')
  ui.click('Save')
  assert.equal(ui.dialog().props.open, true)
  assert.deepEqual(ui.calls, [])
  assert.ok(find(ui.render(), node => node.type === 'Alert' && node.props.children === 'Enter a whole number of minutes greater than 0.'))
})

test('Save callback failures stay visible and leave Settings open', () => {
  for (const onAutoRefreshChange of [() => false, () => { throw new Error('Storage denied') }]) {
    const ui = setup({ onAutoRefreshChange })
    ui.tab('display')
    ui.node(node => node.type === AutoRefreshSettings).props.onChange({ enabled: true, minutes: 15 })
    ui.click('Save')
    assert.equal(ui.dialog().props.open, true)
    assert.deepEqual(ui.calls, [])
    assert.ok(find(ui.render(), node => node.type === 'Alert' && /Unable to save|Storage denied/.test(node.props.children)))
  }
  const ui = setup({ onTeamProfilesChange: () => { throw new Error('Team storage denied') } })
  ui.tab('teams')
  ui.field('Display name', 'Changed')
  ui.click('Save')
  assert.equal(ui.dialog().props.open, true)
  assert.deepEqual(ui.calls, [])
  assert.ok(find(ui.render(), node => node.type === 'Alert' && node.props.children === 'Team storage denied'))
})

test('deleting every team and then adding a replacement stays within the draft', () => {
  const ui = setup({ teamProfiles: [team] })
  ui.tab('teams')
  ui.click('Remove team')
  assert.deepEqual(ui.calls, [])
  for (const [label, value] of Object.entries({
    'Display name': 'Replacement', Organization: 'org', Project: 'project', 'Azure DevOps team name': 'replacement',
    'Repository name': 'repo', 'Area path': 'project\\replacement', 'Iteration path': 'project\\iteration',
  })) ui.field(label, value)
  ui.click('Save team')
  assert.deepEqual(ui.calls, [])
  ui.click('Save')
  assert.equal(ui.calls.length, 1)
  assert.equal(ui.calls[0].args[0].length, 1)
  assert.equal(ui.calls[0].args[0][0].displayName, 'Replacement')
})

test('imports and recovery options are staged; export receives draft data; Save preserves edited imported profiles', async () => {
  const ui = setup()
  const imported: TeamDataExport = buildTeamDataExport({
    teamProfile: { ...team, displayName: 'Imported' },
    assignmentOptions: createDefaultAssignmentOptions(),
    assignmentTagRules: [], qaOptions: createDefaultQaOptions(),
  })
  ui.tab('teams')
  const input = ui.node(node => node.type === 'input')
  await input.props.onChange({ target: { files: [{ text: async () => JSON.stringify(imported) }], value: 'file.json' } })
  // The input handler intentionally starts asynchronous reading without returning its promise.
  await Promise.resolve()
  assert.deepEqual(ui.calls, [])
  assert.equal(ui.node(node => node.type === 'TextField' && node.props.label === 'Display name').props.value, 'Imported')
  ui.field('Display name', 'Edited import')
  ui.click('Save team')
  ui.click('Export team data')
  assert.equal(ui.calls[0].name, 'export')
  assert.equal(ui.calls[0].args[1].displayName, 'Edited import')
  assert.equal(ui.calls[0].args[2].teamProfile.displayName, 'Imported')
  ui.calls.length = 0
  ui.click('Cancel')
  assert.deepEqual(ui.calls, [])
  ui.open()
  ui.tab('teams')
  await ui.node(node => node.type === 'input').props.onChange({ target: { files: [{ text: async () => JSON.stringify(imported) }], value: '' } })
  await Promise.resolve()
  ui.field('Display name', 'Committed import')
  ui.click('Save')
  assert.deepEqual(ui.calls.map(call => call.name), ['import', 'teams'])
  assert.equal(JSON.parse(ui.calls[0].args[0]).teamProfile.displayName, 'Committed import')
  assert.equal(ui.calls[0].args[1][0].displayName, 'Committed import')
  assert.equal(ui.calls[1].args[0][0].displayName, 'Committed import')
})

test('invalid or late imports cannot silently commit or leak into a reopened draft', async () => {
  const ui = setup()
  ui.tab('teams')
  await ui.node(node => node.type === 'input').props.onChange({ target: { files: [{ text: async () => '{}' }], value: '' } })
  await Promise.resolve()
  ui.click('Save')
  assert.equal(ui.dialog().props.open, true)
  assert.deepEqual(ui.calls, [])
  let resolveFile!: (value: string) => void
  ui.node(node => node.type === 'input').props.onChange({
    target: { files: [{ text: () => new Promise<string>(resolve => { resolveFile = resolve }) }], value: '' },
  })
  ui.click('Cancel')
  ui.open()
  resolveFile('{}')
  await Promise.resolve()
  ui.click('Save')
  assert.equal(ui.dialog().props.open, false)
  assert.deepEqual(ui.calls, [])
})

function productionSettings(t: { after: (callback: () => void) => void }) {
  const dom = new JSDOM('', { url: 'https://standup.example' })
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] })
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    })
  }
  t.after(() => dom.window.close())
  localStorage.setItem(TEAM_PROFILES_STORAGE_KEY, JSON.stringify([team, secondTeam]))
  localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, team.id)
  localStorage.setItem(qaOptionsStorageKey(team.id), 'unreadable recovery data')
  localStorage.setItem(triageOptionsStorageKey(team.id), 'unreadable recovery data')
  sessionStorage.setItem('standup:azdo-pat-session', 'saved-pat')
  const ui = setup()
  const renderState = () => {
    hooks.beginRender('app-state')
    return renderAppState()
  }
  const state = renderState()
  const boardProfiles = state.teamProfiles
  const readBoard = () => {
    hooks.beginRender('board-preferences')
    return renderBoardPreferences(boardProfiles)
  }
  const board = readBoard()
  let runtimeColorScheme = 'light'
  const transfer = createTransferActions({
    ...state, tagRulesByTeam: {},
    setTagRulesForTeam: (id: string, rules: unknown[]) => localStorage.setItem(tagRulesStorageKey(id), JSON.stringify(rules)),
    onTeamChange: (id: string) => localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, id),
  })
  Object.assign(ui.props, {
    ...state, patValue: state.storedPatState.pat,
    onAutoRefreshChange: state.setAutoRefreshPersisted,
    onRememberLastViewChange: state.setRememberLastViewPersisted,
    onPatSave: state.handlePatSave, onPatClear: state.handlePatClear,
    onTeamProfilesChange: state.handleTeamProfilesChange,
    onExportTeamData: transfer.handleExportTeamData, onImportTeamData: transfer.handleImportTeamData,
    onSaveSettings: (draft: any) => {
      const committed = state.saveGlobalSettings(draft)
      board.applyCommittedPreferences(committed.selectedTeamId, committed.importedTagRules, draft.teamProfiles.map((team: TeamProfile) => team.id))
      if (draft.colorScheme !== undefined) runtimeColorScheme = draft.colorScheme
    },
  })
  ui.open()
  const snapshot = () => Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
    const key = localStorage.key(index)!
    return [key, localStorage.getItem(key)]
  }))
  const runtimeSnapshot = () => {
    const current = renderState()
    const boardState = readBoard()
    return {
      teamProfiles: current.teamProfiles, autoRefresh: current.autoRefresh, rememberLastView: current.rememberLastView,
      pat: current.storedPatState, qa: current.qaOptionsByTeam, assignment: current.assignmentOptionsByTeam,
      backlog: current.backlogOptionsByTeam, triage: current.triageSettingsByTeam,
      selectedTeamId: boardState.selectedTeamId, tags: boardState.tagRulesByTeam, colorScheme: runtimeColorScheme,
    }
  }
  return { ui, renderState, transfer, dom, snapshot, runtimeSnapshot }
}

test('production hooks preserve real storage on Cancel and Save imported options with the complete draft list', async (t) => {
  const { ui, renderState, snapshot } = productionSettings(t)
  const before = snapshot()
  const thirdTeam = { ...team, id: 'three', displayName: 'Three' }
  const imported = buildTeamDataExport({
    teamProfile: thirdTeam, assignmentOptions: createDefaultAssignmentOptions(),
    qaOptions: { ...createDefaultQaOptions(), lookbackDays: 42 }, assignmentTagRules: [],
  })
  const importDraft = async (data: unknown) => {
    ui.tab('teams')
    ui.node(node => node.type === 'input').props.onChange({ target: { files: [{ text: async () => JSON.stringify(data) }], value: '' } })
    await Promise.resolve()
  }
  await importDraft(imported)
  assert.deepEqual(snapshot(), before)
  ui.click('Cancel')
  assert.deepEqual(snapshot(), before)
  ui.open()
  await importDraft(imported)
  ui.field('Display name', 'Edited imported team')
  ui.click('Save team')
  ui.node(node => node.type === 'Button' && node.props['aria-label'] === 'Move Edited imported team (org/project) up').props.onClick({ stopPropagation() {} })
  await importDraft({ ...imported, teamProfile: { ...team, displayName: 'Recovered One' } })
  await importDraft({ ...imported, teamProfile: { ...thirdTeam, displayName: 'Edited imported team' } })
  assert.deepEqual(snapshot(), before)
  ui.click('Save')
  assert.equal(ui.dialog().props.open, false)
  const savedTeams = JSON.parse(localStorage.getItem(TEAM_PROFILES_STORAGE_KEY)!)
  assert.deepEqual(savedTeams.map((entry: TeamProfile) => entry.id), ['one', 'three', 'two'])
  assert.equal(savedTeams[1].displayName, 'Edited imported team')
  assert.equal(JSON.parse(localStorage.getItem(qaOptionsStorageKey('one'))!).lookbackDays, 42)
  assert.equal(JSON.parse(localStorage.getItem(qaOptionsStorageKey('three'))!).lookbackDays, 42)
  for (const key of [assignmentOptionsStorageKey('three'), backlogOptionsStorageKey('three'), triageOptionsStorageKey('three'), tagRulesStorageKey('three')]) {
    assert.notEqual(localStorage.getItem(key), null)
  }
  assert.equal(localStorage.getItem(SELECTED_TEAM_STORAGE_KEY), 'three', 're-importing a team selects the latest imported team only after Save')
  const state = renderState()
  assert.equal(state.teamProfiles[1].displayName, 'Edited imported team')
  assert.equal(state.qaOptionsByTeam.three.lookbackDays, 42)
  assert.equal(state.triageSettingsByTeam.one.error, null)
})

test('production export downloads draft/new team configuration and staged recovery options without writing storage', async (t) => {
  const { transfer, snapshot } = productionSettings(t)
  const before = snapshot()
  const newTeam = { ...team, id: 'new-team', displayName: 'Draft team' }
  const imported = buildTeamDataExport({
    teamProfile: newTeam, assignmentOptions: createDefaultAssignmentOptions(),
    qaOptions: { ...createDefaultQaOptions(), lookbackDays: 35 }, assignmentTagRules: [],
  })
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  let downloaded: Blob | undefined
  let fileName = ''
  URL.createObjectURL = (blob) => { downloaded = blob as Blob; return 'blob:settings-test' }
  URL.revokeObjectURL = () => {}
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ set download(value: string) { fileName = value }, click() {} }) },
  })
  t.after(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor)
    else Reflect.deleteProperty(globalThis, 'document')
  })
  assert.throws(() => transfer.handleExportTeamData(team.id, team), /saved Triage options error/)
  transfer.handleExportTeamData(team.id, { ...team, displayName: 'Recovery draft' }, { ...imported, teamProfile: team })
  assert.equal(JSON.parse(await downloaded!.text()).teamProfile.displayName, 'Recovery draft')
  transfer.handleExportTeamData(newTeam.id, { ...newTeam, displayName: 'Edited draft' }, imported)
  const result = JSON.parse(await downloaded!.text())
  assert.equal(result.teamProfile.displayName, 'Edited draft')
  assert.equal(result.qaOptions.lookbackDays, 35)
  assert.equal(fileName, 'edited-draft-standup.json')
  assert.deepEqual(snapshot(), before)
  assert.throws(() => transfer.handleExportTeamData(newTeam.id, { ...newTeam, orgName: '' }, imported), /Organization/)
})

test('production storage failures block closing; failed setters do not update runtime preferences', (t) => {
  const { ui, dom, renderState, snapshot } = productionSettings(t)
  const before = snapshot()
  const original = dom.window.Storage.prototype.setItem
  dom.window.Storage.prototype.setItem = function (key: string, value: string) {
    if (key === AUTO_REFRESH_STORAGE_KEY) throw new Error('Storage denied')
    return original.call(this, key, value)
  }
  t.after(() => { dom.window.Storage.prototype.setItem = original })
  ui.tab('teams')
  ui.field('Display name', 'Must not commit')
  ui.tab('display')
  ui.node(node => node.type === AutoRefreshSettings).props.onChange({ enabled: true, minutes: 15 })
  ui.click('Save')
  assert.equal(ui.dialog().props.open, true)
  assert.deepEqual(snapshot(), before)
  assert.deepEqual(renderState().autoRefresh, { enabled: false, minutes: 15 })
  assert.equal(renderState().autoRefreshError, null, 'failed transactions preserve runtime settings, including recovery state')
  assert.ok(find(ui.render(), node => node.type === 'Alert' && /Storage denied/.test(node.props.children)))
})

test('production import validates the whole final draft before any storage or selection callback', (t) => {
  const { transfer, snapshot } = productionSettings(t)
  const before = snapshot()
  const imported = buildTeamDataExport({
    teamProfile: team, assignmentOptions: createDefaultAssignmentOptions(),
    qaOptions: createDefaultQaOptions(), assignmentTagRules: [],
  })
  assert.throws(() => transfer.handleImportTeamData(JSON.stringify(imported), [team, { ...secondTeam, orgName: '' }]), /Organization/)
  assert.deepEqual(snapshot(), before)
  assert.throws(() => transfer.handleImportTeamData(JSON.stringify(imported), [team, team]), /unique/)
  assert.deepEqual(snapshot(), before)
})

test('production imported-option storage failures remain explicit and do not switch the active team', async (t) => {
  const { ui, dom } = productionSettings(t)
  const imported = buildTeamDataExport({
    teamProfile: { ...team, id: 'three', displayName: 'Three' },
    assignmentOptions: createDefaultAssignmentOptions(), qaOptions: createDefaultQaOptions(), assignmentTagRules: [],
  })
  ui.tab('teams')
  ui.node(node => node.type === 'input').props.onChange({
    target: { files: [{ text: async () => JSON.stringify(imported) }], value: '' },
  })
  await Promise.resolve()
  const original = dom.window.Storage.prototype.setItem
  dom.window.Storage.prototype.setItem = function (key: string, value: string) {
    if (key === triageOptionsStorageKey('three')) throw new Error('Imported options storage denied')
    return original.call(this, key, value)
  }
  t.after(() => { dom.window.Storage.prototype.setItem = original })
  ui.click('Save')
  assert.equal(ui.dialog().props.open, true)
  assert.equal(localStorage.getItem(SELECTED_TEAM_STORAGE_KEY), team.id)
  assert.ok(find(ui.render(), node => node.type === 'Alert' && /Imported options storage denied/.test(node.props.children)))
})

test('a late global Save failure rolls back imports, deletions, preferences and PAT clearing before any runtime change', async (t) => {
  const { ui, dom, snapshot, runtimeSnapshot } = productionSettings(t)
  localStorage.setItem('standup:azdo-pat', 'legacy-pat')
  localStorage.setItem(tagRulesStorageKey(team.id), '[{"id":"old","tag":"Blocked","action":"Blocked"}]')
  localStorage.setItem(`standup:triage-visits:${team.id}`, '{"old":"visit"}')
  const before = snapshot()
  const beforeRuntime = runtimeSnapshot()
  const patSignal = getPatSessionSignal()
  ui.click('Clear PAT')
  ui.tab('teams')
  ui.click('Remove team')
  const imported = buildTeamDataExport({
    teamProfile: { ...team, id: 'three', displayName: 'Three' },
    assignmentOptions: createDefaultAssignmentOptions(), qaOptions: createDefaultQaOptions(), assignmentTagRules: [],
  })
  ui.node(node => node.type === 'input').props.onChange({
    target: { files: [{ text: async () => JSON.stringify(imported) }], value: '' },
  })
  await Promise.resolve()
  ui.tab('display')
  ui.node(node => node.type === 'Switch' && !node.props.slotProps).props.onChange(null, true)
  ui.node(node => node.type === 'Switch' && !!node.props.slotProps).props.onChange(null, true)
  ui.node(node => node.type === AutoRefreshSettings).props.onChange({ enabled: true, minutes: 7 })
  ui.node(node => node.type === AutoRefreshSettings).props.onMinutesChange('7')
  const originalSet = dom.window.Storage.prototype.setItem
  const originalRemove = dom.window.Storage.prototype.removeItem
  let writesBeforeFailure = 0
  let failed = false
  dom.window.Storage.prototype.setItem = function (key: string, value: string) {
    if (!failed) writesBeforeFailure += 1
    return originalSet.call(this, key, value)
  }
  dom.window.Storage.prototype.removeItem = function (key: string) {
    if (key === 'standup:azdo-pat' && !failed) {
      failed = true
      throw new Error('Late PAT cleanup denied')
    }
    return originalRemove.call(this, key)
  }
  t.after(() => {
    dom.window.Storage.prototype.setItem = originalSet
    dom.window.Storage.prototype.removeItem = originalRemove
  })
  ui.click('Save')
  assert.ok(writesBeforeFailure > 5, 'failure happens after multiple entries were successfully persisted')
  assert.equal(ui.dialog().props.open, true)
  assert.deepEqual(snapshot(), before)
  assert.equal(sessionStorage.getItem('standup:azdo-pat-session'), 'saved-pat')
  assert.deepEqual(runtimeSnapshot(), beforeRuntime)
  assert.equal(patSignal.aborted, false, 'staged PAT clearing does not invalidate the live PAT session on failure')
  assert.ok(find(ui.render(), node => node.type === 'Alert' && /Late PAT cleanup denied/.test(node.props.children)))
  ui.click('Cancel')
  assert.deepEqual(snapshot(), before)
  assert.deepEqual(runtimeSnapshot(), beforeRuntime)
  assert.equal(patSignal.aborted, false)
  ui.open()
  ui.click('Clear PAT')
  ui.tab('teams')
  ui.click('Remove team')
  ui.node(node => node.type === 'input').props.onChange({
    target: { files: [{ text: async () => JSON.stringify(imported) }], value: '' },
  })
  await Promise.resolve()
  ui.tab('display')
  ui.node(node => node.type === 'Switch' && !node.props.slotProps).props.onChange(null, true)
  ui.node(node => node.type === 'Switch' && !!node.props.slotProps).props.onChange(null, true)
  ui.node(node => node.type === AutoRefreshSettings).props.onChange({ enabled: true, minutes: 7 })
  ui.node(node => node.type === AutoRefreshSettings).props.onMinutesChange('7')
  ui.click('Save')
  assert.equal(ui.dialog().props.open, false)
  assert.deepEqual(runtimeSnapshot().teamProfiles.map((entry: TeamProfile) => entry.id), ['two', 'three'])
  assert.equal(runtimeSnapshot().selectedTeamId, 'three')
  assert.equal(runtimeSnapshot().colorScheme, 'dark')
  assert.equal(runtimeSnapshot().rememberLastView, true)
  assert.deepEqual(runtimeSnapshot().autoRefresh, { enabled: true, minutes: 7 })
  assert.equal(runtimeSnapshot().pat, null)
  assert.equal(sessionStorage.getItem('standup:azdo-pat-session'), null)
  assert.equal(localStorage.getItem('standup:azdo-pat'), null)
  assert.equal(localStorage.getItem(qaOptionsStorageKey(team.id)), null)
  assert.equal(localStorage.getItem(tagRulesStorageKey(team.id)), null)
  assert.equal(patSignal.aborted, true)
})

test('global Save explicitly reports rollback failures without applying runtime drafts', (t) => {
  const { ui, dom, runtimeSnapshot } = productionSettings(t)
  const beforeRuntime = runtimeSnapshot()
  const original = dom.window.Storage.prototype.setItem
  dom.window.Storage.prototype.setItem = function (key: string, value: string) {
    if (key === AUTO_REFRESH_STORAGE_KEY || key === TEAM_PROFILES_STORAGE_KEY && /"displayName":"One"/.test(value)) {
      throw new Error('Storage is no longer writable')
    }
    return original.call(this, key, value)
  }
  t.after(() => { dom.window.Storage.prototype.setItem = original })
  ui.tab('teams')
  ui.field('Display name', 'Draft')
  ui.tab('display')
  ui.node(node => node.type === AutoRefreshSettings).props.onChange({ enabled: true, minutes: 15 })
  ui.click('Save')
  assert.equal(ui.dialog().props.open, true)
  assert.deepEqual(runtimeSnapshot(), beforeRuntime)
  assert.ok(find(ui.render(), node => node.type === 'Alert' && /Rollback also failed:.*standup:team-profiles/.test(node.props.children)))
})

test('actual App Development callbacks save multiple fields from one render without losing earlier changes', (t) => {
  productionSettings(t)
  const render = () => {
    hooks.beginRender('actual-app')
    return App({ colorScheme: 'light', onToggleColorScheme() {} })
  }
  const page = find(render(), node => node.type === 'StandupContent')!.props.teamAssignmentsPageProps
  const sprintFilter = { current: false, next: true, nextNext: true, iterationPaths: ['project\\custom'] }
  page.onIncludeWorkItemTypesChange(['Bug', 'Task'])
  page.onSprintFilterChange(sprintFilter)
  page.onHideUsersWithNoActivityChange(true)
  page.onHideUsersWithOnlyStaleDoneWorkChange(true)
  page.onCompactCardsChange(true)
  page.onIncludeQaTestersInStandupChange(true)
  page.onEffortSuggestionsChange([1, 3, 8])
  const saved = JSON.parse(localStorage.getItem(assignmentOptionsStorageKey(team.id))!)
  assert.deepEqual(saved.includeWorkItemTypes, ['Bug', 'Task'])
  assert.deepEqual(saved.sprintFilter, sprintFilter)
  assert.equal(saved.hideUsersWithNoActivity, true)
  assert.equal(saved.hideUsersWithOnlyStaleDoneWork, true)
  assert.equal(saved.compactCards, true)
  assert.equal(saved.includeQaTestersInStandup, true)
  assert.deepEqual(saved.effortSuggestions, [1, 3, 8])
  const reopened = find(render(), node => node.type === 'StandupContent')!.props.teamAssignmentsPageProps
  assert.deepEqual(reopened.sprintFilter, sprintFilter)
  assert.equal(reopened.compactCards, true)
  assert.deepEqual(reopened.effortSuggestions, [1, 3, 8])
})
