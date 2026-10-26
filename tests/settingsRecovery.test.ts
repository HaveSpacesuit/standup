import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { loadTeamProfiles, loadTeamProfilesWithRecovery, TEAM_PROFILES_STORAGE_KEY } from '../src/appSettings.ts'
import { parseStoredQaOptions, parseStoredQaOptionsWithRecovery } from '../src/features/standup/utils/qaOptions.ts'

const storage = new Map<string, string>()
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (key: string) => storage.get(key) ?? null },
})
after(() => {
  if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

test('missing settings and intentionally empty profiles do not report corruption', () => {
  storage.clear()
  assert.deepEqual(loadTeamProfilesWithRecovery(), { profiles: [], unreadable: false })
  storage.set(TEAM_PROFILES_STORAGE_KEY, '[]')
  assert.deepEqual(loadTeamProfilesWithRecovery(), { profiles: [], unreadable: false })
  assert.deepEqual(parseStoredQaOptionsWithRecovery(null), { options: parseStoredQaOptions(null), unreadable: false })
})

for (const raw of ['{bad', '', 'null', '42', '"settings"']) {
  test(`malformed settings (${JSON.stringify(raw)}) report recovery and retain the original data`, () => {
    storage.set(TEAM_PROFILES_STORAGE_KEY, raw)
    assert.deepEqual(loadTeamProfilesWithRecovery(), { profiles: [], unreadable: true })
    assert.deepEqual(loadTeamProfiles(), [])
    assert.equal(storage.get(TEAM_PROFILES_STORAGE_KEY), raw)
    assert.deepEqual(parseStoredQaOptionsWithRecovery(raw), { options: parseStoredQaOptions(null), unreadable: true })
  })
}

test('invalid profile containers and partially invalid lists report recovery while retaining valid profiles', () => {
  storage.set(TEAM_PROFILES_STORAGE_KEY, '{}')
  assert.equal(loadTeamProfilesWithRecovery().unreadable, true)
  const profile = {
    id: 'team', orgName: 'org', projectName: 'project', displayName: 'Team',
    areaPath: 'area', iterationPath: 'iteration', teamName: 'Team', repoName: 'repo',
  }
  storage.set(TEAM_PROFILES_STORAGE_KEY, JSON.stringify([profile, null, { id: 'incomplete' }]))
  const result = loadTeamProfilesWithRecovery()
  assert.equal(result.unreadable, true)
  assert.deepEqual(result.profiles.map((team) => team.id), ['team'])
  storage.set(TEAM_PROFILES_STORAGE_KEY, JSON.stringify([profile]))
  assert.equal(loadTeamProfilesWithRecovery().unreadable, false)
})

test('QA arrays report recovery, while readable options retain existing nested normalization', () => {
  assert.equal(parseStoredQaOptionsWithRecovery('[]').unreadable, true)
  const result = parseStoredQaOptionsWithRecovery(JSON.stringify({
    includeWorkItemTypes: ['Bug', 23, null],
    lookbackDays: 'invalid',
    sprintFilter: { current: true, iterationPaths: [false, 'Sprint 1'] },
  }))
  assert.equal(result.unreadable, false)
  assert.deepEqual(result.options.includeWorkItemTypes, ['Bug'])
  assert.equal(result.options.lookbackDays, 21)
  assert.deepEqual(result.options.sprintFilter, { current: true, next: false, nextNext: false, iterationPaths: ['Sprint 1'] })
})
