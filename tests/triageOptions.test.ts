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
const { recordTriageVisit, triageVisitStorageKey } = await server.ssrLoadModule('/src/features/standup/utils/triageVisits.ts')
const { addTriageNotDuplicate, loadTriageNotDuplicates, MAX_TRIAGE_NOT_DUPLICATES, triageNotDuplicatesStorageKey } =
  await server.ssrLoadModule('/src/features/standup/utils/triageNotDuplicates.ts')
const profile = {
  id: 'triage-a', orgName: 'org', projectName: 'Project', displayName: 'Team A',
  areaPath: 'Project\\A', iterationPath: 'Project', teamName: 'A', repoName: 'repo',
}
const defaultChecks = { bug: ['severity', 'impact', 'effort', 'reproSteps'], other: ['effort', 'acceptanceCriteria'] }
const defaultSimilar = { openBugs: true, closedBugs: true, closedDays: 180 }
const custom = {
  tags: ['Needs triage'], includeNewBugs: true, excludedIterationPaths: ['Project\\Refine'], ageFlagDays: 3,
  readinessChecks: { bug: ['severity', 'reproSteps'], other: [] }, waitingTags: ['Awaiting QA', 'Needs Info'],
  similarItems: { openBugs: false, closedBugs: true, closedDays: 90 },
}

test('Triage defaults to its tag only; explicit empty rules are preserved and lists normalize', () => {
  assert.deepEqual(createDefaultTriageOptions(), {
    tags: ['Triage'], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks: defaultChecks, waitingTags: ['Needs Info'],
    similarItems: defaultSimilar,
  })
  assert.deepEqual(parseTriageOptions({ tags: [], includeNewBugs: false, excludedIterationPaths: [] }), {
    tags: [], includeNewBugs: false, excludedIterationPaths: [], ageFlagDays: 2, readinessChecks: defaultChecks, waitingTags: ['Needs Info'],
    similarItems: defaultSimilar,
  })
  assert.deepEqual(parseTriageOptions({ tags: [' triage ', '', 'TRIAGE', 'Other'], excludedIterationPaths: [' Project\\Refine '], ageFlagDays: 30 }), {
    tags: ['Other', 'TRIAGE'], includeNewBugs: false, excludedIterationPaths: ['Project\\Refine'], ageFlagDays: 30, readinessChecks: defaultChecks,
    waitingTags: ['Needs Info'], similarItems: defaultSimilar,
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

test('waiting tags normalize like Triage tags, may be empty, and reject lists and separators', () => {
  assert.deepEqual(parseTriageOptions({ waitingTags: [' needs info ', 'NEEDS INFO', 'Blocked', ''] }).waitingTags, ['Blocked', 'NEEDS INFO'])
  assert.deepEqual(parseTriageOptions({ waitingTags: [] }).waitingTags, [])
  assert.throws(() => parseTriageOptions({ waitingTags: 'Needs Info' }), /waiting tags must be a list of strings/)
  assert.throws(() => parseTriageOptions({ waitingTags: ['Needs; Info'] }), /without semicolons/)
})

test('similar items options default each missing field and reject anything but on, off and 1 to 365 days', () => {
  assert.deepEqual(parseTriageOptions({ similarItems: { closedBugs: false } }).similarItems, { ...defaultSimilar, closedBugs: false })
  assert.deepEqual(parseTriageOptions({ similarItems: { openBugs: false, closedDays: 365 } }).similarItems,
    { openBugs: false, closedBugs: true, closedDays: 365 })
  for (const similarItems of [null, [], 'on']) {
    assert.throws(() => parseTriageOptions({ similarItems }), /similar items must be an object/)
  }
  assert.throws(() => parseTriageOptions({ similarItems: { openBugs: 'yes' } }), /must be true or false/)
  for (const closedDays of [0, 366, 1.5, '30', null, Number.NaN]) {
    assert.throws(() => parseTriageOptions({ similarItems: { closedDays } }), /whole number of days from 1 to 365/)
  }
})

test('pairs marked as not duplicates are kept per team, oldest dropped first, and survive storage failures', () => {
  localStorage.clear()
  assert.deepEqual(loadTriageNotDuplicates('a'), [])
  let pairs = addTriageNotDuplicate('a', [], '10:20')
  pairs = addTriageNotDuplicate('a', pairs, '5:30')
  assert.deepEqual(addTriageNotDuplicate('a', pairs, '10:20'), ['5:30', '10:20'], 'marking a pair again moves it to the newest')
  assert.deepEqual(loadTriageNotDuplicates('a'), ['5:30', '10:20'])
  assert.deepEqual(loadTriageNotDuplicates('b'), [], 'each team has its own pairs')
  const full = Array.from({ length: MAX_TRIAGE_NOT_DUPLICATES }, (_, index) => `${index}:${index + 1000}`)
  const capped = addTriageNotDuplicate('a', full, '1:2')
  assert.equal(capped.length, MAX_TRIAGE_NOT_DUPLICATES)
  assert.deepEqual([capped[0], capped.at(-1)], ['1:1001', '1:2'], 'the oldest pair is forgotten first')
  localStorage.setItem(triageNotDuplicatesStorageKey('c'), JSON.stringify(['1:2', 'bad', 3, '4:5']))
  assert.deepEqual(loadTriageNotDuplicates('c'), ['1:2', '4:5'], 'unreadable entries are skipped')
  for (const raw of ['{broken', '{"1:2":true}']) {
    localStorage.setItem(triageNotDuplicatesStorageKey('c'), raw)
    assert.deepEqual(loadTriageNotDuplicates('c'), [], raw)
  }
  const originalSet = dom.window.Storage.prototype.setItem
  dom.window.Storage.prototype.setItem = () => { throw new Error('quota exceeded') }
  try {
    assert.deepEqual(addTriageNotDuplicate('d', ['1:2'], '3:4'), ['1:2', '3:4'], 'the page still updates when storage cannot be written')
  } finally {
    dom.window.Storage.prototype.setItem = originalSet
  }
  localStorage.clear()
})

test('a visit returns the last time Triage was open on an earlier day, the same answer all day, per team', () => {
  localStorage.clear()
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 3, day, hour, minute).getTime()
  assert.equal(recordTriageVisit('a', at(6, 9)), null, 'nothing is new on the first visit')
  assert.equal(recordTriageVisit('a', at(6, 16, 12)), null, 'or again that day')
  assert.equal(recordTriageVisit('a', at(7, 9, 5)), at(6, 16, 12), 'the next day counts from the last visit the day before')
  assert.equal(recordTriageVisit('a', at(7, 13)), at(6, 16, 12), 'reloading later that day keeps the same answer')
  assert.equal(recordTriageVisit('a', at(10, 8)), at(7, 13), 'after a weekend, from the last visit before it')
  assert.equal(recordTriageVisit('b', at(10, 8)), null, 'each team has its own visits')
  for (const raw of ['{broken', '{"day":1}', '[]']) {
    localStorage.setItem(triageVisitStorageKey('c'), raw)
    assert.equal(recordTriageVisit('c', at(10, 9)), null, raw)
  }
  const originalSet = dom.window.Storage.prototype.setItem
  dom.window.Storage.prototype.setItem = () => { throw new Error('quota exceeded') }
  try {
    assert.equal(recordTriageVisit('a', at(11, 9)), at(10, 8), 'storage that cannot be written does not break the page')
  } finally {
    dom.window.Storage.prototype.setItem = originalSet
  }
  localStorage.clear()
})

test('readiness checks keep one order per list, may be empty, and reject unknown checks', () => {
  assert.deepEqual(parseTriageOptions({ readinessChecks: { bug: ['reproSteps', 'severity', 'reproSteps'], other: ['description', 'effort'] } }).readinessChecks,
    { bug: ['severity', 'reproSteps'], other: ['effort', 'description'] })
  assert.deepEqual(parseTriageOptions({ readinessChecks: { bug: [], other: [] } }).readinessChecks, { bug: [], other: [] })
  for (const readinessChecks of [null, [], 'severity']) {
    assert.throws(() => parseTriageOptions({ readinessChecks }), /readiness checks must be an object with bug and other lists/)
  }
  for (const readinessChecks of [{ bug: [] }, { bug: ['priority'], other: [] }, { bug: [], other: 'effort' }]) {
    assert.throws(() => parseTriageOptions({ readinessChecks }), /readiness checks must be lists of: severity, impact, effort, reproSteps/)
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
  assert.deepEqual(getActiveTriageOptions(off), { ...off, excludedIterationPaths: [] })
  assert.deepEqual(off.excludedIterationPaths, ['Project\\Refine'])
  const none = { ...off, excludedIterationPaths: [] }
  assert.equal(getActiveTriageOptions(none), none)
})

test('the queue is loaded with only the options that pick its items, so display options do not reload it', () => {
  assert.deepEqual(getTriageQueryOptions(custom), { tags: ['Needs triage'], includeNewBugs: true, excludedIterationPaths: ['Project\\Refine'] })
  assert.deepEqual(getTriageQueryOptions({ ...custom, includeNewBugs: false, ageFlagDays: 9, readinessChecks: { bug: [], other: [] } }),
    { tags: ['Needs triage'], includeNewBugs: false, excludedIterationPaths: [] })
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
  for (const triageOptions of [
    null, [], { tags: [42] }, { includeNewBugs: 'yes' }, { ageFlagDays: 0 }, { readinessChecks: { bug: ['bogus'], other: [] } },
    { similarItems: { closedDays: 0 } },
  ]) {
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
  recordTriageVisit('triage-a')
  addTriageNotDuplicate('triage-a', [], '1:2')
  await act(async () => state.handleTeamProfilesChange([{ ...profile, id: 'triage-b' }]))
  assert.equal(localStorage.getItem(triageOptionsStorageKey('triage-a')), null)
  assert.equal(localStorage.getItem(triageVisitStorageKey('triage-a')), null, 'the team’s Triage visits go with it')
  assert.equal(localStorage.getItem(triageNotDuplicatesStorageKey('triage-a')), null, 'and its pairs marked as not duplicates')
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
