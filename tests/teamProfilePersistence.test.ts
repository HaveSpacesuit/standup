import assert from 'node:assert/strict'
import { after, test, type TestContext } from 'node:test'
import { createServer } from 'vite'
import { TEAM_PROFILES_STORAGE_KEY, type TeamProfile } from '../src/appSettings.ts'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: ['react'] },
  plugins: [{
    name: 'profile-state-hook-test',
    enforce: 'pre',
    resolveId: (id) => id === 'react' ? '\0profile-react' : undefined,
    load: (id) => id === '\0profile-react' ? `
      export const useState = (initial) => {
        let value = typeof initial === 'function' ? initial() : initial
        return [value, (next) => { value = typeof next === 'function' ? next(value) : next }]
      }
      export const useRef = (current) => ({ current })
      export const useEffect = () => {}
    ` : undefined,
  }],
})
after(() => server.close())
const { useStandupAppState } = await server.ssrLoadModule('/src/features/standup/hooks/useStandupAppState.ts')

const web: TeamProfile = {
  id: 'web',
  displayName: 'ProjectWise Web',
  orgName: 'organization',
  projectName: 'project',
  areaPath: 'area',
  iterationPath: 'iteration',
  teamName: 'Web',
  repoName: 'repo',
}
const explorer: TeamProfile = { ...web, id: 'explorer', displayName: 'ProjectWise Explorer' }

function setup(t: TestContext) {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  for (const name of ['localStorage', 'sessionStorage']) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value: storage })
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    })
  }
  storage.setItem(TEAM_PROFILES_STORAGE_KEY, JSON.stringify([web, explorer]))
  return { storage, values }
}

test('a stale tab cannot overwrite an unrelated team rename', (t) => {
  const { storage } = setup(t)
  const tabA = useStandupAppState()
  const tabB = useStandupAppState()
  const savedProfiles = [{ ...web, displayName: 'QA Web edited in tab A' }, explorer]

  tabA.handleTeamProfilesChange(savedProfiles)
  assert.throws(
    () => tabB.handleTeamProfilesChange([web, { ...explorer, displayName: 'QA Explorer edited in tab B' }]),
    /changed in another tab.*Reload/,
  )
  assert.deepEqual(JSON.parse(storage.getItem(TEAM_PROFILES_STORAGE_KEY)!), savedProfiles)

  const reloadedTabB = useStandupAppState()
  const updatedProfiles = [savedProfiles[0], { ...explorer, displayName: 'QA Explorer edited in tab B' }]
  reloadedTabB.handleTeamProfilesChange(updatedProfiles)
  assert.deepEqual(JSON.parse(storage.getItem(TEAM_PROFILES_STORAGE_KEY)!), updatedProfiles)
})

test('a tab can save repeatedly after its own writes', (t) => {
  const { storage } = setup(t)
  const tab = useStandupAppState()
  const renamedWeb = { ...web, displayName: 'Renamed Web' }
  tab.handleTeamProfilesChange([renamedWeb, explorer])
  const profiles = [renamedWeb, { ...explorer, displayName: 'Renamed Explorer' }]
  tab.handleTeamProfilesChange(profiles)
  assert.deepEqual(JSON.parse(storage.getItem(TEAM_PROFILES_STORAGE_KEY)!), profiles)
})

test('a storage change during initialization leaves the tab stale', (t) => {
  const { storage } = setup(t)
  const changedProfiles = [{ ...web, displayName: 'Changed during initialization' }, explorer]
  const changedSnapshot = JSON.stringify(changedProfiles)
  const getItem = storage.getItem
  let profileReads = 0
  storage.getItem = (key) => {
    const value = getItem(key)
    if (key === TEAM_PROFILES_STORAGE_KEY) {
      profileReads += 1
      if (profileReads === 2) {
        storage.setItem(TEAM_PROFILES_STORAGE_KEY, changedSnapshot)
      }
    } else if (profileReads === 1) {
      storage.setItem(TEAM_PROFILES_STORAGE_KEY, changedSnapshot)
    }
    return value
  }

  const tab = useStandupAppState()

  assert.throws(
    () => tab.handleTeamProfilesChange([{ ...web, displayName: 'Stale save' }, explorer]),
    /changed in another tab.*Reload/,
  )
  assert.equal(getItem(TEAM_PROFILES_STORAGE_KEY), changedSnapshot)
})

for (const operation of ['remove', 'add', 'reorder', 'import'] as const) {
  test(`a stale ${operation} leaves profiles and per-team options untouched`, (t) => {
    const { storage, values } = setup(t)
    const tab = useStandupAppState()
    for (const key of ['standup:qa-options', 'standup:qa-card-highlight-options', 'standup:assignment-options', 'standup:tag-rules']) {
      storage.setItem(`${key}:${explorer.id}`, '{"saved":"options"}')
    }
    storage.setItem(TEAM_PROFILES_STORAGE_KEY, JSON.stringify([{ ...web, displayName: 'Changed elsewhere' }, explorer]))
    const before = new Map(values)
    const profiles = {
      remove: [web],
      add: [web, explorer, { ...web, id: 'new-team' }],
      reorder: [explorer, web],
      import: [web, { ...explorer, displayName: 'Imported Explorer' }],
    }[operation]

    assert.throws(
      () => operation === 'import' ? tab.replaceTeamProfiles(profiles) : tab.handleTeamProfilesChange(profiles),
      /changed in another tab.*Reload/,
    )
    assert.deepEqual(values, before)
  })
}

test('clearing profiles in another tab cannot be undone by a stale save', (t) => {
  const { storage } = setup(t)
  const tab = useStandupAppState()
  storage.removeItem(TEAM_PROFILES_STORAGE_KEY)
  assert.throws(() => tab.handleTeamProfilesChange([web, explorer]), /changed in another tab.*Reload/)
  assert.equal(storage.getItem(TEAM_PROFILES_STORAGE_KEY), null)
})

test('removing a team still cleans up its options when the snapshot is current', (t) => {
  const { storage } = setup(t)
  const tab = useStandupAppState()
  storage.setItem('standup:tag-rules:explorer', '[]')
  tab.handleTeamProfilesChange([web])
  assert.deepEqual(JSON.parse(storage.getItem(TEAM_PROFILES_STORAGE_KEY)!), [web])
  assert.equal(storage.getItem('standup:tag-rules:explorer'), null)
})
