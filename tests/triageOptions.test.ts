import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { act, createElement } from 'react'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: dom.window.localStorage })
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: dom.window.sessionStorage })
const { createRoot } = await import('react-dom/client')
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(async () => { await server.close(); dom.window.close() })
const { addTriageTags, createDefaultTriageOptions, getActiveTriageOptions, getTriageQueryOptions, parseTriageOptions, triageOptionsStorageKey, loadTriageSettings } =
  await server.ssrLoadModule('/src/features/standup/utils/triageOptions.ts')
const { useStandupAppState } = await server.ssrLoadModule('/src/features/standup/hooks/useStandupAppState.ts')
const { buildTeamDataExport, parseImportedTeamData } = await server.ssrLoadModule('/src/teamDataTransfer.ts')
const { createDefaultAssignmentOptions, createDefaultQaOptions } = await server.ssrLoadModule('/src/features/standup/utils/standupOptionDefaults.ts')
const { createDefaultBacklogOptions } = await server.ssrLoadModule('/src/features/standup/utils/backlogOptions.ts')
const { loadTeamProfilesWithDefaultsAndRecovery } = await server.ssrLoadModule('/src/defaultTeamSeed.ts')
const profile = {
  id: 'triage-a', orgName: 'org', projectName: 'Project', displayName: 'Team A',
  areaPath: 'Project\\A', iterationPath: 'Project', teamName: 'A', repoName: 'repo',
}
const custom = { tags: ['Needs triage'], includeNewBugs: true, excludedIterationPaths: ['Project\\Refine'], ageFlagDays: 3 }

test('Triage defaults to its tag only; explicit empty rules are preserved and lists normalize', () => {
  assert.deepEqual(createDefaultTriageOptions(), { tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2 })
  assert.deepEqual(parseTriageOptions({ tags: [], includeNewBugs: false, excludedIterationPaths: [] }), { tags: [], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2 })
  assert.deepEqual(parseTriageOptions({ tags: [' triage ', '', 'TRIAGE', 'Other'], excludedIterationPaths: [' Project\\Refine '], ageFlagDays: 30 }), {
    tags: ['Other', 'TRIAGE'], includeNewBugs: false, excludedIterationPaths: ['Project\\Refine'], ageFlagDays: 30,
  })
  for (const value of [null, [], { tags: null }, { tags: [1] }, { tags: ['one;two'] }, { includeNewBugs: 'true' }, { excludedIterationPaths: false }]) {
    assert.throws(() => parseTriageOptions(value))
  }
  assert.deepEqual(parseTriageOptions({ excludedIterationPaths: ['Project\\Refine\\', 'Project\\Refine'] }).excludedIterationPaths, ['Project\\Refine'])
  assert.throws(() => parseTriageOptions({ excludedIterationPaths: ['\\'] }), /empty paths/)
  for (const ageFlagDays of [0, 31, 1.5, '2', null, Number.NaN]) {
    assert.throws(() => parseTriageOptions({ ageFlagDays }), /age flag must be a whole number of working days from 1 to 30/)
  }
})

test('adding tags splits on the Azure DevOps separator and keeps the first spelling of a duplicate', () => {
  const tags = ['Triage']
  assert.deepEqual(addTriageTags(tags, '  Needs review  '), ['Triage', 'Needs review'])
  assert.deepEqual(addTriageTags(tags, 'triage; Bug bash ;;BUG BASH; Escalated'), ['Triage', 'Bug bash', 'Escalated'])
  assert.deepEqual(addTriageTags(tags, ' ; '), ['Triage'])
  assert.deepEqual(tags, ['Triage'], 'the given list is not changed')
})

test('excluded iteration paths are inactive while the new-bug rule is off, without being discarded', () => {
  assert.equal(getActiveTriageOptions(custom), custom, 'options in use are returned as-is')
  const off = { ...custom, includeNewBugs: false }
  assert.deepEqual(getActiveTriageOptions(off), { tags: ['Needs triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 3 })
  assert.deepEqual(off.excludedIterationPaths, ['Project\\Refine'])
  const none = { ...off, excludedIterationPaths: [] }
  assert.equal(getActiveTriageOptions(none), none)
})

test('the queue is loaded with only the options that pick its items, so display options do not reload it', () => {
  assert.deepEqual(getTriageQueryOptions(custom), { tags: ['Needs triage'], includeNewBugs: true, excludedIterationPaths: ['Project\\Refine'] })
  assert.deepEqual(getTriageQueryOptions({ ...custom, includeNewBugs: false, ageFlagDays: 9 }), { tags: ['Needs triage'], includeNewBugs: false, excludedIterationPaths: [] })
})

test('unreadable saved options remain intact with an explicit error', () => {
  for (const raw of ['{broken', 'null', '[]', '{"tags":42}']) {
    localStorage.setItem(triageOptionsStorageKey('broken'), raw)
    assert.match(loadTriageSettings('broken').error, /Unable to read/)
    assert.equal(localStorage.getItem(triageOptionsStorageKey('broken')), raw)
  }
})

test('team data round-trips Triage options, defaults old exports and rejects supplied invalid options', () => {
  const payload = buildTeamDataExport({
    teamProfile: profile, assignmentOptions: createDefaultAssignmentOptions(), assignmentTagRules: [],
    qaOptions: createDefaultQaOptions(), backlogOptions: createDefaultBacklogOptions(), triageOptions: custom,
  })
  assert.deepEqual(parseImportedTeamData(JSON.stringify(payload)).triageOptions, custom)
  const { triageOptions: _omitted, ...legacy } = payload
  assert.deepEqual(parseImportedTeamData(JSON.stringify(legacy)).triageOptions, createDefaultTriageOptions())
  for (const triageOptions of [null, [], { tags: [42] }, { includeNewBugs: 'yes' }, { ageFlagDays: 0 }]) {
    assert.throws(() => parseImportedTeamData(JSON.stringify({ ...payload, triageOptions })), /Triage/)
  }
})

test('per-team options persist, reload, report save failures, recover explicitly and are removed with a team', async (t) => {
  localStorage.clear()
  localStorage.setItem('standup:team-profiles', JSON.stringify([profile, { ...profile, id: 'triage-b' }]))
  const root = createRoot(document.createElement('div'))
  let state: ReturnType<typeof useStandupAppState>
  function AppState() { state = useStandupAppState(); return null }
  await act(async () => root.render(createElement(AppState)))
  await act(async () => state.setTriageOptionsForTeam('triage-a', custom))
  assert.deepEqual(state!.triageSettingsByTeam['triage-a'].options, custom)
  assert.deepEqual(state!.triageSettingsByTeam['triage-b'].options, createDefaultTriageOptions())
  assert.deepEqual(loadTriageSettings('triage-a').options, custom)
  const saved = localStorage.getItem(triageOptionsStorageKey('triage-a'))
  const originalSet = dom.window.Storage.prototype.setItem
  dom.window.Storage.prototype.setItem = () => { throw new Error('quota exceeded') }
  await act(async () => {
    assert.throws(() => state.setTriageOptionsForTeam('triage-a', createDefaultTriageOptions()), /Unable to save/)
  })
  dom.window.Storage.prototype.setItem = originalSet
  assert.match(state!.triageSettingsByTeam['triage-a'].error, /quota exceeded/)
  assert.equal(localStorage.getItem(triageOptionsStorageKey('triage-a')), saved)
  await act(async () => state.setTriageOptionsForTeam('triage-a', custom))
  assert.equal(state!.triageSettingsByTeam['triage-a'].error, null)
  await act(async () => state.handleTeamProfilesChange([{ ...profile, id: 'triage-b' }]))
  assert.equal(localStorage.getItem(triageOptionsStorageKey('triage-a')), null)
  assert.equal(state!.triageSettingsByTeam['triage-a'], undefined)
  await act(async () => root.unmount())
  t.after(() => localStorage.clear())
})

test('first-run bundled team settings include Triage defaults', () => {
  localStorage.clear()
  const { profiles } = loadTeamProfilesWithDefaultsAndRecovery()
  assert.ok(profiles.length > 0)
  for (const team of profiles) {
    assert.deepEqual(JSON.parse(localStorage.getItem(triageOptionsStorageKey(team.id))!), createDefaultTriageOptions())
  }
  localStorage.clear()
})
